import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, UserPlus, UserMinus, Search, UsersRound, Plus, Send, ArrowLeft, RefreshCw, ShieldCheck, Users, Check, X } from 'lucide-react';
import { supabase } from './lib/supabase';
import './Community.css';

export default function Community({ mode, user }) {
  const [profiles, setProfiles] = useState([]);
  const [follows, setFollows] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [groupOpen, setGroupOpen] = useState(false);
  const [directOpen, setDirectOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [followingOnly, setFollowingOnly] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');

  const loadCommunity = useCallback(async () => {
    if (!supabase || !user?.id) return;
    const [profileResult, followResult, membershipResult] = await Promise.all([
      supabase.from('profiles').select('user_id,display_name').order('display_name'),
      supabase.from('user_follows').select('follower_id,followed_id'),
      supabase.from('conversation_members').select('conversation_id').eq('user_id', user.id)
    ]);
    const error = profileResult.error || followResult.error || membershipResult.error;
    if (error) {
      setNotice('Social features need the Supabase migration. Run 202610250002_social_follows_chats.sql in SQL Editor.');
      return;
    }
    setProfiles((profileResult.data || []).filter(profile => profile.user_id !== user.id));
    setFollows(followResult.data || []);
    const ids = [...new Set((membershipResult.data || []).map(row => row.conversation_id))];
    if (!ids.length) { setConversations([]); return; }
    const [conversationResult, membersResult, latestResult] = await Promise.all([
      supabase.from('conversations').select('id,title,is_group,created_by,created_at,last_message_at').in('id', ids).order('last_message_at', { ascending: false }),
      supabase.from('conversation_members').select('conversation_id,user_id,role').in('conversation_id', ids),
      supabase.from('messages').select('conversation_id,body,created_at,sender_id').in('conversation_id', ids).order('created_at', { ascending: false }).limit(100)
    ]);
    if (conversationResult.error || membersResult.error) {
      setNotice('Could not load chats. Check that the social migration ran successfully.');
      return;
    }
    const memberRows = membersResult.data || [];
    const profileMap = new Map((profileResult.data || []).map(p => [p.user_id, p.display_name]));
    const lastByConversation = new Map();
    (latestResult.data || []).forEach(message => {
      if (!lastByConversation.has(message.conversation_id)) lastByConversation.set(message.conversation_id, message);
    });
    setConversations((conversationResult.data || []).map(chat => {
      const others = memberRows.filter(m => m.conversation_id === chat.id && m.user_id !== user.id);
      return {
        ...chat,
        members: memberRows.filter(m => m.conversation_id === chat.id),
        displayTitle: chat.is_group ? (chat.title || 'Group chat') : (profileMap.get(others[0]?.user_id) || 'Direct chat'),
        preview: lastByConversation.get(chat.id)?.body || 'No messages yet'
      };
    }));
  }, [user?.id]);

  useEffect(() => { loadCommunity(); }, [loadCommunity]);

  useEffect(() => {
    if (!supabase || !selectedChat?.id || !user?.id) { setMessages([]); return undefined; }
    let alive = true;
    const loadMessages = async () => {
      const { data, error } = await supabase.from('messages').select('id,conversation_id,sender_id,body,created_at').eq('conversation_id', selectedChat.id).order('created_at', { ascending: true }).limit(300);
      if (!alive) return;
      if (error) setNotice('Could not load messages. Check chat database permissions.');
      else setMessages(data || []);
    };
    loadMessages();
    const channel = supabase.channel('fmf-chat-' + selectedChat.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'conversation_id=eq.' + selectedChat.id }, payload => {
        setMessages(current => current.some(m => m.id === payload.new.id) ? current : [...current, payload.new]);
        loadCommunity();
      }).subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [selectedChat?.id, user?.id, loadCommunity]);

  const followingIds = useMemo(() => new Set(follows.filter(row => row.follower_id === user?.id).map(row => row.followed_id)), [follows, user?.id]);
  const followerIds = useMemo(() => new Set(follows.filter(row => row.followed_id === user?.id).map(row => row.follower_id)), [follows, user?.id]);
  const visibleProfiles = useMemo(() => profiles.filter(profile => {
    const name = (profile.display_name || 'Member').toLowerCase();
    const matchesSearch = name.includes(query.toLowerCase());
    return matchesSearch && (!followingOnly || followingIds.has(profile.user_id));
  }), [profiles, query, followingOnly, followingIds]);

  async function toggleFollow(profile) {
    if (!supabase || busy) return;
    setBusy(true); setNotice('');
    const isFollowing = followingIds.has(profile.user_id);
    const result = isFollowing
      ? await supabase.from('user_follows').delete().eq('follower_id', user.id).eq('followed_id', profile.user_id)
      : await supabase.from('user_follows').insert({ follower_id: user.id, followed_id: profile.user_id });
    if (result.error) setNotice(result.error.message || 'Could not update follow status.');
    else {
      setFollows(current => isFollowing
        ? current.filter(row => !(row.follower_id === user.id && row.followed_id === profile.user_id))
        : [...current, { follower_id: user.id, followed_id: profile.user_id }]);
      setNotice(isFollowing ? 'Unfollowed ' + profile.display_name + '.' : 'Now following ' + profile.display_name + '.');
    }
    setBusy(false);
  }

  async function startDirect(profile) {
    if (!supabase || busy) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('fmf_create_conversation', { p_title: null, p_is_group: false, p_member_ids: [profile.user_id] });
    if (error) setNotice(error.message || 'Could not create direct chat.');
    else {
      await loadCommunity();
      setDirectOpen(false);
      setSelectedChat({ id: data, is_group: false, displayTitle: profile.display_name, title: null });
    }
    setBusy(false);
  }

  async function createGroup(event) {
    event.preventDefault();
    if (!groupName.trim() || selectedMembers.length < 1 || !supabase || busy) {
      setNotice('Enter a group name and select at least one other registered member.');
      return;
    }
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('fmf_create_conversation', { p_title: groupName.trim(), p_is_group: true, p_member_ids: selectedMembers });
    if (error) setNotice(error.message || 'Could not create group chat.');
    else {
      setGroupOpen(false); setGroupName(''); setSelectedMembers([]);
      await loadCommunity();
      setSelectedChat({ id: data, is_group: true, displayTitle: groupName.trim(), title: groupName.trim() });
      setNotice('Group chat created. Send your first message.');
    }
    setBusy(false);
  }

  async function createGroupInvite() {
    if (!supabase || !selectedChat?.id || !selectedChat.is_group || busy) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('fmf_create_group_invite', { p_conversation_id: selectedChat.id });
    if (error) {
      setNotice('Could not create an invite. Run migration 004 for group invitation codes.');
    } else {
      const code = data?.[0]?.invite_code;
      const expiry = data?.[0]?.expires_at;
      if (!code) setNotice('The invite was created but no code was returned. Please refresh and try again.');
      else {
        try {
          await navigator.clipboard.writeText(code);
          setNotice('Invite code ' + code + ' copied. It expires ' + (expiry ? new Date(expiry).toLocaleString() : 'in 7 days') + '.');
        } catch {
          setNotice('Share this invite code: ' + code + '. It expires ' + (expiry ? new Date(expiry).toLocaleString() : 'in 7 days') + '.');
        }
      }
    }
    setBusy(false);
  }

  async function joinGroup(event) {
    event.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || !supabase || busy) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('fmf_join_group_by_code', { p_invite_code: code });
    if (error) {
      setNotice(error.message || 'Could not join group. Check the code and migration 004.');
    } else {
      setJoinOpen(false);
      setJoinCode('');
      await loadCommunity();
      setSelectedChat({ id: data, is_group: true, displayTitle: 'Group chat', title: 'Group chat' });
      setNotice('You joined the group. Open it to see messages.');
    }
    setBusy(false);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !selectedChat || !supabase || busy) return;
    setBusy(true);
    const { error } = await supabase.from('messages').insert({ conversation_id: selectedChat.id, sender_id: user.id, body });
    if (error) setNotice(error.message || 'Message was not sent.');
    else { setDraft(''); await loadCommunity(); }
    setBusy(false);
  }

  if (!supabase) return <section className="community-panel"><h2>Connect with registered members</h2><p>Supabase is not configured. Add your project URL and publishable key to frontend/.env.local.</p></section>;

  return <section className="community-panel">
    <div className="community-header">
      <div><span className="hero-chip">{mode === 'chats' ? <MessageCircle size={13} /> : <UsersRound size={13} />} {mode === 'chats' ? 'MESSAGES' : 'YOUR COMMUNITY'}</span>
        <h2>{mode === 'chats' ? 'Chats' : 'Find people'}</h2>
        <p>{mode === 'chats' ? 'Private direct messages and group conversations with registered accounts.' : 'Follow registered members, unfollow anytime, or start a direct conversation.'}</p>
      </div>
      {mode === 'chats' && <div className="chat-create-actions"><button className="outline-button" onClick={() => setDirectOpen(true)}><MessageCircle size={16} />New chat</button><button className="outline-button" onClick={() => setJoinOpen(true)}>Join with code</button><button className="primary-button" onClick={() => setGroupOpen(true)}><Plus size={17} />Create group</button></div>}
    </div>

    {notice && <div className="community-notice" role="status"><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss"><X size={15} /></button></div>}

    {mode === 'friends' ? <>
      <div className="community-toolbar">
        <div className="community-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search registered members…" aria-label="Search registered members" /></div>
        <button className={followingOnly ? 'filter-pill selected' : 'filter-pill'} onClick={() => setFollowingOnly(value => !value)}>{followingOnly ? <Check size={15} /> : <Users size={15} />}Following ({followingIds.size})</button>
      </div>
      <div className="social-stats"><span><strong>{profiles.length}</strong> registered members</span><span><strong>{followingIds.size}</strong> following</span><span><strong>{followerIds.size}</strong> followers</span></div>
      {visibleProfiles.length ? <div className="member-grid">{visibleProfiles.map(profile => <article className="member-card" key={profile.user_id}>
        <div className="member-avatar">{(profile.display_name || 'M').charAt(0).toUpperCase()}</div>
        <div className="member-info"><h3>{profile.display_name || 'Member'}</h3><p>{followerIds.has(profile.user_id) ? 'Follows you' : 'Find My Family member'}</p></div>
        <div className="member-actions"><button className={followingIds.has(profile.user_id) ? 'outline-button' : 'primary-button'} disabled={busy} onClick={() => toggleFollow(profile)}>{followingIds.has(profile.user_id) ? <><UserMinus size={15} />Unfollow</> : <><UserPlus size={15} />Follow</>}</button><button className="outline-button" disabled={busy} onClick={() => startDirect(profile)}><MessageCircle size={15} />Message</button></div>
      </article>)}</div> : <div className="community-empty"><UsersRound size={25} /><h3>{followingOnly ? 'You are not following anyone yet' : 'No registered members found'}</h3><p>{followingOnly ? 'Turn off the Following filter to discover members.' : 'Other people appear here after they create an account in Find My Family.'}</p></div>}
    </> : <div className="chat-layout">
      <aside className={selectedChat ? 'chat-list-pane chat-list-hidden-mobile' : 'chat-list-pane'}>
        <div className="chat-list-title"><div><h3>Your conversations</h3><p>{conversations.length} chats</p></div><button className="icon-button" onClick={loadCommunity} aria-label="Refresh chats"><RefreshCw size={16} /></button></div>
        <div className="community-search chat-search"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chats…" aria-label="Search chats" /></div>
        <div className="chat-list">{conversations.filter(chat => chat.displayTitle.toLowerCase().includes(query.toLowerCase())).map(chat => <button key={chat.id} className={selectedChat?.id === chat.id ? 'chat-list-item selected' : 'chat-list-item'} onClick={() => setSelectedChat(chat)}><span className={chat.is_group ? 'chat-avatar group-chat-avatar' : 'chat-avatar'}>{chat.is_group ? <UsersRound size={18} /> : chat.displayTitle.charAt(0).toUpperCase()}</span><span className="chat-list-copy"><strong>{chat.displayTitle}</strong><small>{chat.preview}</small></span><span className="chat-kind">{chat.is_group ? 'GROUP' : 'DIRECT'}</span></button>)}
          {!conversations.length && <div className="chat-list-empty"><MessageCircle size={24} /><p>No chats yet.</p><span>Use Friends to message a member, or create a group.</span></div>}
        </div>
        <button className="new-chat-link" onClick={() => setDirectOpen(true)}><MessageCircle size={16} />Start a direct chat</button><button className="new-chat-link secondary-new-chat" onClick={() => setJoinOpen(true)}>Join a group with code</button><button className="new-chat-link secondary-new-chat" onClick={() => setGroupOpen(true)}><Plus size={16} />Create a group chat</button>
      </aside>
      <section className={selectedChat ? 'chat-window chat-window-visible-mobile' : 'chat-window'}>
        {selectedChat ? <>
          <header className="chat-window-header"><button className="icon-button chat-back" onClick={() => setSelectedChat(null)} aria-label="Back to chats"><ArrowLeft size={18} /></button><span className={selectedChat.is_group ? 'chat-avatar group-chat-avatar' : 'chat-avatar'}>{selectedChat.is_group ? <UsersRound size={18} /> : selectedChat.displayTitle.charAt(0).toUpperCase()}</span><div className="chat-header-copy"><h3>{selectedChat.displayTitle}</h3><p>{selectedChat.is_group ? 'Group conversation' : 'Direct conversation'}</p></div>{selectedChat.is_group && <button className="outline-button" disabled={busy} onClick={createGroupInvite}>Invite code</button>}</header>
          <div className="message-stream">{messages.length ? messages.map(message => <div key={message.id} className={message.sender_id === user.id ? 'message-row own-message' : 'message-row'}><div className="message-bubble">{selectedChat.is_group && message.sender_id !== user.id && <strong className="message-sender">{profiles.find(profile => profile.user_id === message.sender_id)?.display_name || 'Member'}</strong>}<p>{message.body}</p><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div></div>) : <div className="chat-welcome"><MessageCircle size={27} /><h3>Say hello 👋</h3><p>Your conversation is ready. Send a message to begin.</p></div>}</div>
          <form className="message-composer" onSubmit={sendMessage}><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Write a message…" aria-label="Message text" maxLength={4000} /><button type="submit" className="primary-button" disabled={!draft.trim() || busy}><Send size={17} />Send</button></form>
        </> : <div className="chat-welcome"><MessageCircle size={34} /><h3>Your conversations</h3><p>Choose a chat from the list, message someone from Friends, or create a group with registered members.</p><button className="primary-button" onClick={() => setGroupOpen(true)}><Plus size={17} />Create group chat</button></div>}
      </section>
    </div>}

    {directOpen && <div className="modal-backdrop community-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setDirectOpen(false); }}><section className="person-modal community-modal" role="dialog" aria-modal="true" aria-labelledby="direct-modal-title"><div className="modal-heading"><div><div className="eyebrow">YOUR COMMUNITY</div><h2 id="direct-modal-title">Start a direct chat</h2><p>Choose a registered Find My Family member.</p></div><button className="icon-button close-modal" onClick={() => setDirectOpen(false)} aria-label="Close"><X size={19} /></button></div><div className="direct-member-list">{profiles.map(profile => <div key={profile.user_id} className="direct-member-option"><span className="member-avatar small-member-avatar">{(profile.display_name || 'M').charAt(0).toUpperCase()}</span><span>{profile.display_name || 'Member'}</span><button className="outline-button" disabled={busy} onClick={() => startDirect(profile)}><MessageCircle size={15} />Message</button></div>)}{!profiles.length && <p className="community-empty">No other registered accounts found yet.</p>}</div></section></div>}

    {groupOpen && <div className="modal-backdrop community-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setGroupOpen(false); }}><section className="person-modal community-modal" role="dialog" aria-modal="true" aria-labelledby="group-modal-title"><div className="modal-heading"><div><div className="eyebrow">YOUR COMMUNITY</div><h2 id="group-modal-title">Create a group chat</h2><p>Choose at least one other registered member.</p></div><button className="icon-button close-modal" onClick={() => setGroupOpen(false)} aria-label="Close"><X size={19} /></button></div><form onSubmit={createGroup}><div className="form-field"><label htmlFor="group-name">Group name *</label><input id="group-name" value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="e.g. Family group" required maxLength={80} /></div><div className="group-member-picker"><label>Choose members ({selectedMembers.length} selected)</label>{profiles.map(profile => <label key={profile.user_id} className="group-member-option"><input type="checkbox" checked={selectedMembers.includes(profile.user_id)} onChange={event => setSelectedMembers(current => event.target.checked ? [...current, profile.user_id] : current.filter(id => id !== profile.user_id))} /><span className="member-avatar small-member-avatar">{(profile.display_name || 'M').charAt(0).toUpperCase()}</span><span>{profile.display_name || 'Member'}</span></label>)}{!profiles.length && <p>No other registered members are available yet.</p>}</div><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setGroupOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy || selectedMembers.length < 1}><UsersRound size={17} />Create group</button></div></form></section></div>}
    {joinOpen && <div className="modal-backdrop community-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setJoinOpen(false); }}><section className="person-modal community-modal" role="dialog" aria-modal="true" aria-labelledby="join-group-title"><div className="modal-heading"><div><div className="eyebrow">YOUR COMMUNITY</div><h2 id="join-group-title">Join a group</h2><p>Enter an active invitation code shared by a group member.</p></div><button className="icon-button close-modal" onClick={() => setJoinOpen(false)} aria-label="Close"><X size={19} /></button></div><form onSubmit={joinGroup}><div className="form-field"><label htmlFor="group-invite-code">Invitation code *</label><input id="group-invite-code" value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase())} placeholder="FMF-ABC123456" maxLength={14} autoCapitalize="characters" required /></div><p className="community-privacy">Codes expire after seven days. Only share them with people you trust.</p><div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setJoinOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={busy || !joinCode.trim()}>{busy ? 'Joining…' : 'Join group'}</button></div></form></section></div>}
    <p className="community-privacy"><ShieldCheck size={14} /> Chats are visible only to their members. Registered members can follow or unfollow each other.</p>
  </section>;
}

import { useEffect, useMemo, useState } from 'react';
import {
  UsersRound, Mail, Lock, Eye, EyeOff, MapPin, ShieldCheck, Home,
  Users, UserRoundPlus, UserRound, Phone, Navigation, Search, LogOut,
  Plus, X, Pencil, Trash2, MapPinned, Compass, Heart, CheckCircle2, ImagePlus,
  AlertCircle, Menu, LocateFixed, MessageCircle
} from 'lucide-react';
import { supabase } from './lib/supabase';
import { LiveLocationShare, SharedLocationPage } from './LiveLocationShare';
import Community from './Community';
import './App.css';

const CONTACTS_KEY = 'fmf-contacts-v1';

function normalizeContacts(records) {
  if (!Array.isArray(records)) return [];
  return records.map(person => ({
    ...person,
    id: String(person.id ?? Date.now() + Math.random()),
    type: person.type === 'friend' || person.type === 'friends' ? 'friends' : 'family',
    location: person.location || (person.lat != null && person.lng != null ? 'Saved GPS location' : '')
  }));
}

function readLocalContacts(userId) {
  try {
    const accountKey = `${CONTACTS_KEY}:${userId}`;
    const saved = localStorage.getItem(accountKey);
    if (saved) return normalizeContacts(JSON.parse(saved));
    // One-time migration: move old device-only contacts to the first account that opens this version.
    const legacy = localStorage.getItem(CONTACTS_KEY) || localStorage.getItem('find-my-family-people-v1');
    if (!legacy) return [];
    const records = normalizeContacts(JSON.parse(legacy));
    localStorage.setItem(accountKey, JSON.stringify(records));
    localStorage.removeItem(CONTACTS_KEY);
    localStorage.removeItem('find-my-family-people-v1');
    return records;
  } catch {
    return [];
  }
}

function Brand({ small = false }) {
  return (
    <div className={`brand-lockup ${small ? 'brand-lockup-small' : ''}`}>
      <div className="brand-mark"><UsersRound size={small ? 22 : 27} strokeWidth={2.2} /><span className="brand-pin"><MapPin size={12} /></span></div>
      <div><div className="brand-name">Find My Family</div>{!small && <div className="brand-caption">Together, wherever life takes you.</div>}</div>
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState('home');
  const [contacts, setContacts] = useState([]);
  const [contactsLoadedFor, setContactsLoadedFor] = useState(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', relation: '', phone: '', location: '', type: 'family', lat: '', lng: '', photoUrl: '' });
  const [locationBusy, setLocationBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!supabase) { setAuthReady(true); return undefined; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) { setUser(data.session?.user ?? null); setAuthReady(true); }
    }).catch(() => { if (alive) setAuthReady(true); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setUser(session?.user ?? null);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!user?.id || !supabase) {
      setContacts([]);
      setContactsLoadedFor(null);
      return () => { alive = false; };
    }
    setContactsLoadedFor(null);
    async function loadContacts() {
      const localContacts = readLocalContacts(user.id);
      const { data, error } = await supabase.from('contact_books').select('contacts').eq('user_id', user.id).maybeSingle();
      if (!alive) return;
      if (error) {
        setContacts(localContacts);
        setNotice('Cloud contacts could not load. Showing this account’s saved contacts on this device.');
      } else if (data?.contacts && Array.isArray(data.contacts)) {
        setContacts(normalizeContacts(data.contacts));
      } else {
        setContacts(localContacts);
        if (localContacts.length) {
          const { error: saveError } = await supabase.from('contact_books').upsert({ user_id: user.id, contacts: localContacts, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
          if (saveError && alive) setNotice('Contacts are local for now. Cloud sync needs the latest Supabase migration.');
        }
      }
      if (alive) setContactsLoadedFor(user.id);
    }
    loadContacts().catch(() => {
      if (alive) {
        setContacts(readLocalContacts(user.id));
        setContactsLoadedFor(user.id);
        setNotice('Cloud contacts could not load. Check your connection and Supabase setup.');
      }
    });
    return () => { alive = false; };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || contactsLoadedFor !== user.id) return;
    try { localStorage.setItem(`${CONTACTS_KEY}:${user.id}`, JSON.stringify(contacts)); } catch { /* storage may be unavailable */ }
    if (!supabase) return;
    const timer = window.setTimeout(async () => {
      const { error } = await supabase.from('contact_books').upsert({
        user_id: user.id,
        contacts,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
      if (error) setNotice('Contacts are saved on this device, but cloud sync failed. Check that migration 003 has been run.');
    }, 400);
    return () => window.clearTimeout(timer);
  }, [contacts, contactsLoadedFor, user?.id]);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage('');
    if (!supabase) {
      setMessage('Supabase is not configured. Check frontend/.env.local and restart the frontend.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        if (data.session && data.user) {
          setUser(data.user);
          setMessage('');
        } else {
          setMessage('Account created. Check your email to confirm your account, then sign in.');
          setMode('login');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setUser(data.user);
        setMessage('');
        setPage('home');
      }
    } catch (error) {
      setMessage(error.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) { setNotice(error.message); return; }
    }
    setUser(null);
    setMessage('');
    setPage('home');
  }

  function openAdd(type = 'family') {
    setEditing(null);
    setForm({ name: '', relation: '', phone: '', location: '', type, lat: '', lng: '', photoUrl: '' });
    setShowForm(true);
    setNotice('');
  }

  function openEdit(person) {
    setEditing(person.id);
    setForm({ ...person });
    setShowForm(true);
    setNotice('');
  }

  function savePerson(event) {
    event.preventDefault();
    const clean = { ...form, name: form.name.trim(), relation: form.relation.trim(), phone: form.phone.trim(), location: form.location.trim(), photoUrl: form.photoUrl || '' };
    if (!clean.name) return;
    if (editing) setContacts(current => current.map(person => person.id === editing ? { ...person, ...clean } : person));
    else setContacts(current => [{ ...clean, id: String(Date.now()) }, ...current]);
    setShowForm(false);
    setNotice(editing ? 'Contact updated.' : 'Contact saved.');
  }

  function handlePhotoUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { setNotice('Choose an image file, such as JPG, PNG, or WEBP.'); return; }
    if (file.size > 8 * 1024 * 1024) { setNotice('Choose a photo smaller than 8 MB.'); return; }
    const reader = new FileReader();
    reader.onerror = () => setNotice('Could not read that photo. Please try another image.');
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => setNotice('That image could not be opened. Please try another photo.');
      image.onload = () => {
        const maxSide = 480;
        const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext('2d');
        if (!context) { setNotice('Photo editing is not available in this browser.'); return; }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const photoUrl = canvas.toDataURL('image/jpeg', 0.76);
        if (photoUrl.length > 700000) { setNotice('This photo is too large after compression. Try a smaller image.'); return; }
        setForm(current => ({ ...current, photoUrl }));
        setNotice('Photo added. Save the person to sync it to your account.');
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function captureLocation() {
    if (!navigator.geolocation) { setNotice('This browser does not support location.'); return; }
    setLocationBusy(true);
    setNotice('');
    navigator.geolocation.getCurrentPosition(position => {
      setForm(current => ({
        ...current,
        lat: String(position.coords.latitude),
        lng: String(position.coords.longitude),
        location: current.location || 'Saved GPS location'
      }));
      setLocationBusy(false);
      setNotice('GPS coordinates added. Save the contact to sync them to your account.');
    }, error => {
      setLocationBusy(false);
      setNotice(error.code === 1 ? 'Location permission was denied. Allow location access in your browser and try again.' : 'Could not get your location. Check GPS and try again.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }

  const filteredContacts = useMemo(() => contacts.filter(person => {
    const matchesPage = page === 'family' || page === 'friends' ? person.type === page : true;
    const query = search.toLowerCase();
    return matchesPage && [person.name, person.relation, person.phone, person.location].some(value => String(value || '').toLowerCase().includes(query));
  }), [contacts, page, search]);

  const incomingShareToken = new URLSearchParams(window.location.search).get('share');
  if (incomingShareToken) return <SharedLocationPage token={incomingShareToken} />;

  if (!authReady) return <main className="loading-page"><div className="loading-orbit" /><p>Preparing your family space…</p></main>;

  if (!user) return (
    <main className="auth-page">
      <div className="auth-glow glow-one" aria-hidden="true" /><div className="auth-glow glow-two" aria-hidden="true" />
      <section className="auth-card">
        <Brand />
        <div className="welcome-icon"><ShieldCheck size={24} /></div>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="subtitle">{mode === 'login' ? 'Sign in to stay connected with your family.' : 'Create a private account for your family space.'}</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email address</label>
          <div className="input-wrap"><Mail size={18} aria-hidden="true" /><input id="email" type="email" placeholder="you@example.com" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required /></div>
          <label htmlFor="password">Password</label>
          <div className="input-wrap"><Lock size={18} aria-hidden="true" /><input id="password" type={showPassword ? 'text' : 'password'} placeholder="At least 6 characters" value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required /><button className="password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <button className="submit-button" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in securely' : 'Create account'}</button>
        </form>
        {message && <p className="auth-message" role="status">{message}</p>}
        <p className="switch-mode">{mode === 'login' ? "Don't have an account?" : 'Already registered?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMessage(''); }}>{mode === 'login' ? 'Create account' : 'Sign in'}</button></p>
        <div className="privacy-note"><ShieldCheck size={15} /><span>Your family space starts with a secure sign-in.</span></div>
      </section>
    </main>
  );

  const title = page === 'home' ? 'Your family, closer' : page === 'family' ? 'My Family' : page === 'friends' ? 'My Friends' : page === 'chats' ? 'Your Chats' : 'Your profile';
  const greeting = user.email?.split('@')[0] || 'there';

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand small />
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <button className={page === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('home'); setSearch(''); }}><Home size={18} />Home</button>
          <button className={page === 'family' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('family'); setSearch(''); }}><Users size={18} />Family <span className="nav-count">{contacts.filter(p => p.type === 'family').length}</span></button>
          <button className={page === 'friends' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('friends'); setSearch(''); }}><Heart size={18} />Friends <span className="nav-count">{contacts.filter(p => p.type === 'friends').length}</span></button>
          <button className={page === 'chats' ? 'nav-item active' : 'nav-item'} onClick={() => { setPage('chats'); setSearch(''); }}><MessageCircle size={18} />Chats</button>
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-secure"><ShieldCheck size={17} /><div><strong>Your space</strong><span>Private by design</span></div></div><button className="nav-item" onClick={handleSignOut}><LogOut size={18} />Sign out</button></div>
      </aside>

      <section className="main-area">
        <header className="topbar"><div className="mobile-brand"><Brand small /></div><div className="topbar-right"><span className="online-dot" />Signed in <button className="avatar-button" title={user.email || 'Profile'} onClick={() => setPage('profile')}>{greeting.charAt(0).toUpperCase()}</button></div></header>
        <div className="page-content">
          <div className="page-heading"><div><div className="eyebrow">YOUR PRIVATE CIRCLE</div><h1>{page === 'home' ? `Hello, ${greeting} 👋` : title}</h1><p>{page === 'home' ? 'Keep the people who matter most within reach.' : page === 'profile' ? 'Your account and session details.' : page === 'chats' ? 'Individual messages and group conversations with registered members.' : `Keep your ${page} contacts organised in one place.`}</p></div>{page !== 'profile' && page !== 'chats' && <button className="primary-button" onClick={() => openAdd(page === 'friends' ? 'friends' : 'family')}><Plus size={18} />Add person</button>}</div>

          {notice && <div className="notice-banner" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss message"><X size={16} /></button></div>}

          {page === 'home' && <LiveLocationShare user={user} />}
          {(page === 'friends' || page === 'chats') && <Community mode={page} user={user} />}

          {page === 'home' && <>
            <section className="hero-panel"><div className="hero-copy"><span className="hero-chip"><MapPin size={13} /> STAY CONNECTED</span><h2>Love has no distance.</h2><p>Build your circle, keep contact details handy, and open map directions when you need them.</p><button className="hero-button" onClick={() => openAdd('family')}><UserRoundPlus size={17} />Add your first person</button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-a" /><div className="orbit orbit-b" /><div className="hero-pin"><MapPin size={34} /></div><div className="float-avatar avatar-a"><UsersRound size={20} /></div><div className="float-avatar avatar-b"><Heart size={19} /></div><div className="float-avatar avatar-c"><MapPin size={18} /></div></div></section>
            <div className="stats-grid"><button className="stat-card" onClick={() => setPage('family')}><span className="stat-icon family-icon"><Users size={19} /></span><span className="stat-label">Family members</span><strong>{contacts.filter(p => p.type === 'family').length}</strong><span className="stat-foot">View your family <span>↗</span></span></button><button className="stat-card" onClick={() => setPage('friends')}><span className="stat-icon friend-icon"><Heart size={19} /></span><span className="stat-label">Friends</span><strong>{contacts.filter(p => p.type === 'friends').length}</strong><span className="stat-foot">View your friends <span>↗</span></span></button><div className="stat-card"><span className="stat-icon location-icon"><MapPinned size={19} /></span><span className="stat-label">Saved locations</span><strong>{contacts.filter(p => p.lat && p.lng).length}</strong><span className="stat-foot">GPS points saved to your account</span></div></div>
            <div className="section-heading"><div><h2>Your circle</h2><p>People you want to keep close</p></div><button className="text-button" onClick={() => { setPage('family'); setSearch(''); }}>View contacts <span>→</span></button></div>
          </>}

          {page === 'profile' && <section className="profile-card"><div className="profile-avatar">{greeting.charAt(0).toUpperCase()}</div><h2>{greeting}</h2><p>{user.email}</p><div className="profile-detail"><ShieldCheck size={18} /><div><strong>Authenticated account</strong><span>Signed in with email and password</span></div><CheckCircle2 size={18} /></div><button className="signout-button" onClick={handleSignOut}><LogOut size={17} />Sign out</button><p className="profile-note">Your contact book syncs to this account when migration 003 is installed. Contacts are private to this account and are not automatically shared with other accounts.</p></section>}

          {page !== 'profile' && page !== 'chats' && <div className="contacts-section"><div className="contacts-toolbar"><div className="section-heading compact"><div><h2>{page === 'home' ? 'People' : page === 'family' ? 'Family members' : 'Friends'}</h2><p>{filteredContacts.length} {filteredContacts.length === 1 ? 'person' : 'people'} in this list</p></div></div><div className="search-box"><Search size={17} /><input aria-label="Search contacts" placeholder="Search people…" value={search} onChange={event => setSearch(event.target.value)} /><kbd>/</kbd></div></div>
            {filteredContacts.length ? <div className="people-grid">{filteredContacts.map(person => <article className="person-card" key={person.id}><div className={`person-avatar ${person.type === 'friends' ? 'friend-avatar' : ''}`}>{person.photoUrl ? <img className="person-avatar-image" src={person.photoUrl} alt={`${person.name} profile`} /> : (person.name || '?').charAt(0).toUpperCase()}</div><div className="person-info"><h3>{person.name}</h3><p>{person.relation || (person.type === 'friends' ? 'Friend' : 'Family member')}</p>{person.location && <span className="person-location"><MapPin size={13} />{person.location}</span>}</div><button className="icon-button edit-contact" aria-label={`Edit ${person.name}`} onClick={() => openEdit(person)}><Pencil size={15} /></button><div className="person-actions">{person.phone && <a className="contact-action call-action" href={`tel:${person.phone.replace(/[^+\d]/g, '')}`}><Phone size={15} />Call now</a>}{person.lat && person.lng ? <a className="contact-action map-action" href={`https://www.google.com/maps?q=${person.lat},${person.lng}`} target="_blank" rel="noreferrer"><Navigation size={15} />Go now</a> : person.location ? <a className="contact-action map-action" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(person.location)}`} target="_blank" rel="noreferrer"><Navigation size={15} />Go now</a> : <button className="contact-action map-action" onClick={() => { setForm({ ...person }); setEditing(person.id); setShowForm(true); setNotice('Add a location or capture GPS coordinates to enable Go now.'); }}><MapPin size={15} />Add location</button>}</div></article>)}</div> : <div className="empty-state"><div className="empty-icon"><UsersRound size={25} /></div><h3>{search ? 'No matching people' : page === 'home' ? 'Your circle starts here' : `No ${page === 'friends' ? 'friends' : 'family members'} yet`}</h3><p>{search ? 'Try another name or clear your search.' : 'Add someone important to keep their contact details close.'}</p>{!search && <button className="primary-button" onClick={() => openAdd(page === 'friends' ? 'friends' : 'family')}><Plus size={17} />Add person</button>}</div>}
          </div>}
          <footer className="app-footer"><ShieldCheck size={14} /> Your family space · Keep your loved ones close <span>•</span> <span>Live sharing requires one-time Supabase setup</span></footer>
        </div>
      </section>

      {showForm && <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowForm(false); }}><section className="person-modal" role="dialog" aria-modal="true" aria-labelledby="person-modal-title"><div className="modal-heading"><div><div className="eyebrow">YOUR CIRCLE</div><h2 id="person-modal-title">{editing ? 'Edit person' : 'Add a person'}</h2><p>Keep their details easy to find.</p></div><button className="icon-button close-modal" onClick={() => setShowForm(false)} aria-label="Close"><X size={19} /></button></div><form onSubmit={savePerson}><div className="form-grid"><div className="form-field full-field photo-upload-field"><label htmlFor="person-photo">Photo</label><div className="photo-upload-row">{form.photoUrl ? <img className="photo-upload-preview" src={form.photoUrl} alt="Selected contact" /> : <div className="photo-upload-placeholder"><ImagePlus size={22} /></div>}<div className="photo-upload-controls"><label className="photo-upload-button" htmlFor="person-photo"><ImagePlus size={16} />{form.photoUrl ? 'Change photo' : 'Upload photo'}</label><input id="person-photo" className="photo-file-input" type="file" accept="image/*" onChange={handlePhotoUpload} /><span>JPG, PNG or WEBP · saved on this device</span>{form.photoUrl && <button type="button" className="remove-photo-button" onClick={() => setForm(current => ({ ...current, photoUrl: '' }))}>Remove photo</button>}</div></div></div><div className="form-field full-field"><label htmlFor="person-name">Full name *</label><input id="person-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="e.g. Dad" required /></div><div className="form-field"><label htmlFor="person-relation">Relationship</label><input id="person-relation" value={form.relation} onChange={event => setForm({ ...form, relation: event.target.value })} placeholder="e.g. Father" /></div><div className="form-field"><label htmlFor="person-type">Group</label><select id="person-type" value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="family">Family</option><option value="friends">Friends</option></select></div><div className="form-field full-field"><label htmlFor="person-phone">Phone number</label><input id="person-phone" type="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="Enter phone number" /></div><div className="form-field full-field"><label htmlFor="person-location">Location name or address</label><input id="person-location" value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} placeholder="e.g. Home, Kochi" /></div><div className="form-field"><label htmlFor="person-lat">Latitude</label><input id="person-lat" inputMode="decimal" value={form.lat || ''} onChange={event => setForm({ ...form, lat: event.target.value })} placeholder="e.g. 9.9312" /></div><div className="form-field"><label htmlFor="person-lng">Longitude</label><input id="person-lng" inputMode="decimal" value={form.lng || ''} onChange={event => setForm({ ...form, lng: event.target.value })} placeholder="e.g. 76.2673" /></div></div><button type="button" className="location-capture" onClick={captureLocation} disabled={locationBusy}><LocateFixed size={17} />{locationBusy ? 'Getting GPS location…' : form.lat && form.lng ? 'Update with my current GPS' : 'Upload current GPS location'}</button><button type="button" className="location-capture secondary-location-action" onClick={() => { const q = form.location.trim() || 'Choose a location'; window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q), '_blank', 'noopener,noreferrer'); setNotice('Choose the place in Google Maps, then enter its latitude and longitude here.'); }}><MapPinned size={17} />Choose a place in Google Maps</button>{form.lat && form.lng && <p className="coords-note">Coordinates: {Number(form.lat).toFixed(5)}, {Number(form.lng).toFixed(5)} · <a href={'https://www.google.com/maps?q=' + form.lat + ',' + form.lng} target="_blank" rel="noreferrer">Preview on Google Maps</a></p>}{notice && <p className="modal-note">{notice}</p>}<div className="modal-actions"><button type="button" className="cancel-button" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="primary-button"><CheckCircle2 size={17} />{editing ? 'Save changes' : 'Save person'}</button></div>{editing && <button type="button" className="delete-button" onClick={() => { setContacts(current => current.filter(person => person.id !== editing)); setShowForm(false); setNotice('Contact removed from this device.'); }}><Trash2 size={15} />Delete this person</button>}</form></section></div>}
    </main>
  );
}

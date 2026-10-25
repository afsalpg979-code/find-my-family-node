(() => {
"use strict";
const PEOPLE_KEY="find-my-family-people-v1", GROUPS_KEY="find-my-family-groups-v1";
const $=id=>document.getElementById(id);
let groups=read(GROUPS_KEY,[]), people=read(PEOPLE_KEY,[]), editingGroupId=null, activeChatId=null;
function read(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));return Array.isArray(v)?v:fallback}catch{return fallback}}
function saveGroups(){try{localStorage.setItem(GROUPS_KEY,JSON.stringify(groups));return true}catch{notify("Could not save groups. Check device storage.");return false}}
function notify(message){const t=$("toast");if(!t)return;t.textContent=message;t.style.display="block";clearTimeout(notify.timer);notify.timer=setTimeout(()=>t.style.display="none",2800)}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function makeId(){return crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random().toString(16).slice(2)}
function syncPeople(){people=read(PEOPLE_KEY,[])}
function membersFor(g){return(g.memberIds||[]).map(id=>people.find(p=>String(p.id)===String(id))).filter(Boolean)}
function renderGroups(){
 syncPeople();
 ["family","friend"].forEach(type=>{
  const list=$(type==="family"?"familyGroupsList":"friendsGroupsList"), empty=$(type==="family"?"familyGroupsEmpty":"friendsGroupsEmpty");
  const items=groups.filter(g=>g.type===type);
  list.innerHTML=items.map(g=>{
   const members=membersFor(g), last=(g.messages||[]).slice(-1)[0], preview=last?last.text:"No messages yet — start the conversation";
   return '<article class="group-card"><div class="group-avatar">'+(type==="family"?"👨‍👩‍👧‍👦":"🤝")+'</div><div class="group-card-info"><b>'+esc(g.name)+'</b><small>'+members.length+' '+(members.length===1?"member":"members")+'</small><p>'+esc(preview)+'</p></div><div class="group-card-actions"><button class="primary" type="button" data-group-chat="'+esc(g.id)+'">Chat</button><button class="secondary" type="button" data-group-edit="'+esc(g.id)+'">Edit</button><button class="secondary" type="button" data-group-delete="'+esc(g.id)+'">Delete</button></div></article>';
  }).join("");
  empty.style.display=items.length?"none":"block";
 });
 document.querySelectorAll("[data-group-chat]").forEach(b=>b.onclick=()=>openChat(b.dataset.groupChat));
 document.querySelectorAll("[data-group-edit]").forEach(b=>b.onclick=()=>openGroupForm(b.dataset.groupEdit));
 document.querySelectorAll("[data-group-delete]").forEach(b=>b.onclick=()=>deleteGroup(b.dataset.groupDelete));
}
function openGroupForm(typeOrId){
 syncPeople();const existing=groups.find(g=>String(g.id)===String(typeOrId)), type=existing?existing.type:typeOrId;
 editingGroupId=existing?existing.id:null;
 $("groupDialogTitle").textContent=existing?"Edit Group":(type==="family"?"Create Family Group":"Create Friends Group");
 $("groupName").value=existing?existing.name:"";
 const candidates=people.filter(p=>(p.type||"family")===type);
 $("groupMemberChoices").innerHTML=candidates.map(p=>{
  const checked=(existing?.memberIds||[]).some(mid=>String(mid)===String(p.id));
  return '<label class="group-member-option"><input type="checkbox" name="groupMember" value="'+esc(p.id)+'" '+(checked?"checked":"")+'><span class="group-member-avatar">'+esc((p.name||"?").trim().slice(0,1).toUpperCase())+'</span><span><b>'+esc(p.name)+'</b><small>'+esc(p.relation||(type==="family"?"Family member":"Friend"))+'</small></span></label>';
 }).join("");
 $("groupNoPeople").style.display=candidates.length?"none":"block";
 $("groupForm").dataset.type=type;$("groupDialog").showModal();
}
function closeGroupForm(){$("groupDialog").close();editingGroupId=null}
$("groupForm").addEventListener("submit",e=>{
 e.preventDefault();const name=$("groupName").value.trim();if(!name)return notify("Enter a group name.");
 const type=$("groupForm").dataset.type, memberIds=[...$("groupMemberChoices").querySelectorAll('input[name="groupMember"]:checked')].map(i=>i.value);
 if(editingGroupId){const g=groups.find(x=>String(x.id)===String(editingGroupId));if(!g)return notify("Group could not be found.");g.name=name;g.memberIds=memberIds;g.updatedAt=new Date().toISOString()}
 else groups.push({id:makeId(),name,type,memberIds,messages:[],createdAt:new Date().toISOString()});
 const wasEdit=!!editingGroupId;if(!saveGroups())return;closeGroupForm();renderGroups();notify(wasEdit?"Group updated.":"Group created.");
});
function deleteGroup(id){const g=groups.find(x=>String(x.id)===String(id));if(!g||!confirm("Delete this group and its messages from this device?"))return;groups=groups.filter(x=>String(x.id)!==String(id));saveGroups();renderGroups();notify("Group deleted from this device.")}
function openChat(id){const g=groups.find(x=>String(x.id)===String(id));if(!g)return notify("Group could not be found.");activeChatId=g.id;$("groupChatTitle").textContent=g.name;$("groupChatMeta").textContent=membersFor(g).length+" members · "+(g.type==="family"?"Family group":"Friends group");renderMessages(g);$("groupChatDialog").showModal();$("groupMessageInput").focus()}
function renderMessages(g){const box=$("groupMessages"), items=g.messages||[];box.innerHTML=items.length?items.map(m=>'<article class="group-message"><p>'+esc(m.text)+'</p><small>'+esc(m.sender||"You")+' · '+esc(new Date(m.createdAt).toLocaleString())+'</small></article>').join(""):'<div class="group-chat-empty"><span>💬</span><b>Start the conversation</b><p>Send the first message to '+esc(g.name)+'.</p></div>';box.scrollTop=box.scrollHeight}
$("groupMessageForm").addEventListener("submit",e=>{
 e.preventDefault();const text=$("groupMessageInput").value.trim();if(!text||!activeChatId)return;
 const g=groups.find(x=>String(x.id)===String(activeChatId));if(!g)return;g.messages=Array.isArray(g.messages)?g.messages:[];
 const profile=(()=>{try{return JSON.parse(localStorage.getItem("find-my-family-local-profile-v1")||"{}")}catch{return{}}})();
 g.messages.push({id:makeId(),text,sender:profile.name||"You",createdAt:new Date().toISOString()});if(!saveGroups())return;
 $("groupMessageInput").value="";renderMessages(g);renderGroups();
});
$("closeGroupDialog").onclick=closeGroupForm;$("cancelGroupDialog").onclick=closeGroupForm;
$("closeGroupChat").onclick=()=>{$("groupChatDialog").close();activeChatId=null};
document.querySelectorAll("[data-group-create]").forEach(b=>b.addEventListener("click",()=>openGroupForm(b.dataset.groupCreate)));
window.addEventListener("storage",e=>{if(e.key===PEOPLE_KEY){syncPeople();renderGroups()}});
renderGroups();
})();
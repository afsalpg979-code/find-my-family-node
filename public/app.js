const STORAGE_KEY = "find-my-family-people-v1";
let people = loadPeople();
let currentView = "all";
let myLocation = null;
let pendingType = "family";
let mapInstance = null;
let mapMarker = null;

const $ = (id) => document.getElementById(id);
function loadPeople(){ try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return []} }
function persist(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(people)); }
function toast(message){ const el=$("toast"); el.textContent=message; el.style.display="block"; clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.style.display="none",2800); }
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function render(){
  const visible=people.filter(p=>currentView==="all"||p.type===currentView);
  $("peopleHeading").textContent=currentView==="family"?"Family":currentView==="friends"?"Friends":"Family & Friends";
  $("peopleCount").textContent=`${visible.length} ${visible.length===1?"person":"people"}`;
  $("emptyState").style.display=visible.length?"none":"block";
  $("peopleList").innerHTML=visible.map(p=>`<article class="person">
    <div class="avatar">${escapeHtml((p.name||"?").trim().slice(0,1).toUpperCase())}</div>
    <div class="person-info"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.relation|| (p.type==="family"?"Family member":"Friend"))}${p.lat!=null?` · Location saved`:" · No location saved"}</small></div>
    <div class="person-actions">${p.lat!=null?`<button class="primary" data-go="${p.id}">Go Now</button>`:`<button class="secondary" data-loc="${p.id}">Add Location</button>`}<button class="secondary" data-editloc="${p.id}">Edit</button></div>
  </article>`).join("");
  $("peopleList").querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>goNow(b.dataset.go));
  $("peopleList").querySelectorAll("[data-loc]").forEach(b=>b.onclick=()=>captureLocation(b.dataset.loc));
  $("peopleList").querySelectorAll("[data-editloc]").forEach(b=>b.onclick=()=>editPerson(b.dataset.editloc));
}
function openPersonDialog(type){pendingType=type;$("dialogTitle").textContent=type==="family"?"Add Family Member":"Add Friend";$("personForm").reset();$("personDialog").showModal();}
$("addFamilyBtn").onclick=()=>openPersonDialog("family");
$("addFriendBtn").onclick=()=>openPersonDialog("friend");
$("cancelDialog").onclick=()=>$("personDialog").close();
document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{currentView=b.dataset.view;render();document.querySelector(".panel").scrollIntoView({behavior:"smooth",block:"start"});});
$("personForm").addEventListener("submit",e=>{e.preventDefault();const name=$("personName").value.trim();if(!name)return;people.push({id:crypto.randomUUID(),name,relation:$("personRelation").value.trim(),phone:$("personPhone").value.trim(),type:pendingType,lat:null,lng:null});persist();$("personDialog").close();render();toast(`${name} added`);});
function getPosition(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error("Geolocation is not supported by this browser."));navigator.geolocation.getCurrentPosition(pos=>resolve({lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy}),err=>reject(new Error(err.message||"Location permission denied.")),{enableHighAccuracy:true,timeout:15000,maximumAge:0});});}
$("myLocationBtn").onclick=async()=>{ $("myLocationBtn").disabled=true;$("myLocationBtn").textContent="Finding…";try{myLocation=await getPosition();$("locationStatus").textContent=`Location captured (±${Math.round(myLocation.accuracy)} m)`;showMap(myLocation.lat,myLocation.lng,"My Location");toast("Your location captured on this device.");}catch(err){toast("Could not get location: "+err.message+" Try opening localhost in your browser and allow location permission.");}finally{$("myLocationBtn").disabled=false;$("myLocationBtn").textContent="Add My Location";}};
async function captureLocation(id){try{toast("Requesting your device location…");const loc=await getPosition();const p=people.find(x=>x.id===id);if(!p)return;p.lat=loc.lat;p.lng=loc.lng;p.updatedAt=new Date().toISOString();persist();render();showMap(p.lat,p.lng,p.name);toast(`Saved this device's current location for ${p.name}.`);}catch(err){toast("Could not get location: "+err.message);}}
function goNow(id){const p=people.find(x=>x.id===id);if(!p||p.lat==null)return toast("This person has no saved location yet.");const url=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat+","+p.lng)}&travelmode=driving`;window.open(url,"_blank","noopener");showMap(p.lat,p.lng,p.name);}
function editPerson(id){const p=people.find(x=>x.id===id);if(!p)return;const next=prompt("Rename person:",p.name);if(next===null)return;if(!next.trim())return toast("Name cannot be empty.");p.name=next.trim();persist();render();toast("Name updated.");}
$("openMapBtn").onclick=()=>{if(myLocation){window.open(`https://www.google.com/maps/search/?api=1&query=${myLocation.lat},${myLocation.lng}`,"_blank","noopener");}else{window.open("https://maps.google.com","_blank","noopener");}};
function showMap(lat,lng,label){const map=$("map");map.innerHTML=`<div class="map-placeholder"><strong>📍 ${escapeHtml(label)}</strong><p>Latitude: ${lat.toFixed(6)}<br>Longitude: ${lng.toFixed(6)}</p><button class="primary" id="mapDirections">Open directions in Google Maps</button></div>`;$("mapDirections").onclick=()=>window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,"_blank","noopener");}
render();
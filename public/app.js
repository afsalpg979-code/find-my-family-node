const STORAGE_KEY = "find-my-family-people-v1";
let people = loadPeople();
let currentView = "all";
let myLocation = null;
let pendingType = "family";
let editingId = null;

const $ = (id) => document.getElementById(id);

function loadPeople() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}
function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(people));
    return true;
  } catch {
    toast("Could not save changes in this browser. Check available storage.");
    return false;
  }
}
function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.style.display = "none"; }, 2800);
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function normalisePhone(value) {
  return String(value || "").trim().replace(/[^\d+*#,;]/g, "");
}
function render() {
  const visible = people.filter(p => currentView === "all" || (p.type || "family") === currentView);
  $("peopleHeading").textContent = currentView === "family" ? "Family" : currentView === "friends" ? "Friends" : "Family & Friends";
  $("peopleCount").textContent = `${visible.length} ${visible.length === 1 ? "person" : "people"}`;
  $("emptyState").style.display = visible.length ? "none" : "block";
  $("peopleList").innerHTML = visible.map(p => {
    const phone = normalisePhone(p.phone);
    const locationSaved = p.lat != null && p.lng != null;
    return `<article class="person">
      <div class="avatar">${escapeHtml((p.name || "?").trim().slice(0, 1).toUpperCase())}</div>
      <div class="person-info">
        <b>${escapeHtml(p.name)}</b>
        <small>${escapeHtml(p.relation || ((p.type || "family") === "family" ? "Family member" : "Friend"))} · ${phone ? escapeHtml(p.phone) + " · " : ""}${locationSaved ? "Location saved" : "No location saved"}</small>
      </div>
      <div class="person-actions">
        <a class="primary call-button ${phone ? "" : "disabled-link"}" ${phone ? `href="tel:${escapeHtml(phone)}" aria-label="Call ${escapeHtml(p.name)}"` : 'aria-disabled="true" tabindex="-1" title="Add a phone number to enable calling"'}>${phone ? "☎ Call Now" : "☎ No Phone"}</a>
        ${locationSaved ? `<button class="primary" data-go="${escapeHtml(p.id)}">Go Now</button>` : `<button class="secondary" data-loc="${escapeHtml(p.id)}">Add Location</button>`}
        <button class="secondary" data-edit="${escapeHtml(p.id)}">Edit</button>
      </div>
    </article>`;
  }).join("");

  $("peopleList").querySelectorAll("[data-go]").forEach(b => b.onclick = () => goNow(b.dataset.go));
  $("peopleList").querySelectorAll("[data-loc]").forEach(b => b.onclick = () => captureLocation(b.dataset.loc));
  $("peopleList").querySelectorAll("[data-edit]").forEach(b => b.onclick = () => editPerson(b.dataset.edit));
}
function openPersonDialog(type) {
  editingId = null;
  pendingType = type;
  $("personForm").reset();
  $("dialogTitle").textContent = type === "family" ? "Add Family Member" : "Add Friend";
  $("personType").value = type;
  $("personLat").value = "";
  $("personLng").value = "";
  $("personLat").disabled = false;
  $("personLng").disabled = false;
  $("personForm").querySelector('button[type="submit"]').textContent = "Save person";
  $("personDialog").showModal();
}
$("addFamilyBtn").onclick = () => openPersonDialog("family");
$("addFriendBtn").onclick = () => openPersonDialog("friend");
$("cancelDialog").onclick = () => $("personDialog").close();
document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
  currentView = b.dataset.view;
  render();
  document.querySelector(".panel").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("personForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("personName").value.trim();
  if (!name) return toast("Name cannot be empty.");

  const latText = $("personLat").value.trim();
  const lngText = $("personLng").value.trim();
  let lat = null;
  let lng = null;
  if (latText !== "" || lngText !== "") {
    if (latText === "" || lngText === "") return toast("Enter both latitude and longitude, or leave both blank.");
    lat = Number(latText);
    lng = Number(lngText);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return toast("Enter valid coordinates (latitude -90 to 90, longitude -180 to 180).");
    }
  }

  const data = {
    name,
    relation: $("personRelation").value.trim(),
    phone: $("personPhone").value.trim(),
    type: $("personType").value === "friend" ? "friend" : "family",
    lat,
    lng
  };
  if (editingId) {
    const person = people.find(p => String(p.id) === String(editingId));
    if (!person) return toast("This person could not be found.");
    Object.assign(person, data, { updatedAt: new Date().toISOString() });
  } else {
    people.push({ id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)), ...data, createdAt: new Date().toISOString() });
  }
  if (!persist()) return;
  $("personDialog").close();
  render();
  toast(editingId ? "Person details updated and saved." : `${name} added`);
  editingId = null;
});

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation is not supported by this browser."));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => reject(new Error(err.message || "Location permission denied.")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}
$("myLocationBtn").onclick = async () => {
  $("myLocationBtn").disabled = true;
  $("myLocationBtn").textContent = "Finding…";
  try {
    myLocation = await getPosition();
    $("locationStatus").textContent = `Location captured (±${Math.round(myLocation.accuracy)} m)`;
    showMap(myLocation.lat, myLocation.lng, "My Location");
    toast("Your location captured on this device.");
  } catch (err) {
    toast("Could not get location: " + err.message + " Try opening localhost in your browser and allow location permission.");
  } finally {
    $("myLocationBtn").disabled = false;
    $("myLocationBtn").textContent = "Add My Location";
  }
};
async function captureLocation(id) {
  try {
    toast("Requesting your device location…");
    const loc = await getPosition();
    const p = people.find(x => String(x.id) === String(id));
    if (!p) return;
    p.lat = loc.lat;
    p.lng = loc.lng;
    p.updatedAt = new Date().toISOString();
    if (!persist()) return;
    render();
    showMap(p.lat, p.lng, p.name);
    toast(`Saved this device's current location for ${p.name}.`);
  } catch (err) {
    toast("Could not get location: " + err.message);
  }
}
function goNow(id) {
  const p = people.find(x => String(x.id) === String(id));
  if (!p || p.lat == null || p.lng == null) return toast("This person has no saved location yet.");
  const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(p.lat + "," + p.lng)}&travelmode=driving`;
  window.open(url, "_blank", "noopener");
  showMap(p.lat, p.lng, p.name);
}
function editPerson(id) {
  const p = people.find(x => String(x.id) === String(id));
  if (!p) return toast("This person could not be found.");
  editingId = p.id;
  $("dialogTitle").textContent = "Edit Person Details";
  $("personName").value = p.name || "";
  $("personRelation").value = p.relation || "";
  $("personPhone").value = p.phone || "";
  $("personType").value = (p.type || "family") === "friend" ? "friend" : "family";
  $("personLat").value = p.lat == null ? "" : p.lat;
  $("personLng").value = p.lng == null ? "" : p.lng;
  $("personLat").disabled = false;
  $("personLng").disabled = false;
  $("personForm").querySelector('button[type="submit"]').textContent = "Save Changes";
  $("personDialog").showModal();
}
$("openMapBtn").onclick = () => {
  if (myLocation) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${myLocation.lat},${myLocation.lng}`, "_blank", "noopener");
  } else {
    window.open("https://maps.google.com", "_blank", "noopener");
  }
};
function showMap(lat, lng, label) {
  const map = $("map");
  map.innerHTML = `<div class="map-placeholder"><strong>📍 ${escapeHtml(label)}</strong><p>Latitude: ${Number(lat).toFixed(6)}<br>Longitude: ${Number(lng).toFixed(6)}</p><button class="primary" id="mapDirections">Open directions in Google Maps</button></div>`;
  $("mapDirections").onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank", "noopener");
}
render();

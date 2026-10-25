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
      <div class="avatar">${p.photo ? `<img src="${p.photo}" alt="" loading="lazy">` : escapeHtml((p.name || "?").trim().slice(0, 1).toUpperCase())}</div>
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
  $("personPhoto").value = "";
  $("personPhoto").dataset.remove = "false";
  $("personPhoto").dataset.cameraPhoto = "";
  $("personCameraInput").value = "";
  $("photoPreviewWrap").hidden = true;
  $("photoPreview").removeAttribute("src");
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

$("personForm").addEventListener("submit", async e => {
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

  let photo = editingId ? (people.find(p => String(p.id) === String(editingId))?.photo || "") : "";
  if ($("personPhoto").dataset.cameraPhoto) photo = $("personPhoto").dataset.cameraPhoto;
  const photoFile = $("personPhoto").files?.[0];
  if (photoFile) {
    if (!photoFile.type.startsWith("image/")) return toast("Please choose an image file.");
    if (photoFile.size > 10 * 1024 * 1024) return toast("Please choose a photo smaller than 10 MB.");
    try { photo = await compressProfilePhoto(photoFile); }
    catch { return toast("Could not read this photo. Please choose another image."); }
  }
  if ($("personPhoto").dataset.remove === "true") photo = "";

  const data = {
    name,
    relation: $("personRelation").value.trim(),
    phone: $("personPhone").value.trim(),
    type: $("personType").value === "friend" ? "friend" : "family",
    lat,
    lng,
    photo
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
  $("personPhoto").value = "";
  $("personPhoto").dataset.remove = "false";
  $("photoPreviewWrap").hidden = true;
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
  $("personPhoto").value = "";
  $("personPhoto").dataset.remove = "false";
  $("personPhoto").dataset.cameraPhoto = "";
  $("personCameraInput").value = "";
  if (p.photo) {
    $("photoPreview").src = p.photo;
    $("photoPreviewWrap").hidden = false;
  } else {
    $("photoPreview").removeAttribute("src");
    $("photoPreviewWrap").hidden = true;
  }
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


// Installable PWA support. Installation requires HTTPS or localhost.
let deferredInstallPrompt = null;
const installButton = $("installBtn");
const installTip = $("installTip");

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});
installButton?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    toast("In Chrome, open the menu and choose 'Add to Home screen' or 'Install app'.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installButton.hidden = true;
});
window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  if (installTip) installTip.hidden = true;
  toast("Find My Family installed on this device.");
});

$("shareAppBtn")?.addEventListener("click", async () => {
  const shareData = {
    title: "Find My Family",
    text: "Open Find My Family to keep important family contacts close.",
    url: window.location.href
  };
  try {
    if (navigator.share) await navigator.share(shareData);
    else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(window.location.href);
      toast("App link copied. Send it to your family after the app is hosted online.");
    } else {
      toast("Copy this app's address from your browser and send it to your family.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") toast("Could not share the app link from this browser.");
  }
});

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app still works if offline installation is unavailable.
    });
  });
}


// Profile photo upload: resize/compress before storing in this browser's local storage.
function compressProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Photo read failed"));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Invalid image"));
      image.onload = () => {
        const maxSide = 512;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas unavailable"));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
$("personPhoto")?.addEventListener("change", async () => {
  const file = $("personPhoto").files?.[0];
  $("personPhoto").dataset.remove = "false";
  $("personPhoto").dataset.cameraPhoto = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    $("personPhoto").value = "";
    return toast("Please choose an image file.");
  }
  if (file.size > 10 * 1024 * 1024) {
    $("personPhoto").value = "";
    return toast("Please choose a photo smaller than 10 MB.");
  }
  try {
    const preview = await compressProfilePhoto(file);
    $("photoPreview").src = preview;
    $("photoPreviewWrap").hidden = false;
  } catch { toast("Could not preview this photo. Please choose another image."); }
});
$("removePhotoBtn")?.addEventListener("click", () => {
  $("personPhoto").value = "";
  $("personPhoto").dataset.remove = "true";
  $("personPhoto").dataset.cameraPhoto = "";
  $("personCameraInput").value = "";
  $("photoPreview").removeAttribute("src");
  $("photoPreviewWrap").hidden = true;
  toast("Photo will be removed when you save this person.");
});


// Local profile / login UI. This is intentionally device-only, not server authentication.
const PROFILE_KEY = "find-my-family-local-profile-v1";
let localProfile = loadLocalProfile();
function loadLocalProfile() {
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
}
function saveLocalProfile(profile) {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); return true; }
  catch { toast("Could not save profile in this browser."); return false; }
}
function paintProfile() {
  const name = localProfile?.name || "Profile";
  $("profileHeaderName").textContent = name.split(/\s+/)[0];
  $("profileHeaderAvatar").innerHTML = localProfile?.photo ? `<img src="${localProfile.photo}" alt="">` : escapeHtml(name.trim().slice(0,1).toUpperCase() || "👤");
  $("profileAvatarLarge").innerHTML = localProfile?.photo ? `<img src="${localProfile.photo}" alt="">` : escapeHtml(name.trim().slice(0,1).toUpperCase() || "👤");
}
function enterLocalApp() {
  document.body.classList.add("profile-ready");
  $("loginScreen").hidden = true;
  paintProfile();
}
$("localProfileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("profileDisplayName").value.trim();
  if (!name) return toast("Please enter your name.");
  localProfile = { ...(localProfile || {}), name, email: $("profileEmail").value.trim(), updatedAt: new Date().toISOString() };
  if (!saveLocalProfile(localProfile)) return;
  enterLocalApp();
  toast("Local profile created on this device.");
});
$("profileBtn").addEventListener("click", () => {
  $("profileNameEdit").value = localProfile?.name || "";
  $("profileEmailEdit").value = localProfile?.email || "";
  if (localProfile?.photo) {
    $("profilePhotoPreview").src = localProfile.photo;
    $("profilePhotoPreviewWrap").hidden = false;
  } else {
    $("profilePhotoPreview").removeAttribute("src");
    $("profilePhotoPreviewWrap").hidden = true;
  }
  $("profilePhotoInput").value = "";
  $("profilePhotoInput").dataset.remove = "false";
  $("profilePhotoInput").dataset.cameraPhoto = "";
  $("profileCameraInput").value = "";
  $("profileDialog").showModal();
});
$("closeProfileBtn").addEventListener("click", () => $("profileDialog").close());
$("profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("profileNameEdit").value.trim();
  if (!name) return toast("Please enter your name.");
  let photo = localProfile?.photo || "";
  if ($("profilePhotoInput").dataset.cameraPhoto) photo = $("profilePhotoInput").dataset.cameraPhoto;
  const file = $("profilePhotoInput").files?.[0];
  if (file) {
    if (!file.type.startsWith("image/")) return toast("Choose an image file.");
    if (file.size > 10 * 1024 * 1024) return toast("Choose a photo smaller than 10 MB.");
    try { photo = await compressProfilePhoto(file); } catch { return toast("Could not read that photo."); }
  }
  if ($("profilePhotoInput").dataset.remove === "true") photo = "";
  localProfile = { name, email: $("profileEmailEdit").value.trim(), photo, updatedAt: new Date().toISOString() };
  if (!saveLocalProfile(localProfile)) return;
  paintProfile();
  $("profileDialog").close();
  toast("Profile saved on this device.");
});
$("profilePhotoInput").addEventListener("change", async () => {
  const file = $("profilePhotoInput").files?.[0];
  $("profilePhotoInput").dataset.remove = "false";
  $("profilePhotoInput").dataset.cameraPhoto = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) { $("profilePhotoInput").value = ""; return toast("Choose an image file."); }
  if (file.size > 10 * 1024 * 1024) { $("profilePhotoInput").value = ""; return toast("Choose a photo smaller than 10 MB."); }
  try {
    $("profilePhotoPreview").src = await compressProfilePhoto(file);
    $("profilePhotoPreviewWrap").hidden = false;
  } catch { toast("Could not preview that photo."); }
});
$("removeProfilePhotoBtn").addEventListener("click", () => {
  $("profilePhotoInput").value = "";
  $("profilePhotoInput").dataset.remove = "true";
  $("profilePhotoInput").dataset.cameraPhoto = "";
  $("profileCameraInput").value = "";
  $("profilePhotoPreview").removeAttribute("src");
  $("profilePhotoPreviewWrap").hidden = true;
});
$("localSignOutBtn").addEventListener("click", () => {
  if (!confirm("Reset this device's profile? Your saved family contacts will remain on this device.")) return;
  localStorage.removeItem(PROFILE_KEY);
  localProfile = null;
  $("profileDialog").close();
  $("profileDisplayName").value = "";
  $("profileEmail").value = "";
  document.body.classList.remove("profile-ready");
  $("loginScreen").hidden = false;
});
if (localProfile?.name) enterLocalApp();
else $("loginScreen").hidden = false;


// Separate camera and gallery controls for person photos and the user's profile.
// The camera input uses capture=environment to request the rear camera where supported.
function openPhotoPicker(inputId, camera = false) {
  const input = $(inputId);
  if (!input) return;
  input.value = "";
  if (camera) input.setAttribute("capture", "environment");
  else input.removeAttribute("capture");
  input.click();
}
$("personCameraBtn")?.addEventListener("click", () => openPhotoPicker("personCameraInput", true));
$("personUploadBtn")?.addEventListener("click", () => openPhotoPicker("personPhoto", false));
$("profileCameraBtn")?.addEventListener("click", () => openPhotoPicker("profileCameraInput", true));
$("profileUploadBtn")?.addEventListener("click", () => openPhotoPicker("profilePhotoInput", false));

function bindAlternatePhotoInput(inputId, previewId, wrapId, primaryInputId) {
  $(inputId)?.addEventListener("change", async () => {
    const file = $(inputId).files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      $(inputId).value = "";
      return toast("Please choose an image file.");
    }
    if (file.size > 10 * 1024 * 1024) {
      $(inputId).value = "";
      return toast("Please choose a photo smaller than 10 MB.");
    }
    try {
      const compressed = await compressProfilePhoto(file);
      // Copy the compressed image into the main field's dataset; the save handler reads it below.
      $(primaryInputId).dataset.cameraPhoto = compressed;
      $(primaryInputId).dataset.remove = "false";
      $(previewId).src = compressed;
      $(wrapId).hidden = false;
    } catch {
      toast("Could not read that photo. Please try again.");
    }
  });
}
bindAlternatePhotoInput("personCameraInput", "photoPreview", "photoPreviewWrap", "personPhoto");
bindAlternatePhotoInput("profileCameraInput", "profilePhotoPreview", "profilePhotoPreviewWrap", "profilePhotoInput");

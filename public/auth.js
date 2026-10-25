import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup,
  sendPasswordResetEmail, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { firebaseConfig } from "/firebase-config.js";

const $ = (id) => document.getElementById(id);
const loginScreen = $("loginScreen");
const authForm = $("authForm");
const emailInput = $("authEmail");
const passwordInput = $("authPassword");
const message = $("authMessage");
const signInBtn = $("emailSignInBtn");
const signUpBtn = $("emailSignUpBtn");
const nameInput = $("authName");\nconst nameLabel = $("authNameLabel");
const resetBtn = $("resetPasswordBtn");
let mode = "signin";
let auth;

function showMessage(text, isError = true) {
  message.textContent = text;
  message.classList.add("visible");
  message.style.background = isError ? "#fff0ee" : "#dcfce7";
  message.style.color = isError ? "#8a2116" : "#14532d";
}
function friendlyError(error) {
  const codes = {
    "auth/invalid-email": "Enter a valid email address.",
    "auth/missing-password": "Enter your password.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/email-already-in-use": "An account already uses this email. Try signing in instead.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/user-not-found": "No account was found for this email. Create an account first.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/popup-closed-by-user": "Google sign-in was closed before finishing.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow popups or open this site in Chrome.",
    "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication settings.",
    "auth/network-request-failed": "Network error. Check your internet connection and try again.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again."
  };
  return codes[error?.code] || error?.message || "Authentication failed. Please try again.";
}
function setBusy(busy, label) {
  [signInBtn, signUpBtn, resetBtn].forEach(button => { if (button) button.disabled = busy; });
  if (label) signInBtn.textContent = label;
  else signInBtn.textContent = mode === "signup" ? "Create account" : "Sign in with email →";
}
function validateConfig() {
  return firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REPLACE_WITH_") &&
    firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("REPLACE_WITH_") &&
    firebaseConfig.appId && !firebaseConfig.appId.startsWith("REPLACE_WITH_");
}
function showLogin() {
  document.body.classList.remove("profile-ready");
  loginScreen.hidden = false;
}
function showApp(user) {
  const key = "find-my-family-local-profile-v1";
  let current = {};
  try { current = JSON.parse(localStorage.getItem(key) || "{}"); } catch {}
  const name = user.displayName || current.name || (user.email ? user.email.split("@")[0] : "Family member");
  const profile = { ...current, name, email: user.email || "", authUid: user.uid, updatedAt: new Date().toISOString() };
  try { localStorage.setItem(key, JSON.stringify(profile)); } catch {}
  // Keep the existing app profile UI in sync with the authenticated Firebase account.
  if ($("profileDisplayName")) $("profileDisplayName").value = name;
  if ($("profileEmail")) $("profileEmail").value = user.email || "";
  loginScreen.hidden = true;
  document.body.classList.add("profile-ready");
  if ($("profileHeaderName")) $("profileHeaderName").textContent = name.split(/\\s+/)[0];
  if ($("profileAvatarLarge")) $("profileAvatarLarge").textContent = name.trim().slice(0, 1).toUpperCase() || "👤";
  if ($("profileHeaderAvatar")) $("profileHeaderAvatar").textContent = name.trim().slice(0, 1).toUpperCase() || "👤";
}
function setMode(nextMode) {
  mode = nextMode;
  signInBtn.textContent = mode === "signup" ? "Create account →" : "Sign in with email →";
  passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
  message.classList.remove("visible");
}

if (!validateConfig()) {
  showLogin();
  showMessage("Connect Firebase first: edit public/firebase-config.js and paste your Web app configuration from Firebase Console.");
} else {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  onAuthStateChanged(auth, user => {
    if (user) showApp(user);
    else showLogin();
  });

  authForm.addEventListener("submit", async event => {
    event.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) return showMessage("Enter your email and password.");
    setBusy(true, mode === "signup" ? "Creating account…" : "Signing in…");
    try {
      if (mode === "signup") {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const displayName = email.split("@")[0];
        await updateProfile(result.user, { displayName });
        showMessage("Account created successfully.", false);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) { showMessage(friendlyError(error)); }
    finally { setBusy(false); }
  });
  signUpBtn.addEventListener("click", () => setMode(mode === "signup" ? "signin" : "signup"));
  signUpBtn.addEventListener("click", () => { signUpBtn.textContent = mode === "signup" ? "Already have an account? Sign in" : "Create account with email"; });
  resetBtn.addEventListener("click", async () => {
    const email = emailInput.value.trim();
    if (!email) { emailInput.focus(); return showMessage("Enter your email above, then tap Forgot password again."); }
    setBusy(true, "Sending reset email…");
    try { await sendPasswordResetEmail(auth, email); showMessage("Password reset email sent. Check your inbox and spam folder.", false); }
    catch (error) { showMessage(friendlyError(error)); }
    finally { setBusy(false); }
  });
  // The existing profile dialog's reset button becomes a real Firebase sign-out action.
  $("localSignOutBtn")?.addEventListener("click", async event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!confirm("Sign out of Find My Family on this device? Your locally saved contacts will remain on this device.")) return;
    try { await signOut(auth); }
    catch (error) { showMessage(friendlyError(error)); }
  }, true);
}

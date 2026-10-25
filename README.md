# Find My Family

A mobile-friendly family contact app with an installable Progressive Web App (PWA) shell, a polished local profile setup screen, and editable profile details. Features include Family/Friends lists, add/edit person details, Call Now, device GPS capture, saved coordinates, and Google Maps directions.

## Run locally in Termux

```sh
pkg update
pkg install nodejs
npm install
npm start
```

Open `http://127.0.0.1:3000` in Chrome on the same phone.

## Install on Android

For installation on your phone and family members' phones, deploy this project to a public HTTPS host first (for example, a Node-compatible hosting provider). Then open the hosted HTTPS address in Chrome and choose **Install app** if shown, or Chrome menu → **Add to Home screen**. The PWA files include a custom SVG app icon, web manifest, and service worker for caching the app shell.

The Share app button shares the current website address. A localhost address only works on the same device; it is not a public link.

## Important privacy and sharing limits

- This version stores contact entries and saved coordinates in the current browser's local storage on that device only.
- Saving a location for a person captures the current phone's GPS; it does not locate that person.
- Sharing the website link does not sync contacts between family phones.
- True family sharing/live location requires HTTPS, secure sign-in, a server database, invitation/access controls, and explicit consent from each person whose location is shared. Those backend features are not included yet.
- Call Now opens the phone dialer; the user confirms the call.
- Geolocation is available only in a secure browser context such as HTTPS or localhost.

## Optional embedded Google Maps

To show an interactive embedded map, enable the Google Maps JavaScript API and configure a restricted key. Directions can be opened in Google Maps without an API key.


## Profile setup and login-screen UI

- First launch shows the redesigned welcome/profile setup screen. Enter a display name and optional email to continue on this device.
- Use the Profile control in the app header to update the display name, optional email, and profile photo, or reset the local profile.
- Profile details and profile photos are stored in this browser's local storage only.
- **Security limitation:** this is a local profile/onboarding UI, not real authentication. There is no server-side account, password verification, account recovery, or cross-device profile sync. Do not use it to protect sensitive information. Real login and family sharing need a backend authentication provider and a database.


## Firebase email/password and Google authentication

This repository now includes a Firebase Authentication sign-in UI. To activate it:

1. In Firebase Console, open **Authentication → Sign-in method** and enable **Email/Password** and **Google**.
2. In **Project settings → General → Your apps**, register/select a Web app and copy its Firebase web configuration.
3. Edit `public/firebase-config.js` and replace every `REPLACE_WITH_...` value with the matching Firebase web config value. These web config values are intended for client apps; never put a service-account private key or Admin SDK secret in this file.
4. In **Authentication → Settings → Authorized domains**, add the exact domain hosting this app. For local testing, use `localhost`; a temporary trycloudflare domain changes and is not a reliable production domain.
5. Run `npm start` and open the app using localhost or the deployed HTTPS URL. Email account creation, email sign-in, password-reset email, Google popup sign-in and sign-out are handled by Firebase Auth.

Firebase Authentication does **not** itself sync contacts, profile photos or GPS. Those remain browser-local until a database and authenticated per-user/family access rules are implemented. Do not share sensitive family data until those rules are in place. Google popup sign-in may be blocked by some embedded browsers; open the hosted app in Chrome if needed.


## Online group codes

See [GROUP-CODES-SETUP.md](GROUP-CODES-SETUP.md) for Firebase Firestore setup, rule deployment, and cross-device testing. Group membership and messages sync online; personal contacts and saved GPS coordinates remain local to each phone.

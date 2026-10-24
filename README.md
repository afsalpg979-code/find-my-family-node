# Find My Family

A mobile-friendly family contact app with an installable Progressive Web App (PWA) shell. Features include Family/Friends lists, add/edit person details, Call Now, device GPS capture, saved coordinates, and Google Maps directions.

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

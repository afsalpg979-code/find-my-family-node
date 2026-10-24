# Find My Family — Termux starter

A mobile-friendly starter app that runs locally in Termux. It includes Family/Friends lists, Add Family, Add Friend, GPS capture, saved coordinates, and Go Now links that open Google Maps directions.

## Run on Android using Termux

1. Install Termux from a trusted source such as F-Droid or the official Termux GitHub releases.
2. Extract this ZIP into a folder you can access in Termux.
3. In Termux, navigate to the extracted `find-my-family-termux` folder, then run:

```sh
pkg update
pkg install nodejs
npm install
npm start
```

4. Open Chrome on the same phone and visit `http://127.0.0.1:3000`.

If you extracted the ZIP into Downloads, first run `termux-setup-storage`, then use a path similar to:
`cd ~/storage/downloads/find-my-family-termux`
(The exact folder may differ depending on where you extracted it.)

## Google Maps API key (optional for this starter)

The current starter opens directions in Google Maps and can save coordinates without a Google Maps API key. The embedded map area is a placeholder until you configure Google Maps JavaScript API.

To show the real interactive Google map:
1. Create a Google Cloud project and enable **Maps JavaScript API**.
2. Set up billing as required by Google Maps Platform.
3. Create an API key and restrict it to the APIs and usage you need.
4. In `public/index.html`, uncomment the Google Maps `<script>` line and replace `YOUR_API_KEY`.
5. For a production app, restrict the key and avoid exposing server-side secrets in frontend code.

## Important limitations

- This starter saves contacts and coordinates in the browser's local storage on this phone only.
- Adding a location to a contact captures the phone's current GPS position; it does **not** discover that person's location.
- Live family/friend tracking requires each person to consent, sign in on their own device, share location updates through a secure backend, and be able to stop sharing.
- For production, add authentication, a database, HTTPS, access controls, retention/deletion rules, and location-sharing invitations.
- Browser geolocation works only in secure contexts; `localhost` is treated as a secure context by modern browsers. Allow location permission for the site.

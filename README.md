# Find My Family

Find My Family is a mobile-first React app with a Node.js/Express production server. It includes email/password sign-in through Supabase, editable Family and Friends contacts, circular photo avatars, phone dialer shortcuts, saved GPS coordinates, Google Maps links, expiring live-location links, a registered-member directory, follow/unfollow, direct chats, group chats with invitation codes, and account-scoped cloud contact sync.

## Run on Android with Termux

Install Node.js in Termux, then from the repository folder:

    pkg update
    pkg install nodejs
    npm install
    npm install --prefix frontend

Create frontend/.env.local with your Supabase project URL and publishable/anon key:

    VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
    VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY

Use the project's real values; do not commit .env.local, service-role keys, or other secrets. Enable Email authentication in Supabase. This project intentionally uses email/password only; Google sign-in is not included.

Start the development server:

    npm run dev

Open the Vite URL shown in Termux. On the same phone, it is normally http://127.0.0.1:5173. Stop it with Ctrl+C.

## Build and run the production app

    npm install
    npm install --prefix frontend
    npm run build
    npm start

The Express server serves only frontend/dist on port 3000. It no longer silently falls back to the old Firebase-based interface when the React build is missing. Check http://127.0.0.1:3000/health for server status; a missing build returns HTTP 503. If you edit the React frontend, run npm run build again before testing the production server.

## Deploy and install on family phones

Deploy the repository to a Node.js host with a persistent HTTPS domain. Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY as build-time environment variables on the host, install both root and frontend dependencies, run npm run build, then start with npm start. The host must expose the configured port.

Open the HTTPS site in Chrome on Android and choose Install app or Chrome menu → Add to Home screen. The app has a custom SVG icon, web manifest, and service worker. A localhost or Termux LAN URL is not a public link for relatives.

## Features

- Account access: Supabase email/password sign-up, sign-in and sign-out.
- Family and Friends: create, search, edit and delete contact records, including name, relationship, group, phone, location name, GPS coordinates and photo. Contact books sync to the signed-in account when migration 003 is installed; each account has its own private contact book.
- Circular photos: upload JPG/PNG/WEBP images; the app compresses them before saving.
- Call now: opens the device dialer with the saved phone number; the user confirms the call.
- GPS and maps: capture the current device location, save coordinates, preview them on Google Maps, or open a saved place.
- Live location: start and stop a time-limited share link. The current implementation uses the signed-in device's GPS and needs the location-sharing migration below.
- Community: find registered members, follow/unfollow, start direct chats, create group chats, generate seven-day invite codes, and join a group by code. Migrations 002 and 004 are required.
- Installable shell: branded icon, web manifest, and production service worker.

## Required Supabase setup

Use the same Supabase project for development and deployment.

1. In Supabase, enable Authentication → Sign-in methods → Email.
2. Open SQL Editor and run the complete migration files in this order:
   - Location sharing: supabase/migrations/202610250001_location_sharing.sql
   - Registered members and chats: supabase/migrations/202610250002_social_follows_chats.sql
   - Account-scoped contact sync and chat ordering: supabase/migrations/202610250003_contact_sync_and_chat_order.sql
   - Group invitation codes: supabase/migrations/202610250004_group_invite_codes.sql
3. Confirm the frontend environment variables above point to that project.
4. Test with two separate registered accounts on an HTTPS deployment or localhost. Grant browser location permission when testing GPS.

Run all four migrations in numeric order. They configure tables, RPC functions, and row-level security for location sharing, member profiles, chats, account-scoped contacts, chat ordering, and group invitation codes. If a migration has not been run, the corresponding feature will report a setup error.

## Privacy and current storage boundaries

- Contact books sync between devices signed in to the same account after migration 003 is installed. Each account has its own contact book; contacts are not automatically shared with another account. Contact photos are compressed data URLs in the contact JSON, so large contact books may eventually need Supabase Storage.
- GPS capture captures the location of the phone using the button. It does not discover another person's location.
- Live sharing shares the signed-in phone's location only after the user starts sharing. Anyone holding the generated link may view the shared location until it expires or sharing is stopped; send it only to people you trust.
- Background tracking: browser location updates require the page/browser to remain active and location permission to stay enabled. This is not a guaranteed background-tracking native Android app.
- Chats: only registered accounts can follow or chat. Manually added contacts are not automatically accounts or chat recipients.
- Keys: the Supabase publishable/anon key is designed for browser use with correct row-level security. Never place a Supabase service-role key in frontend code.

## Troubleshooting

- Supabase not configured: check frontend/.env.local, then restart Vite.
- Social, contact sync, group invite, or live-share setup error: run all four SQL migration files in order in Supabase SQL Editor and check that each finished successfully.
- GPS unavailable: allow location permission and use localhost or HTTPS.
- Changes not visible in production: run npm run build again and reload the hosted app.
- Check server: open /health on the deployed URL.

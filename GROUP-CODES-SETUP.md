# Online Group Codes Setup

Family Groups and Friends Groups use Firebase Authentication and Cloud Firestore for codes, membership, and real-time chat.

1. In Firebase Console, create a database under Build → Firestore Database.
2. Under Authentication → Sign-in method, enable Email/Password. Each phone user should sign in with their own account.
3. Replace the REPLACE_WITH_... values in public/firebase-config.js with the web app config from Project settings → General → Your apps.
4. Deploy the security rules from this repository using Firebase CLI (computer or Firebase Cloud Shell):
   npm install -g firebase-tools
   firebase login
   firebase use YOUR_FIREBASE_PROJECT_ID
   firebase deploy --only firestore:rules
5. Run npm start in Termux and open http://127.0.0.1:3000. Sign in, create a Family or Friends group, and copy the generated code.
6. For another phone, deploy the site to a public HTTPS host, open that same URL, sign in with a different account, tap Join Group, and enter the code. localhost works only on the phone running Termux.

Group codes are private invitations. Contacts and GPS coordinates remain local to each device; this feature syncs group membership and messages only. Never put service-account private keys in public files.

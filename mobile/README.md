# Measurement Entry (Android app)

Offline-first app for recording customer measurements into ERPNext. It talks to the
`figleaf` app's API (`figleaf.api.mobile`) and works against any site that has that app installed.

## How it works

- **First launch:** enter the ERPNext web address, then username and password. The server returns an API
  token (the user's API key and secret), and the password is never stored.
- **Fingerprint:** after sign-in the app offers fingerprint unlock. The token is then kept in the Android
  keystore and can only be read after a fingerprint check. Without fingerprint, the token is kept in
  app storage. The app locks again after 5 minutes in the background.
- **Only assigned work on the phone:** the office creates a *Measurement Assignment* in ERPNext (from a
  Sales Order, a Quotation, or a Customer) for a tailor. The phone receives only that tailor's open
  assignments (customer name, order, garments, contact, notes) and the measurements of those assignments.
  No customer list, order list or other history is downloaded. When an assignment is completed,
  cancelled or reassigned, it and its measurements are removed from the phone at the next sync. Synced
  walk-ins are removed after 3 days. If the user is disabled or their password changes, the phone keeps
  only measurements that were never sent.
- **People list:** the office can list the people to measure on the assignment (name, staff ID,
  designation, gender, and garments if fewer than the assignment's). The app shows the list as a
  checklist: tap a person to go straight to their measurements, already filled in. "Add person" covers
  anyone who is not on the list. Progress shows as "measured of listed" in the app and on the form.
- **Walk-ins** (if allowed in Measurement Settings): the tailor types the customer name; the office links
  the record to a Customer later. The phone never creates customers.
- **Copy previous:** within the same assignment on the phone, or, while online, the server returns that
  one person's latest earlier measurement for the assigned customer (not stored on the phone).
- **Offline:** new measurements are saved on the phone first and sent when online: on save, when the
  network returns, every 5 minutes, and from the Sync button.
- **Safe retries:** every record has an `app_uuid`, so a sync interrupted halfway can be repeated
  without creating duplicates. If a record was changed in ERPNext after the phone last saw it, the
  ERPNext version wins and the app says so.
- **Garment diagram:** the same drawing as the ERPNext form (`../figleaf/public/js/garment_diagram.js`,
  imported via the `@garment-diagram` alias). A Garment Template can also carry its own image.

Tailors need the **Measurement User** role only. With just that role they see only their own
assignments and measurements, in the app and in ERPNext.

## Build

Requirements: Node 20+, JDK 21, Android SDK with platform 36 (`ANDROID_HOME` set).

```bash
npm install
npm run apk:debug     # android/app/build/outputs/apk/debug/app-debug.apk
npm run apk:release   # android/app/build/outputs/apk/release/app-release.apk (signed)
```

For development in a browser: `npm run dev`. Browser requests to another origin need CORS on the site,
while the Android app uses native HTTP and does not.

## Release signing

`android/keystore/` holds the release keystore and its passwords (`keystore.properties`). It is
git-ignored. **Keep a safe backup.** Updates to an installed app must be signed with the same key.
Bump `versionCode` / `versionName` in `android/app/build.gradle` and `VERSION` in `src/App.jsx` for
each release.

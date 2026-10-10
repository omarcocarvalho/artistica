# Privacy claims

Every sentence in Artistica that promises something about privacy, the tests that prove it, and what a translation may and may not do with it (overview M6-R23). A translation says exactly what the English says: no softer ("usually", "we try to"), no stronger ("100% secure", "encrypted", "anonymous"), and no new promises. The controller back-translates every claim of every language into English and records it in the M6 ledger; the final review checks them again against the code.

A line `` - `file` › text `` names a backing test (or CI step) and the file it lives in; `scripts/i18n-docs.test.ts` fails if the file is gone or the text is no longer in it.

## Landing page claims

The landing page's privacy box and its privacy-related FAQ answers, as they read for 1.0. The keys are proposed for `landing/locales/en.json`; the landing copy task fixes the final keys and wording and keeps this file in step with them.

### 1. `privacy.claims.inBrowser`: "Everything runs in your browser. Nothing is uploaded."

The app makes no request that carries a photo: only same-origin GETs with no body, plus the GET of a link the user typed to add an image from it. "Uploaded" means sent over the internet (glossary, "uploaded"), not the "Upload" button, which opens the file picker. Don't translate it as "nothing is shared" or "nothing is stored" (different promises).

- `e2e/privacy.spec.ts` › P1 import, layout, edit and export make no request except same-origin GETs and the typed URL
- `e2e/guides.spec.ts` › G-X2 nothing is uploaded: same-origin GETs with no body; the only new URLs are the four AI assets, each once
- `e2e/support-selfcheck.spec.ts` › the network guard is strict by default and honours the typed-URL allow-list
- `e2e/support-selfcheck.spec.ts` › the network guard treats any WebSocket as a violation
- `src/features/images/privacy.test.ts` › only the URL fetcher and the store wiring touch fetch
- `src/features/lines/detect/fetch-guard.test.ts` › refuses a Request object to another origin

### 2. `privacy.claims.notSaved`: "Photos are never saved. Refreshing the page clears them."

Photos live in memory only. "Never" stays absolute; "saved" means kept by the app (in the browser's storage), not "downloaded by you": the PDF the user downloads is theirs.

- `e2e/privacy.spec.ts` › P2 nothing from the photos is persisted: storage stays small and a reload starts empty (R12)
- `e2e/privacy.spec.ts` › G-P2 with guides: settings v5 keep only the detail; Cache Storage holds only AI assets; nothing from a photo
- `src/features/images/privacy.test.ts` › never persists or beacons anything

### 3. `privacy.claims.settingsOnly`: "Only your settings and presets are kept, on this device."

The browser's storage holds the settings and the named presets, nothing from a photo (no names, no pixels). "On this device" is the browser on this device: don't say "in your account" or "in the cloud", and don't drop "only".

- `e2e/privacy.spec.ts` › P-S1 presets saved with photos loaded: storage holds only settings v5, presets of whitelisted keys and no photo names
- `e2e/presets.spec.ts` › P-D2 "Export all" writes a presets file with whitelisted keys and nothing from the photos
- `e2e/app-shell.spec.ts` › page setup changes persist across reload (last-used settings)

### 4. `privacy.claims.models`: "Face and pose models download from this site only when you ask, and stay in your browser for offline use."

The models come from the app's own site (never from Google or another server), only after a tap on the download button, and are kept in the browser's cache. Keep all three parts: "from this site", "only when you ask", "stay in your browser".

- `e2e/guides.spec.ts` › G-D5 no download without a click: the box after "Apply lines to all" on every photo, and after a reload nothing is fetched
- `e2e/guides.spec.ts` › G-X2 nothing is uploaded: same-origin GETs with no body; the only new URLs are the four AI assets, each once
- `e2e/offline.spec.ts` › G-X1 works offline once the models are cached: reload from the service worker, add photos, guides in the preview and the PDF
- `src/features/lines/detect/loader.test.ts` › refuses a manifest entry that is not a same-origin path without a query

### 5. `privacy.claims.noTracking`: "No accounts and no tracking."

There is no sign-in and no analytics: the shipped files name no third-party host the app contacts, and the app sends nothing but same-origin GETs. Don't extend it to "no cookies" or "anonymous" (not claimed).

- `scripts/audit-hosts.test.ts` › scans every shipped file except notices and licences, and reports each violation with its file
- `.github/workflows/ci.yml` › node scripts/audit-hosts.ts dist
- `.github/workflows/deploy-pages.yml` › node scripts/audit-hosts.ts dist
- `e2e/privacy.spec.ts` › P1 import, layout, edit and export make no request except same-origin GETs and the typed URL

### 6. `privacy.claims.heroNeverLeave`: "Photos never leave your device"

The hero's short line (followed by "Free · No sign-up"). The same promise as claim 1, said from the photo's side.

- `e2e/privacy.spec.ts` › P1 import, layout, edit and export make no request except same-origin GETs and the typed URL
- `e2e/guides.spec.ts` › G-X2 nothing is uploaded: same-origin GETs with no body; the only new URLs are the four AI assets, each once

### 7. `privacy.claims.faqUploaded`: "No. Everything runs in your browser. Photos are never uploaded or saved, and refreshing the page clears them."

The answer to "Are my photos uploaded anywhere?": claims 1 and 2 together.

- `e2e/privacy.spec.ts` › P1 import, layout, edit and export make no request except same-origin GETs and the typed URL
- `e2e/privacy.spec.ts` › P2 nothing from the photos is persisted: storage stays small and a reload starts empty (R12)

### 8. `privacy.claims.faqGuides`: "Face and pose guides use Google's MediaPipe models, downloaded from this site and run on your device."

Names who made the models (Google's MediaPipe) without implying Google receives anything: the models are served by this site and run locally. Keep "downloaded from this site".

- `e2e/guides.spec.ts` › G-X2 nothing is uploaded: same-origin GETs with no body; the only new URLs are the four AI assets, each once
- `src/features/lines/detect/fetch-guard.test.ts` › refuses a Request object to another origin

### 9. `privacy.claims.faqOffline`: "Yes, after the first visit. Face and pose guides work offline after their one-time download."

The answer to "Can I use it offline?".

- `e2e/offline.spec.ts` › G-X1 works offline once the models are cached: reload from the service worker, add photos, guides in the preview and the PDF

## Claims in the app

Strings in the app that make the same promises. Their keys are in [context.md](context.md).

### A1. `app:topBar.privacy`, `app:empty.privacy`, `images:dropzone.privacy`: "Photos stay on this device" / "Nothing is uploaded. Photos stay on this device."

Claims 1 and 6. "Stay" is absolute; don't make it "are kept safe".

- `e2e/privacy.spec.ts` › P1 import, layout, edit and export make no request except same-origin GETs and the typed URL

### A2. `lines:guides.face.why`, `lines:guides.pose.why`, `lines:guides.onDevice`: "It's saved on this device and runs offline. Your photos are never uploaded." / "On device"

The model (not the photo) is saved on the device; the photos are never uploaded. Keep the two subjects apart: a translation must not say the photos are saved.

- `e2e/offline.spec.ts` › G-X1 works offline once the models are cached: reload from the service worker, add photos, guides in the preview and the PDF
- `e2e/privacy.spec.ts` › G-P2 with guides: settings v5 keep only the detail; Cache Storage holds only AI assets; nothing from a photo
- `e2e/guides.spec.ts` › G-X2 nothing is uploaded: same-origin GETs with no body; the only new URLs are the four AI assets, each once

### A3. `images:list.removeAll.confirmBody`: "Photos are not saved anywhere, so they can't be brought back."

Claim 2, stated as the consequence of removing them.

- `e2e/privacy.spec.ts` › P2 nothing from the photos is persisted: storage stays small and a reload starts empty (R12)

### A4. `pageSetup:remembered`, `presets:save.full`: "Settings are remembered on this device." / "the most this device keeps"

Claim 3: settings and presets are kept on this device.

- `e2e/app-shell.spec.ts` › page setup changes persist across reload (last-used settings)
- `e2e/privacy.spec.ts` › P-S1 presets saved with photos loaded: storage holds only settings v5, presets of whitelisted keys and no photo names

### A5. `presets:storageFailed`: "Not kept on this device: the browser’s storage is full or blocked. The change lasts until you reload or close the page."

An honest failure notice: when the browser refuses the write, the app says so instead of claiming the preset was saved. Keep both halves (not kept; lasts until reload or close).

- `src/app/components/PresetsDialog.test.tsx` › saving warns instead of announcing the save

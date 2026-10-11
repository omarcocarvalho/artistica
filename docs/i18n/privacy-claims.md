# Privacy claims

Every sentence in Artistica that promises something about privacy, the tests that prove it, and what a translation may and may not do with it (overview M6-R23). A translation says exactly what the English says: no softer ("usually", "we try to"), no stronger ("100% secure", "encrypted", "anonymous"), and no new promises. The controller back-translates every claim of every language into English and records it in the M6 ledger; the final review checks them again against the code.

A line `` - `file` › text `` names a backing test (or CI step) and the file it lives in; `scripts/i18n-docs.test.ts` fails if the file is gone or the text is no longer in it.

## Landing page claims

The landing page's privacy box (claims 1 to 5, in this order), the hero's privacy line (claim 6) and the privacy-related FAQ answers (claims 7 to 9). Each is one key under `privacy.claims` in `landing/locales/en.json`, and `landing/page.html` takes every privacy sentence from these keys. `landing/seo.test.ts` fails if a claim key is missing here or added there, if the quoted text differs from the English value, or if a claim names no backing test.

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

### 9. `privacy.claims.faqOffline`: "Yes, after your first visit to the app. Face and pose guides work offline after their one-time download."

The answer to "Can I use it offline?". The app registers its service worker on the first visit to the app (not the landing page), which keeps the app's files for offline use; the face and pose models are kept once downloaded. Keep "to the app" and "one-time download".

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

## Reviewed translations

Every claim key above in every translation (each plural form on its own row), with a hash of the translated text (`hashOf` in `scripts/check-locales.ts`, the hash the stamps use) and its back-translation into English. `scripts/i18n-docs.test.ts` fails when a translated claim no longer matches its hash, when a claim has no row, or when a row names no claim. A changed claim is back-translated again and checked against the English at the same strength (no softer, no stronger, no new promise) before its row is updated; the rows record what was reviewed, so they change only with that check.

| language | key | hash | back-translation |
| --- | --- | --- | --- |
| pt-BR | `landing:privacy.claims.inBrowser` | `0f9aa20c` | Everything runs in your browser. Nothing is sent. |
| pt-BR | `landing:privacy.claims.notSaved` | `5569a07b` | Photos are never saved. Reloading the page erases them. |
| pt-BR | `landing:privacy.claims.settingsOnly` | `db4f7e15` | Only your settings and presets are kept, on this device. |
| pt-BR | `landing:privacy.claims.models` | `842b10ff` | The face and pose models are downloaded from this site only when you ask, and stay in your browser for offline use. |
| pt-BR | `landing:privacy.claims.noTracking` | `b8bd4fbd` | No accounts and no tracking. |
| pt-BR | `landing:privacy.claims.heroNeverLeave` | `21896551` | Photos never leave your device |
| pt-BR | `landing:privacy.claims.faqUploaded` | `4bbec3d7` | No. Everything runs in your browser. Photos are never sent nor saved, and reloading the page erases them. |
| pt-BR | `landing:privacy.claims.faqGuides` | `a15b3fc3` | The face and pose guides use Google's MediaPipe models, downloaded from this site and run on your device. |
| pt-BR | `landing:privacy.claims.faqOffline` | `d08f0228` | Yes, after your first visit to the app. The face and pose guides work offline after a one-time download. |
| pt-BR | `app:topBar.privacy` | `11da40f2` | Photos stay on this device |
| pt-BR | `app:empty.privacy` | `ed4afb1e` | Nothing is sent. Photos stay on this device. |
| pt-BR | `images:dropzone.privacy` | `ed4afb1e` | Nothing is sent. Photos stay on this device. |
| pt-BR | `lines:guides.face.why` | `3d777190` | Face guides use a small AI model. It stays saved on this device and works offline. Your photos are never sent. |
| pt-BR | `lines:guides.pose.why` | `bc73b533` | Pose lines use a small AI model. It stays saved on this device and works offline. Your photos are never sent. |
| pt-BR | `lines:guides.onDevice` | `51730028` | On the device |
| pt-BR | `images:list.removeAll.confirmBody_one` | `d9e45911` | This removes {{count, number}} image from this session. Photos are not saved anywhere, so they cannot be recovered. |
| pt-BR | `images:list.removeAll.confirmBody_many` | `43e5e353` | This removes all {{count, number}} images from this session. Photos are not saved anywhere, so they cannot be recovered. |
| pt-BR | `images:list.removeAll.confirmBody_other` | `d889b335` | This removes all {{count, number}} images from this session. Photos are not saved anywhere, so they cannot be recovered. |
| pt-BR | `pageSetup:remembered` | `93137df9` | Settings are kept on this device. |
| pt-BR | `presets:save.full` | `af6b2fc3` | You have {{max}} presets, the most this device keeps. Delete one to save another. |
| pt-BR | `presets:storageFailed` | `86434110` | Not kept on this device: the browser's storage is full or blocked. The change holds until you reload or close the page. |
| ja | `landing:privacy.claims.inBrowser` | `b19d4d0a` | Everything runs inside the browser. Nothing is uploaded. |
| ja | `landing:privacy.claims.notSaved` | `0d543e5d` | Photos are never saved. Reloading the page clears them. |
| ja | `landing:privacy.claims.settingsOnly` | `029e3c19` | Only settings and presets are saved, and they are saved on this device. |
| ja | `landing:privacy.claims.models` | `4e8eb8e0` | Face and pose models are downloaded from this site only when you ask, and are kept in the browser so you can use them offline. |
| ja | `landing:privacy.claims.noTracking` | `4d81863f` | There are no accounts and no tracking. |
| ja | `landing:privacy.claims.heroNeverLeave` | `53241d64` | Photos do not leave the device |
| ja | `landing:privacy.claims.faqUploaded` | `72c024e8` | No. Everything runs inside the browser. Photos are never uploaded or saved, and reloading the page clears them. |
| ja | `landing:privacy.claims.faqGuides` | `6ff716e2` | Face and pose guides use Google's MediaPipe models. The models are downloaded from this site and run on your device. |
| ja | `landing:privacy.claims.faqOffline` | `7236e1cb` | Yes, after your first visit to the app. Face and pose guides also run offline after a one-time download. |
| ja | `app:topBar.privacy` | `53241d64` | Photos do not leave the device |
| ja | `app:empty.privacy` | `e54e6b7b` | Nothing is uploaded. Photos do not leave this device. |
| ja | `images:dropzone.privacy` | `e54e6b7b` | Nothing is uploaded. Photos do not leave this device. |
| ja | `lines:guides.face.why` | `e7fcbffe` | Face guides use a small AI model. The model is saved on this device and runs offline. Photos are never uploaded. |
| ja | `lines:guides.pose.why` | `14268266` | Pose lines use a small AI model. The model is saved on this device and runs offline. Photos are never uploaded. |
| ja | `lines:guides.onDevice` | `579a6faf` | On the device |
| ja | `images:list.removeAll.confirmBody_other` | `7f105328` | Removes all {{count, number}} images from this session. Photos are not saved anywhere, so this can't be undone. |
| ja | `pageSetup:remembered` | `f02613e2` | Settings are saved on this device. |
| ja | `presets:save.full` | `3c62205e` | You have {{max}} presets, the most this device can save. To save another preset, delete one. |
| ja | `presets:storageFailed` | `f61ea02c` | Not saved on this device: the browser's storage is full or blocked. The change lasts until you reload or close the page. |
| ko | `landing:privacy.claims.inBrowser` | `c97da0f6` | Everything runs inside the browser. Nothing is uploaded. |
| ko | `landing:privacy.claims.notSaved` | `141b1c69` | Photos are never saved. Refreshing the page makes them disappear. |
| ko | `landing:privacy.claims.settingsOnly` | `b7fc7a5f` | Only settings and presets are kept on this device. |
| ko | `landing:privacy.claims.models` | `979c4176` | Face and pose models are downloaded from this site only when you ask, and stay in the browser so you can use them offline. |
| ko | `landing:privacy.claims.noTracking` | `f8545143` | No accounts and no tracking. |
| ko | `landing:privacy.claims.heroNeverLeave` | `675eb943` | Photos never leave the device |
| ko | `landing:privacy.claims.faqUploaded` | `ad9e46ca` | No. Everything runs inside the browser. Photos are never uploaded or saved, and refreshing the page makes them disappear. |
| ko | `landing:privacy.claims.faqGuides` | `bee1c588` | Face and pose guides use Google's MediaPipe models. The models are downloaded from this site and run on my device. |
| ko | `landing:privacy.claims.faqOffline` | `ac0d889e` | Yes, from after your first visit to the app. Face and pose guides work offline after a one-time download. |
| ko | `app:topBar.privacy` | `b106ec59` | Photos are only on this device |
| ko | `app:empty.privacy` | `fed974ca` | Nothing is uploaded. Photos are only on this device. |
| ko | `images:dropzone.privacy` | `fed974ca` | Nothing is uploaded. Photos are only on this device. |
| ko | `lines:guides.face.why` | `be0ea586` | Face guides use a small AI model. The model is saved on this device and runs offline. Photos are never uploaded. |
| ko | `lines:guides.pose.why` | `28f344f4` | Pose lines use a small AI model. The model is saved on this device and runs offline. Photos are never uploaded. |
| ko | `lines:guides.onDevice` | `2c51bd39` | On the device |
| ko | `images:list.removeAll.confirmBody_other` | `d238713f` | Removes all {{count, number}} images of this session. Photos are not saved anywhere, so it can't be undone. |
| ko | `pageSetup:remembered` | `bc890320` | Settings are remembered on this device. |
| ko | `presets:save.full` | `dbcc0169` | You have {{max}} presets, the most this device can keep. Delete one and you can save a new one. |
| ko | `presets:storageFailed` | `00307a91` | Not kept on this device: the browser storage is full or blocked. The changes last only until you refresh or close the page. |
| it | `landing:privacy.claims.inBrowser` | `0771f4cf` | Everything runs in your browser. Nothing is uploaded. |
| it | `landing:privacy.claims.notSaved` | `36f8b439` | Photos are never saved. Reloading the page deletes them. |
| it | `landing:privacy.claims.settingsOnly` | `a18fcf93` | Only your settings and your presets are kept, on this device. |
| it | `landing:privacy.claims.models` | `3bdf834c` | The face and pose models download from this site only when you ask, and stay in your browser for offline use. |
| it | `landing:privacy.claims.noTracking` | `94b8230d` | No account and no tracking. |
| it | `landing:privacy.claims.heroNeverLeave` | `c431142b` | Photos never leave your device |
| it | `landing:privacy.claims.faqUploaded` | `dd7647ef` | No. Everything runs in your browser. Photos are never uploaded or saved, and reloading the page deletes them. |
| it | `landing:privacy.claims.faqGuides` | `345cc9b1` | The face and pose guides use Google's MediaPipe models, downloaded from this site and run on your device. |
| it | `landing:privacy.claims.faqOffline` | `e3191c08` | Yes, after your first visit to the app. The face and pose guides work offline after their one-time download. |
| it | `app:topBar.privacy` | `c765549f` | Photos stay on the device |
| it | `app:empty.privacy` | `9f4620e4` | Nothing is uploaded. Photos stay on this device. |
| it | `images:dropzone.privacy` | `9f4620e4` | Nothing is uploaded. Photos stay on this device. |
| it | `lines:guides.face.why` | `5dd956f6` | The face guides use a small AI model. It is saved on this device and works offline. Your photos are never uploaded. |
| it | `lines:guides.pose.why` | `50f26aeb` | The pose lines use a small AI model. It is saved on this device and works offline. Your photos are never uploaded. |
| it | `lines:guides.onDevice` | `ad4982d9` | On the device |
| it | `images:list.removeAll.confirmBody_one` | `9fa3fcdb` | Removes {{count, number}} image from this session. Photos are not saved anywhere, so they can't be recovered. |
| it | `images:list.removeAll.confirmBody_many` | `b47995b2` | Removes all {{count, number}} images from this session. Photos are not saved anywhere, so they can't be recovered. |
| it | `images:list.removeAll.confirmBody_other` | `4cd3389b` | Removes all {{count, number}} images from this session. Photos are not saved anywhere, so they can't be recovered. |
| it | `pageSetup:remembered` | `68f9875d` | Settings are remembered on this device. |
| it | `presets:save.full` | `bdf484b7` | You have {{max}} presets, the most this device keeps. Delete one to save another. |
| it | `presets:storageFailed` | `74b6d642` | Not kept on this device: the browser's storage is full or blocked. The change lasts until you reload or close the page. |
| es | `landing:privacy.claims.inBrowser` | `d3e603e7` | Everything works in your browser. Nothing is uploaded. |
| es | `landing:privacy.claims.notSaved` | `be04c86d` | Photos are never saved. When the page is reloaded, they are erased. |
| es | `landing:privacy.claims.settingsOnly` | `f67232fd` | Only your settings and your presets are kept, on this device. |
| es | `landing:privacy.claims.models` | `e36d640a` | The face and pose models download from this site only when you ask, and stay in your browser so you can use them offline. |
| es | `landing:privacy.claims.noTracking` | `78dc3048` | No accounts and no tracking. |
| es | `landing:privacy.claims.heroNeverLeave` | `9d471712` | Photos never leave your device |
| es | `landing:privacy.claims.faqUploaded` | `e755f1ee` | No. Everything works in your browser. Photos are never uploaded or saved, and when the page is reloaded they are erased. |
| es | `landing:privacy.claims.faqGuides` | `b4d059f0` | The face and pose guides use Google's MediaPipe models, downloaded from this site and run on your device. |
| es | `landing:privacy.claims.faqOffline` | `f4e289ff` | Yes, after your first visit to the app. The face and pose guides work offline after their one-time download. |
| es | `app:topBar.privacy` | `967a92c5` | Photos only on your device |
| es | `app:empty.privacy` | `394acbd6` | Nothing is uploaded. Photos stay on this device. |
| es | `images:dropzone.privacy` | `394acbd6` | Nothing is uploaded. Photos stay on this device. |
| es | `lines:guides.face.why` | `9c2c4d8b` | The face guides use a small AI model. It is saved on this device and works offline. Your photos are never uploaded. |
| es | `lines:guides.pose.why` | `010dc8b4` | The pose lines use a small AI model. It is saved on this device and works offline. Your photos are never uploaded. |
| es | `lines:guides.onDevice` | `d0b29830` | On the device |
| es | `images:list.removeAll.confirmBody_one` | `88d6b344` | This removes {{count, number}} image from this session. Photos are not saved anywhere, so they can't be recovered. |
| es | `images:list.removeAll.confirmBody_many` | `a1852445` | This removes {{count, number}} images from this session. Photos are not saved anywhere, so they can't be recovered. |
| es | `images:list.removeAll.confirmBody_other` | `9a3574d2` | This removes the {{count, number}} images from this session. Photos are not saved anywhere, so they can't be recovered. |
| es | `pageSetup:remembered` | `aae3c81a` | Settings are remembered on this device. |
| es | `presets:save.full` | `b285d3c5` | You have {{max}} presets, the most this device keeps. Delete one to save another. |
| es | `presets:storageFailed` | `373e3ae7` | Not saved on this device: the browser's storage is full or blocked. The change lasts until you reload or close the page. |
| zh-CN | `landing:privacy.claims.inBrowser` | `f380f273` | Everything runs in your browser. Nothing is uploaded. |
| zh-CN | `landing:privacy.claims.notSaved` | `9f2c3669` | Photos are never saved. Refreshing the page clears them. |
| zh-CN | `landing:privacy.claims.settingsOnly` | `ce100a93` | Only your settings and presets are saved on this device. |
| zh-CN | `landing:privacy.claims.models` | `e2a15619` | Face and pose models are downloaded from this site only when you ask, and stay in your browser for offline use. |
| zh-CN | `landing:privacy.claims.noTracking` | `74deb591` | No accounts, and no tracking. |
| zh-CN | `landing:privacy.claims.heroNeverLeave` | `bdbc829f` | Photos never leave your device |
| zh-CN | `landing:privacy.claims.faqUploaded` | `ad90bae4` | No. Everything runs in your browser. Photos are never uploaded or saved, and refreshing the page clears them. |
| zh-CN | `landing:privacy.claims.faqGuides` | `bf209b8c` | Face and pose guides use Google's MediaPipe models, downloaded from this site and run on your device. |
| zh-CN | `landing:privacy.claims.faqOffline` | `e173c16f` | Yes, after your first visit to the app. Face and pose guides can be used offline after a one-time download. |
| zh-CN | `app:topBar.privacy` | `2d2d9ae9` | Photos stay on this device |
| zh-CN | `app:empty.privacy` | `1c35807b` | Nothing is uploaded. Photos stay on this device. |
| zh-CN | `images:dropzone.privacy` | `1c35807b` | Nothing is uploaded. Photos stay on this device. |
| zh-CN | `lines:guides.face.why` | `ca660605` | Face guides use a small AI model. The model is saved on this device and can run offline. Your photos are never uploaded. |
| zh-CN | `lines:guides.pose.why` | `0f1932c0` | Pose lines use a small AI model. The model is saved on this device and can run offline. Your photos are never uploaded. |
| zh-CN | `lines:guides.onDevice` | `8a94c4a1` | This device |
| zh-CN | `images:list.removeAll.confirmBody_other` | `40853737` | This removes all {{count, number}} images from this session. Photos are not saved anywhere, so they cannot be recovered once removed. |
| zh-CN | `pageSetup:remembered` | `95911506` | Settings are saved on this device. |
| zh-CN | `presets:save.full` | `f7390a78` | You already have {{max}} presets, the most this device can save. Delete one to save a new one. |
| zh-CN | `presets:storageFailed` | `2c222e2f` | Not saved on this device: the browser's storage is full or blocked. This change lasts until you reload or close the page. |

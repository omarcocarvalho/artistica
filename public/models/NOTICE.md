# Third-party models and runtime

Artistica draws face and pose guides with Google's MediaPipe. The models below and the MediaPipe runtime are served from this site, downloaded only when a guide needs them, and run in the browser. No photo leaves the device.

All of them are licensed under the Apache License, Version 2.0; the full text is in `LICENSE-APACHE-2.0.txt` beside this file. They are made by Google's MediaPipe team and shipped unmodified.

## Models

| File | Bytes | SHA-256 | Source |
|---|---|---|---|
| `face_landmarker-float16-1.task` | 3,758,596 | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` | https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task |
| `pose_landmarker_full-float16-1.task` | 9,398,198 | `5134a3aad27a58b93da0088d431f366da362b44e3ccfbe3462b3827a839011b1` | https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task |

The face landmarker bundles BlazeFace (short range), Face Mesh V2 and Blendshape V2; the pose landmarker is BlazePose GHUM 3D (full). Model cards:

- BlazeFace (short range): https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20(Short%20Range).pdf
- Face Mesh V2: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf
- Blendshape V2: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf
- BlazePose GHUM 3D: https://storage.googleapis.com/mediapipe-assets/Model%20Card%20BlazePose%20GHUM%203D.pdf

## Runtime

`@mediapipe/tasks-vision` 0.10.35 from npm (https://www.npmjs.com/package/@mediapipe/tasks-vision), Apache-2.0. Its WebAssembly runtime ships under `assets/` as `vision_wasm_module_internal-<hash>.js` (322,082 bytes, SHA-256 `1f1d6215324a1fe62f6742d49a3db911170987ca18ad8c1b75f1a1c82acf2b44`) and `vision_wasm_module_internal-<hash>.wasm` (11,153,641 bytes, SHA-256 `617b8e0248dbd27e9d7ece4218004eae4cefb499196d1bb4fa0e3fef21708756`).

## Use in Artistica

Artistica uses the landmarks only to draw construction guides (face proportions, a stick figure) over a reference photo the artist chose, on that artist's device.

Out of scope, as the model cards state: any form of surveillance or identity recognition, which these models do not enable; human life-critical decisions. The models are designed for faces and bodies seen clearly from the front by a camera nearby (BlazeFace: within about 2 m; BlazePose: one person within about 4 m, head visible), so guides for crowds, distant people, faces turned away or a hidden head may be missing or wrong.

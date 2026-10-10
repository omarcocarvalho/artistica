# Changelog

## [0.5.0](https://github.com/omarcocarvalho/artistica/compare/v0.4.0...v0.5.0) (2026-10-10)


### Features

* **app:** add the Presets dialog with JSON export and import ([#174](https://github.com/omarcocarvalho/artistica/issues/174)) ([0afa530](https://github.com/omarcocarvalho/artistica/commit/0afa53001c61b1d8490de6b6e046a82349700327))
* **app:** arrange photos on the phone ([#178](https://github.com/omarcocarvalho/artistica/issues/178)) ([bb0d357](https://github.com/omarcocarvalho/artistica/commit/bb0d357bad8345078e09bbe9cd7d03b366fab941))
* **app:** export inline on the phone and show why Export is off ([#170](https://github.com/omarcocarvalho/artistica/issues/170)) ([06bbde1](https://github.com/omarcocarvalho/artistica/commit/06bbde199ffa0b9a80e2829802a46548771fe366))
* **app:** replace the placeholder logo ([#169](https://github.com/omarcocarvalho/artistica/issues/169)) ([be98972](https://github.com/omarcocarvalho/artistica/commit/be989721249d4781fa19d4d5fe6b4e1686860108))
* **layout:** keep manual edits through photo and setting changes ([#167](https://github.com/omarcocarvalho/artistica/issues/167)) ([a5a926e](https://github.com/omarcocarvalho/artistica/commit/a5a926ee2d7a135b12ccfddca722feadfcf6000e))
* **render:** drag, swap and resize photos on the page ([#176](https://github.com/omarcocarvalho/artistica/issues/176)) ([0c6607e](https://github.com/omarcocarvalho/artistica/commit/0c6607ee5af11f4f355897ac974fe0da963c922b))
* **settings:** add the preset model and file format ([#155](https://github.com/omarcocarvalho/artistica/issues/155)) ([3d2b787](https://github.com/omarcocarvalho/artistica/commit/3d2b787a333fb1ccbc4b0a98c27f52adab52b286))
* **settings:** keep named presets on this device (schema v5) ([#166](https://github.com/omarcocarvalho/artistica/issues/166)) ([66b5730](https://github.com/omarcocarvalho/artistica/commit/66b573084d444eae105b2824c1507127b8c97c15))


### Bug Fixes

* **app:** announce layout updates only when slow, and label image details ([#159](https://github.com/omarcocarvalho/artistica/issues/159)) ([fb54e4c](https://github.com/omarcocarvalho/artistica/commit/fb54e4c04af0b3246c990e87a42a20608aa94906))
* **images:** bound waiting downloads and let imports be cancelled ([#161](https://github.com/omarcocarvalho/artistica/issues/161)) ([bed4bf1](https://github.com/omarcocarvalho/artistica/commit/bed4bf1b2dec4f9cd57044fb302ecb1dd9cd0851))
* **images:** move and resize the crop without dragging ([#182](https://github.com/omarcocarvalho/artistica/issues/182)) ([36f0ed3](https://github.com/omarcocarvalho/artistica/commit/36f0ed3e3620ac6e1e835ccafa18a3f5e394a74e))
* **lines:** scale the centre-line dash with the tile ([#154](https://github.com/omarcocarvalho/artistica/issues/154)) ([10d59f9](https://github.com/omarcocarvalho/artistica/commit/10d59f9101760fe059630b5afc4f97f0801e5155))
* **preview:** end the arrangement on full undo and keep focus on Undo and Re-run ([#185](https://github.com/omarcocarvalho/artistica/issues/185)) ([1778152](https://github.com/omarcocarvalho/artistica/commit/17781526f6112cdc2c8ad0162f8a505c8c0dc1ed))
* **preview:** keep focus where it was moved before a closed sheet returns it ([#187](https://github.com/omarcocarvalho/artistica/issues/187)) ([1a330f6](https://github.com/omarcocarvalho/artistica/commit/1a330f69bd4f500a23f4657ac93a34dd0a43a14e))
* **preview:** keep the arrange selection when tabbing back and move photos between pages by keyboard ([#180](https://github.com/omarcocarvalho/artistica/issues/180)) ([c72c244](https://github.com/omarcocarvalho/artistica/commit/c72c24443a4178bb1cd310954429e6d927214d2f))
* **settings:** keep presets saved in another tab and report failed saves ([#184](https://github.com/omarcocarvalho/artistica/issues/184)) ([5d4dd67](https://github.com/omarcocarvalho/artistica/commit/5d4dd67a737ccf62a58958d97e1ea8ebd6db6ab6))
* **ui:** move segmented controls with all four arrows, Home and End ([#158](https://github.com/omarcocarvalho/artistica/issues/158)) ([c2ca3d0](https://github.com/omarcocarvalho/artistica/commit/c2ca3d0c87812a2bc1ba88a06e18b7f3766287af))


### Performance Improvements

* **app:** update the preview within 200 ms of a setting change ([#177](https://github.com/omarcocarvalho/artistica/issues/177)) ([944e126](https://github.com/omarcocarvalho/artistica/commit/944e12638263ac69e63424e0f4cdddab049dd8a6))
* **render:** render study tiles only for pages near the view ([#168](https://github.com/omarcocarvalho/artistica/issues/168)) ([22b807c](https://github.com/omarcocarvalho/artistica/commit/22b807cc2859319b0acea689bb91b64b51bbc3b7))

## [0.4.0](https://github.com/omarcocarvalho/artistica/compare/v0.3.0...v0.4.0) (2026-10-09)


### Features

* **app:** keep the app available offline with a service worker ([#134](https://github.com/omarcocarvalho/artistica/issues/134)) ([3dfeb41](https://github.com/omarcocarvalho/artistica/commit/3dfeb413f8d1887df15e477d6ef88d105a391b58))
* **app:** wire guides, downloads and the export gate ([#142](https://github.com/omarcocarvalho/artistica/issues/142)) ([35df867](https://github.com/omarcocarvalho/artistica/commit/35df8670a5f1fe50a4b58640b48f2f231c80741e))
* **lines:** add the edge, face and pose line settings ([#122](https://github.com/omarcocarvalho/artistica/issues/122)) ([00f8aad](https://github.com/omarcocarvalho/artistica/commit/00f8aad12cc497b06a583d70ccf932381fd96cc0))
* **lines:** add the Guides from the photo section ([#132](https://github.com/omarcocarvalho/artistica/issues/132)) ([7b91058](https://github.com/omarcocarvalho/artistica/commit/7b91058e1e044438fcd42808beaa16a26beb3087))
* **lines:** build face construction lines from landmarks ([#139](https://github.com/omarcocarvalho/artistica/issues/139)) ([88541bb](https://github.com/omarcocarvalho/artistica/commit/88541bb805e61154f50a80ada78d5e84ad9d75e3))
* **lines:** build the pose figure from landmarks ([#138](https://github.com/omarcocarvalho/artistica/issues/138)) ([9833a32](https://github.com/omarcocarvalho/artistica/commit/9833a329fe48e9e7c7ce748ef3323dda8ee2b443))
* **lines:** download AI assets once, with progress, into the cache ([#133](https://github.com/omarcocarvalho/artistica/issues/133)) ([a0f66e6](https://github.com/omarcocarvalho/artistica/commit/a0f66e6d8c6135dd6ff807b1c19c6b81503e21e3))
* **lines:** find faces and poses in a worker ([#135](https://github.com/omarcocarvalho/artistica/issues/135)) ([19f7cd4](https://github.com/omarcocarvalho/artistica/commit/19f7cd48a627d721f0b59c95eae3eda1412a79e7))
* **lines:** map source pixels onto the picture frame ([#126](https://github.com/omarcocarvalho/artistica/issues/126)) ([fef95cb](https://github.com/omarcocarvalho/artistica/commit/fef95cbc3779bdc876a52399b3f81499912d6c36))
* **lines:** self-host the MediaPipe runtime and models ([#130](https://github.com/omarcocarvalho/artistica/issues/130)) ([4c02af2](https://github.com/omarcocarvalho/artistica/commit/4c02af2c3d6d00f644bd233be9091a1020f7ca96))
* **lines:** trace and simplify edges into a budgeted outline ([#128](https://github.com/omarcocarvalho/artistica/issues/128)) ([fd21207](https://github.com/omarcocarvalho/artistica/commit/fd21207bdbe37fef9aaa6e38e46916dc2d247b23))
* **render:** carry edge, face and pose lines in the page model ([#141](https://github.com/omarcocarvalho/artistica/issues/141)) ([63137a5](https://github.com/omarcocarvalho/artistica/commit/63137a580b47fe30ea91c4f926a17a4bfa0c85fa))


### Bug Fixes

* **lines:** centre the pose head circle on the cranium in profile ([#140](https://github.com/omarcocarvalho/artistica/issues/140)) ([6450c13](https://github.com/omarcocarvalho/artistica/commit/6450c13405e6e1262e6528fad42b01ff101b3daf))
* **lines:** close fetch-guard and silent re-download gaps ([#149](https://github.com/omarcocarvalho/artistica/issues/149)) ([8202465](https://github.com/omarcocarvalho/artistica/commit/8202465a9a624ef9b3f57bb00949d42232b6451a))
* **lines:** pin the edge seed floor and keep the pose head size near frontal ([#146](https://github.com/omarcocarvalho/artistica/issues/146)) ([ae4f4ec](https://github.com/omarcocarvalho/artistica/commit/ae4f4ec42f95b836906c5533fda439fad1ad948e))
* **lines:** tidy guide announcements and pin their copy ([#148](https://github.com/omarcocarvalho/artistica/issues/148)) ([3677357](https://github.com/omarcocarvalho/artistica/commit/36773577d0c967f9d5861041132b0e814f78510c))


### Performance Improvements

* **lines:** release face and pose memory sooner ([#145](https://github.com/omarcocarvalho/artistica/issues/145)) ([fb71f74](https://github.com/omarcocarvalho/artistica/commit/fb71f74a76243c73841ee32261e85f84190ff9b3))

## [0.3.0](https://github.com/omarcocarvalho/artistica/compare/v0.2.0...v0.3.0) (2026-10-07)


### Features

* **app:** wire lines into the desktop tabs and the phone Studies step ([#115](https://github.com/omarcocarvalho/artistica/issues/115)) ([02c6398](https://github.com/omarcocarvalho/artistica/commit/02c639854c182035abbeba9a846003e205cf6a7f))
* **images:** keep line settings per image, with apply to all ([#105](https://github.com/omarcocarvalho/artistica/issues/105)) ([315a116](https://github.com/omarcocarvalho/artistica/commit/315a116601ad05b81c7eafa9f743891ff04a30c5))
* **layout:** rank duplicate photos by their lines too ([#106](https://github.com/omarcocarvalho/artistica/issues/106)) ([b1c4db6](https://github.com/omarcocarvalho/artistica/commit/b1c4db63dd02dd9c05173058ac327c2b435889d5))
* **lines:** add straight composition-line geometry and frame mapping ([#107](https://github.com/omarcocarvalho/artistica/issues/107)) ([35fc4f0](https://github.com/omarcocarvalho/artistica/commit/35fc4f099e297b9e080ae77af7eccd6399f1ac81))
* **lines:** add the composition-line settings model ([#103](https://github.com/omarcocarvalho/artistica/issues/103)) ([1bcc321](https://github.com/omarcocarvalho/artistica/commit/1bcc3211f2213e2fbe3544d2e3efc05ea586617f))
* **lines:** add the golden spiral ([#109](https://github.com/omarcocarvalho/artistica/issues/109)) ([1b9b3cf](https://github.com/omarcocarvalho/artistica/commit/1b9b3cf2ce8d7f951ed0467df0490448fdd0c8fd))
* **lines:** add the lines panel ([#110](https://github.com/omarcocarvalho/artistica/issues/110)) ([b5882e8](https://github.com/omarcocarvalho/artistica/commit/b5882e8df00493508e4fba4f0a525e284bf17e74))
* **render:** carry composition lines in the page model ([#111](https://github.com/omarcocarvalho/artistica/issues/111)) ([6add0dd](https://github.com/omarcocarvalho/artistica/commit/6add0dd2cf54b245c21a74767fe94aa56dcc2404))
* **render:** draw composition lines as vector paths in the PDF ([#113](https://github.com/omarcocarvalho/artistica/issues/113)) ([ec00cf2](https://github.com/omarcocarvalho/artistica/commit/ec00cf24a46e3555172caccfd8b3e268a6d1ba72))
* **render:** draw composition lines in the preview ([#112](https://github.com/omarcocarvalho/artistica/issues/112)) ([b71436c](https://github.com/omarcocarvalho/artistica/commit/b71436cdaf5d894b4a078d3b6c593017a732dfd2))
* **settings:** persist line defaults (schema v3) ([#108](https://github.com/omarcocarvalho/artistica/issues/108)) ([1f5f5d9](https://github.com/omarcocarvalho/artistica/commit/1f5f5d9989e6dc05467f3c55da8ebb1833732778))


### Bug Fixes

* **app:** keep the phone Lines section open ([#120](https://github.com/omarcocarvalho/artistica/issues/120)) ([ec0b280](https://github.com/omarcocarvalho/artistica/commit/ec0b280ea346e147ae0dbf0dac1fab5677ddbf46))
* **lines:** reach the line colour by keyboard in WebKit and harden apply-to-all ([#118](https://github.com/omarcocarvalho/artistica/issues/118)) ([bd3b0b2](https://github.com/omarcocarvalho/artistica/commit/bd3b0b2a7ea8312a3543617eff3c9378ed86b0e6))

## [0.2.0](https://github.com/omarcocarvalho/artistica/compare/v0.1.0...v0.2.0) (2026-10-07)


### Features

* **app:** wire studies into the desktop tabs and the phone flow ([#93](https://github.com/omarcocarvalho/artistica/issues/93)) ([18b02ef](https://github.com/omarcocarvalho/artistica/commit/18b02efd4319ac9a5a3d3715a54de42fe8943873))
* **images:** keep study settings per image, with apply to all ([#82](https://github.com/omarcocarvalho/artistica/issues/82)) ([3da9018](https://github.com/omarcocarvalho/artistica/commit/3da90180c79addd074fc9d88afa623ed84d0904f))
* **layout:** pack the study versions of an image as one group ([#85](https://github.com/omarcocarvalho/artistica/issues/85)) ([1990a81](https://github.com/omarcocarvalho/artistica/commit/1990a811956bd757bd14dbbb3011cd6d1bf60071))
* **render:** carry study versions in the page model ([#83](https://github.com/omarcocarvalho/artistica/issues/83)) ([ef95200](https://github.com/omarcocarvalho/artistica/commit/ef95200a38d1cc4f75dc3cd9a3b256de9ff5aa72))
* **render:** draw study tiles, version chips and group outlines in the preview ([#88](https://github.com/omarcocarvalho/artistica/issues/88)) ([ceb9524](https://github.com/omarcocarvalho/artistica/commit/ceb9524cfa851250f4551979b8071197650a09f2))
* **render:** render studies in the PDF, value studies as PNG ([#91](https://github.com/omarcocarvalho/artistica/issues/91)) ([c1d6266](https://github.com/omarcocarvalho/artistica/commit/c1d6266f7d9dc7c0267407c2b59fd0d027159aba))
* **settings:** persist study defaults (schema v2) ([#81](https://github.com/omarcocarvalho/artistica/issues/81)) ([cf0b1c3](https://github.com/omarcocarvalho/artistica/commit/cf0b1c30cba55a485ef3d5b8323973fc37df4055))
* **shared:** add OKLCH colour maths ([#78](https://github.com/omarcocarvalho/artistica/issues/78)) ([aad0291](https://github.com/omarcocarvalho/artistica/commit/aad02910a6aa59e549848a3d5835402ee117dc2c))
* **studies:** add the single-hue value ramp and posterisation ([#86](https://github.com/omarcocarvalho/artistica/issues/86)) ([8c0604f](https://github.com/omarcocarvalho/artistica/commit/8c0604f671504476dba14a69190e6287fa20925f))
* **studies:** add the studies panel ([#90](https://github.com/omarcocarvalho/artistica/issues/90)) ([861612a](https://github.com/omarcocarvalho/artistica/commit/861612a6a0449dbd8cef34155c941dd3ad78bb1b))
* **studies:** add the study settings model ([#79](https://github.com/omarcocarvalho/artistica/issues/79)) ([c0465b6](https://github.com/omarcocarvalho/artistica/commit/c0465b67ad98b0f7965091f6c6efe72b3e28556b))
* **studies:** apply owner answers for defaults, imports in progress and selection after removal ([#101](https://github.com/omarcocarvalho/artistica/issues/101)) ([c807205](https://github.com/omarcocarvalho/artistica/commit/c8072058219a949cf87081d2df5325471508e08e))
* **studies:** render preview study tiles in a worker ([#92](https://github.com/omarcocarvalho/artistica/issues/92)) ([3afd343](https://github.com/omarcocarvalho/artistica/commit/3afd3432cf9069f4096d8764fcaf5aa32838f416))


### Bug Fixes

* **a11y:** make phone form controls 44 px tall ([#97](https://github.com/omarcocarvalho/artistica/issues/97)) ([e1f2e9e](https://github.com/omarcocarvalho/artistica/commit/e1f2e9e91b7c8691dadfb16743d1fa1bec51e616))
* **studies:** draw failed study tiles as missing and budget the studies memory peak ([#98](https://github.com/omarcocarvalho/artistica/issues/98)) ([dd053f9](https://github.com/omarcocarvalho/artistica/commit/dd053f9a98654c8766f6978051b4ce6c678c9ef9))
* **studies:** keep swatches and the ramp visible in forced colors and clear stale announcements ([#96](https://github.com/omarcocarvalho/artistica/issues/96)) ([5ba2abe](https://github.com/omarcocarvalho/artistica/commit/5ba2abe354449b0fd689f886833ef5e3bb033876))

## [0.1.0](https://github.com/omarcocarvalho/artistica/compare/v0.0.1...v0.1.0) (2026-10-06)


### Features

* **app:** add app shell with desktop workspace, theme toggle and empty state ([#38](https://github.com/omarcocarvalho/artistica/issues/38)) ([aff89d1](https://github.com/omarcocarvalho/artistica/commit/aff89d17a5629278ce8ccb908b89ca409600852d))
* **app:** add phone step flow and responsive sheet ([#44](https://github.com/omarcocarvalho/artistica/issues/44)) ([2cae5ae](https://github.com/omarcocarvalho/artistica/commit/2cae5aea18377e97b5bdeb99fa22f0572e019641))
* **app:** enforce i18n lint rule and translate the placeholder app ([#24](https://github.com/omarcocarvalho/artistica/issues/24)) ([4675a49](https://github.com/omarcocarvalho/artistica/commit/4675a496baa796982e5074d430f68f35b0b0485a))
* **app:** mount page setup panel and add responsive shell E2E ([#47](https://github.com/omarcocarvalho/artistica/issues/47)) ([cab6133](https://github.com/omarcocarvalho/artistica/commit/cab6133f409642077f45d2515aeed2cba238239c))
* **app:** wire image import, list, edit sheet, selection sync and paste notices ([#58](https://github.com/omarcocarvalho/artistica/issues/58)) ([38ab502](https://github.com/omarcocarvalho/artistica/commit/38ab502f1773ceacf8a65a9a4759811dc6df091a))
* **app:** wire layout pipeline, page preview and fits-per-page suggestion ([#61](https://github.com/omarcocarvalho/artistica/issues/61)) ([c52d089](https://github.com/omarcocarvalho/artistica/commit/c52d089f827b8f0d358d134f153c48ac30534539))
* **app:** wire PDF export and leave-page warning ([#62](https://github.com/omarcocarvalho/artistica/issues/62)) ([0e4f36c](https://github.com/omarcocarvalho/artistica/commit/0e4f36cab48672ae9f258cea3180cf79cf9c070e))
* **design:** add theme tokens, self-hosted fonts, base styles and icons ([#20](https://github.com/omarcocarvalho/artistica/issues/20)) ([cf8e2be](https://github.com/omarcocarvalho/artistica/commit/cf8e2be02bef8420fcf9fecb6ee52f41a28e5a10))
* **i18n:** add i18next setup, namespaces and English skeletons ([#16](https://github.com/omarcocarvalho/artistica/issues/16)) ([f101478](https://github.com/omarcocarvalho/artistica/commit/f101478c882c026b9c1ae62198e7eb2d0e874fb3))
* **images:** add crop math and edit sanitising ([#27](https://github.com/omarcocarvalho/artistica/issues/27)) ([366f06b](https://github.com/omarcocarvalho/artistica/commit/366f06b992050c5000bbf125990b32bb3ab6d50d))
* **images:** add rotate/flip mapping and DPI helpers ([#33](https://github.com/omarcocarvalho/artistica/issues/33)) ([e71146b](https://github.com/omarcocarvalho/artistica/commit/e71146b6b432984065e2bdf52b79a437c7be5a0b))
* **images:** add the ImageEditSheet content ([#53](https://github.com/omarcocarvalho/artistica/issues/53)) ([fdf2ca6](https://github.com/omarcocarvalho/artistica/commit/fdf2ca6268c53626e154879740039b9da5c40c21))
* **images:** add the ImageList component ([#49](https://github.com/omarcocarvalho/artistica/issues/49)) ([e92b62f](https://github.com/omarcocarvalho/artistica/commit/e92b62f56e96e5e8b863fcd33cdc5bbc15dcd6b6))
* **images:** add the ImportDropzone component ([#51](https://github.com/omarcocarvalho/artistica/issues/51)) ([0745534](https://github.com/omarcocarvalho/artistica/commit/07455345a0a59d0a690dc231d4bcd7980b855929))
* **images:** add the in-memory useImages store ([#46](https://github.com/omarcocarvalho/artistica/issues/46)) ([7ffc22f](https://github.com/omarcocarvalho/artistica/commit/7ffc22f2c621b54fd52cbc6632b4143c12fb1aea))
* **images:** add the pointer and keyboard CropEditor ([#48](https://github.com/omarcocarvalho/artistica/issues/48)) ([2cd3fa8](https://github.com/omarcocarvalho/artistica/commit/2cd3fa8af75aa1b098bb6a689488d96275ce2b62))
* **images:** add types, error taxonomy and copy ([#31](https://github.com/omarcocarvalho/artistica/issues/31)) ([78383c8](https://github.com/omarcocarvalho/artistica/commit/78383c81d073733cd9eae6d54b3444a31b3732f3))
* **images:** decode images with EXIF, downscale, flatten and lazy HEIC ([#42](https://github.com/omarcocarvalho/artistica/issues/42)) ([5e96c93](https://github.com/omarcocarvalho/artistica/commit/5e96c938e9c7bc2b0679a699e66559c2f5b3d413))
* **images:** export the public API and guard privacy ([#56](https://github.com/omarcocarvalho/artistica/issues/56)) ([179d5fe](https://github.com/omarcocarvalho/artistica/commit/179d5fefac02534fe948d0b0c6469bf539c9a2f3))
* **images:** fetch image URLs and read paste/drop sources ([#36](https://github.com/omarcocarvalho/artistica/issues/36)) ([891c9d0](https://github.com/omarcocarvalho/artistica/commit/891c9d058a60a564cb62566fc42f825dcb3d5c6a))
* **images:** sniff image formats and read EXIF orientation ([#30](https://github.com/omarcocarvalho/artistica/issues/30)) ([c44f6a3](https://github.com/omarcocarvalho/artistica/commit/c44f6a3a01afe31162ed6e9e62d722d87131c474))
* **landing:** add landing page with SEO metadata and share image ([#37](https://github.com/omarcocarvalho/artistica/issues/37)) ([9e461bc](https://github.com/omarcocarvalho/artistica/commit/9e461bc86bdf0120a971fb0ef7273ec5bf1ed670))
* **layout:** add layout contract types ([#28](https://github.com/omarcocarvalho/artistica/issues/28)) ([f54c5cd](https://github.com/omarcocarvalho/artistica/commit/f54c5cd91535570b7570fa687ebd4d956bc45f5b))
* **layout:** auto/fixed size ranges and per-page suggestion ([#39](https://github.com/omarcocarvalho/artistica/issues/39)) ([fca09c0](https://github.com/omarcocarvalho/artistica/commit/fca09c0e45c4ec4a6dc15cdaad006c390d760c0c))
* **layout:** computeLayout auto search with property and performance tests ([#54](https://github.com/omarcocarvalho/artistica/issues/54)) ([c91225d](https://github.com/omarcocarvalho/artistica/commit/c91225d1ada41bfe47530b3f351cceb1bd9a1824))
* **layout:** item builder, tolerances and block geometry ([#34](https://github.com/omarcocarvalho/artistica/issues/34)) ([84ce284](https://github.com/omarcocarvalho/artistica/commit/84ce2842b4bba50ce32a99572da8fb7db63b0fce))
* **layout:** layout worker and latest-call-wins layoutAsync ([#59](https://github.com/omarcocarvalho/artistica/issues/59)) ([e157328](https://github.com/omarcocarvalho/artistica/commit/e157328b8a24328f997db36f42a640f46342b562))
* **layout:** MaxRects multi-page packer with rotation ([#40](https://github.com/omarcocarvalho/artistica/issues/40)) ([e245ef2](https://github.com/omarcocarvalho/artistica/commit/e245ef27eabc85b9f8ebb56dae0bba601f428dc8))
* **model:** add units, paper, page-setup and image model ([#15](https://github.com/omarcocarvalho/artistica/issues/15)) ([21c400f](https://github.com/omarcocarvalho/artistica/commit/21c400f30c30b5dad01c64c7d046a1f26ea69d1d))
* **page-setup:** add page setup panel ([#32](https://github.com/omarcocarvalho/artistica/issues/32)) ([b21a485](https://github.com/omarcocarvalho/artistica/commit/b21a4851068e94387ea0aed10d7cd650fadf2317))
* **render:** canvas page preview with guides and tile selection ([#52](https://github.com/omarcocarvalho/artistica/issues/52)) ([6ab413c](https://github.com/omarcocarvalho/artistica/commit/6ab413cb79f3f4a98f5b3f345bd008d852bba37e))
* **render:** compose print-ready PDF pages with vector crop marks ([#50](https://github.com/omarcocarvalho/artistica/issues/50)) ([a8ab878](https://github.com/omarcocarvalho/artistica/commit/a8ab878902e97cd26fa9fe0017b802baa76b7b77))
* **render:** export dialog with progress, cancel and download ([#60](https://github.com/omarcocarvalho/artistica/issues/60)) ([a4e3c65](https://github.com/omarcocarvalho/artistica/commit/a4e3c652b28b767f28965b0007181e3dd1ce1604))
* **render:** export PDF in a worker with progress and cancel ([#55](https://github.com/omarcocarvalho/artistica/issues/55)) ([d2dbcef](https://github.com/omarcocarvalho/artistica/commit/d2dbcef718686f6fa6cbb134ca17e93ac5f630eb))
* **render:** page model with shortened crop marks ([#35](https://github.com/omarcocarvalho/artistica/issues/35)) ([90b325f](https://github.com/omarcocarvalho/artistica/commit/90b325ff86324e02b80490e111c7513102d9ea1a))
* **render:** tile pixel plan, bleed by edge extension and tile renderer ([#41](https://github.com/omarcocarvalho/artistica/issues/41)) ([935eae5](https://github.com/omarcocarvalho/artistica/commit/935eae59f443ef8e2d23ca9e2a4b85cc086d7905))
* **settings:** add persisted settings store ([#19](https://github.com/omarcocarvalho/artistica/issues/19)) ([deea979](https://github.com/omarcocarvalho/artistica/commit/deea979605d89ee3155e9a00def0a4bf55eec83d))
* **theme:** apply the theme from settings with useApplyTheme ([#25](https://github.com/omarcocarvalho/artistica/issues/25)) ([8f166f3](https://github.com/omarcocarvalho/artistica/commit/8f166f3e4e04f7b01502654c76f8a64e8b944e3c))
* **ui:** add button, badge, callout, progress and sketch card primitives ([#22](https://github.com/omarcocarvalho/artistica/issues/22)) ([409ad94](https://github.com/omarcocarvalho/artistica/commit/409ad947b7f8e36ea4c2229bfc46c7696689b5a0))
* **ui:** add dialog, bottom sheet, tabs and tooltip ([#23](https://github.com/omarcocarvalho/artistica/issues/23)) ([31f1acf](https://github.com/omarcocarvalho/artistica/commit/31f1acfa684a29de5425df920f362dff130479b7))
* **ui:** add switch, segmented control, slider, select and number field ([#21](https://github.com/omarcocarvalho/artistica/issues/21)) ([1c14716](https://github.com/omarcocarvalho/artistica/commit/1c147167a3ed4cb676674de01c0f0cca2c598dd6))
* **ui:** export all primitives from one barrel ([#26](https://github.com/omarcocarvalho/artistica/issues/26)) ([09f3729](https://github.com/omarcocarvalho/artistica/commit/09f37297d448341bacc0947fca02e2908c544801))


### Bug Fixes

* **a11y:** return focus to the opener and to a sensible target after removals ([#73](https://github.com/omarcocarvalho/artistica/issues/73)) ([cdba780](https://github.com/omarcocarvalho/artistica/commit/cdba780e90637816ccd7cff03daf2cc91f00b58c))
* **app:** link the logo to the landing page and keep layout errors visible ([#70](https://github.com/omarcocarvalho/artistica/issues/70)) ([9a9ddcb](https://github.com/omarcocarvalho/artistica/commit/9a9ddcbfdb79deb37b325515a5e88b4bf2f0bc8f))
* **images:** drop notices for imports cancelled by Remove all ([#71](https://github.com/omarcocarvalho/artistica/issues/71)) ([610d399](https://github.com/omarcocarvalho/artistica/commit/610d3994ba819fac48c29f354b390655852f3d50))
* **images:** keep compressed sources and preview bitmaps so phones don't run out of memory ([#75](https://github.com/omarcocarvalho/artistica/issues/75)) ([7b55390](https://github.com/omarcocarvalho/artistica/commit/7b55390d5df53e0bb0d4c6d9b65536103f623178))
* **images:** keep real file names for dropped files ([#68](https://github.com/omarcocarvalho/artistica/issues/68)) ([4603051](https://github.com/omarcocarvalho/artistica/commit/4603051349e00805f5b06ad50f83ff4a50ab1209))
* **layout:** order equal images by content hash so layouts are stable across sessions ([#66](https://github.com/omarcocarvalho/artistica/issues/66)) ([6e41585](https://github.com/omarcocarvalho/artistica/commit/6e41585821eff59f1ccac85d7c416e3a52566b67))
* **settings:** ignore undefined page-setup patches and pin crop-mark geometry in tests ([#72](https://github.com/omarcocarvalho/artistica/issues/72)) ([3a39a3e](https://github.com/omarcocarvalho/artistica/commit/3a39a3ecd3becc3c32cfea176c9487779e47df13))

## 0.0.1 (2026-10-03)


### Features

* scaffold landing and app placeholder pages ([#4](https://github.com/omarcocarvalho/artistica/issues/4)) ([24996d8](https://github.com/omarcocarvalho/artistica/commit/24996d86571271fb2fbae5d7ae552bd50bf9d7d5))

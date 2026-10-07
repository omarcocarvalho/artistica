# Changelog

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

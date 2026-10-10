# String context

Where each English string appears, what kind of control shows it, and how much room it has. Read it with [style-guide.md](style-guide.md) and [glossary.md](glossary.md).

This file describes the English of master `2380a82` (2026-10-11). Keys that the M6 groundwork adds, renames or removes before the string freeze (number and unit keys, one-key messages, paper names, the language menu) are not listed; for those, read the key's call site (`git grep -n "<key>" src`) and add a row here in the freeze pull request.

## How it was made

1. A script listed every key of `src/locales/en/*.json` and found its call sites with a search of `src/**/*.{ts,tsx}` for the key (or, for keys built at runtime such as `` t(`mobile.names.${step}`) ``, for the key's prefix).
2. Another script loaded the built app (`corepack pnpm build && corepack pnpm preview`) in Playwright at the two narrowest layouts, the phone at 320 × 640 and the desktop at 960 × 800 (the width where the three-panel workspace starts), added one photo, walked every step and tab, and measured each control: its width, the width its text may take, and the English text's width. Latin limits are that room divided by the average width of a character of the English text (about 7 px at the 14 px UI size); CJK limits divide it by the width of a CJK character (14 px).
3. The rows below were written by hand from both.

The English screen set at desktop and phone width comes from `e2e/screens.spec.ts` (CI artifact `screens`) once that spec exists; until then, run the app and look at the screen named in each row.

## Screens

| Screen | What it is |
|---|---|
| Top bar | the bar at the top: logo, app name, privacy pill (from 640 px), theme, Presets, Export PDF (desktop) |
| Empty | the empty workspace or the empty Images step: "Add some reference photos", the three add buttons |
| Images | the Images panel (desktop, 248–288 px wide) or the Images step (phone): the add buttons, the image list |
| Edit | the Edit image dialog (desktop) or bottom sheet (phone): crop, rotate, copies, print size |
| Page | the Page tab (desktop, 320–352 px wide) or the Page step (phone): paper, orientation, spacing, cutting |
| Studies | the Studies tab or step: versions, blur, values, hue |
| Lines | the Lines tab (desktop) or the Lines card under Studies (phone): composition lines, guides from the photo, line style |
| Preview | the page preview and its toolbar: Guides, Edit selected image, Arrange, Undo, Re-run auto layout |
| Presets | the Presets dialog (desktop) or bottom sheet (phone) |
| Export | the Export dialog (desktop) or the Export step (phone) |
| Notices | toasts and notices at the bottom of the screen, and status lines inside panels |
| Spoken | not visible: an accessible name, a description or a live announcement read by screen readers |

## Tight keys

Each row is a control whose text has a fixed room. Keep every language within the limit: the Latin column for pt-BR, es and it, the CJK column for ja, ko and zh-CN. A plural key's limit applies to every form.

| Keys | Control and screen | Latin max | CJK max | Room measured |
|---|---|---|---|---|
| `presets:button` | button with an icon, Top bar, every width | 10 | 5 | about 50 px at 320 px once the language menu joins the bar; the app name truncates first |
| `app:mobile.names.images` `app:mobile.names.page` `app:mobile.names.studies` `app:mobile.names.preview` `app:mobile.names.export` | five equal step tabs, phone | 8 | 4 | 56 px each at 320 px (64 px column, 4 px padding each side) |
| `app:settingsTabs.page` `app:settingsTabs.studies` `app:settingsTabs.lines` | three tabs, Page panel header, desktop | 10 | 5 | 216 px shared by the three at 960 px |
| `app:topBar.export` | primary button with an icon, Top bar, desktop | 14 | 7 | the bar has room; keep it a short verb phrase |
| `app:topBar.privacy` | pill with a lock icon, Top bar, from 640 px | 28 | 14 | 160 px of text in English at 960 px; it shares the bar with the language menu from 640 px |
| `app:theme.auto` `app:theme.light` `app:theme.dark` | text of the theme button, Top bar, from 640 px | 8 | 4 | 30 px in English |
| `app:mobile.back` `app:mobile.next` | large buttons, phone footer | 12 | 6 | 288 px shared, with a gap between |
| `images:dropzone.upload` `images:dropzone.paste` `images:dropzone.link` | three equal buttons with icons, Images panel | 6 | 3 | the 248 px panel gives each button 66 px; "Upload" is already clipped in English at 960 px and in the phone empty card |
| `images:dropzone.uploadHero` `images:dropzone.linkHero` | primary buttons, Empty | 14 | 7 | the empty card wraps them; keep each one line |
| `images:list.count` | count next to "Remove all images", Images panel | 10 | 5 | "1 image" already wraps onto two lines in English at 960 px |
| `images:list.sizeAuto` `images:list.sizeFixed` | second line of an image row, Images panel | 14 | 7 | the row's text column is about 80 px at 960 px; "Fixed {{value}}" includes the formatted size |
| `pageSetup:orientation.auto` `pageSetup:orientation.portrait` `pageSetup:orientation.landscape` | three segmented options, Page | 10 | 5 | 206 px shared by the three in a 288 px field |
| `pageSetup:paper.unitMm` `pageSetup:paper.unitIn` | two segmented options, Page | 8 | 4 | short words; the field wraps the options if they don't fit |
| `images:editSheet.size.auto` `images:editSheet.size.fixed` `images:editSheet.size.width` `images:editSheet.size.height` | segmented options, Edit | 10 | 5 | two options per control |
| `images:editSheet.aspect.free` `images:editSheet.aspect.original` | round crop-shape chips next to the ratio chips, Edit | 10 | 5 | the chips wrap; keep one word |
| `studies:version.original` `studies:version.blurred` `studies:version.values` `studies:version.blurValues` | toggle chips, Studies; also tile names in the preview | 20 | 10 | the chips wrap in a 244 px row |
| `preview:tile.scaledToFit` | 10 px warning badge in a corner of a tile, Preview | 14 | 7 | a small tile is about 100 px wide |
| `preview:arrange.chip.pickedUp` `preview:arrange.chip.swap` `preview:arrange.chip.invalid` | chip over a tile while dragging, Preview | 16 | 8 | drawn over the tile |
| `preview:arrange.toggle` `preview:arrange.undo` | buttons with icons, Preview toolbar | 12 | 6 | the toolbar wraps in a 392 px column at 960 px |
| `preview:guides.label` | switch label, Preview toolbar | 12 | 6 | as above |
| `preview:guides.legend.safe` `preview:guides.legend.bleed` `preview:guides.legend.cut` `preview:guides.legend.mark` | legend items above the page, Preview | 14 | 7 | the legend wraps |
| `lines:guides.onDevice` | badge with a shield icon next to the Guides heading, Lines | 14 | 7 | shares the heading row |
| `app:mobile.lines.on` | badge next to the Lines heading, phone | 10 | 5 | "{{count}} on"; the count is a number |
| `pageSetup:suggestion.tip` `studies:blur.accent` `export:done.yay` | hand-written accent next to a heading | 18 | 9 | decorative, set in the hand-written font; one line |
| `images:editSheet.crop.annotation` | hand-written note beside the crop area, Edit | 16 | 8 | one line |
| `export:summary.pages` `export:summary.tiles` `export:summary.cropMarks` `export:summary.bleed` `export:summary.quality` | term column of the export summary, Export | 10 | 5 | 71 px at 320 px; longer text wraps |
| `studies:values.min` `studies:values.darkest` `studies:values.lightest` | labels under the ends of a slider or ramp, Studies | 14 | 7 | half the slider width each |

## Variables

| Variable | What it holds |
|---|---|
| `{{count}}` | a whole number that also picks the plural form |
| `{{name}}` | an image's file name (`quadrants.jpg`) or a preset's name, as the user gave it; never translated, may be in any script |
| `{{from}}` `{{to}}` | a preset's old and new names |
| `{{list}}` | a list already joined for the language (names, or line types) |
| `{{current}}` `{{total}}` `{{page}}` `{{n}}` `{{pages}}` `{{tiles}}` `{{more}}` `{{max}}` `{{min}}` | numbers |
| `{{w}}` `{{h}}` `{{x}}` `{{y}}` | sizes and positions; pixels in `images:list.*`, `images:editSheet.subtitle` and `images:editSheet.crop.status`, millimetres or inches elsewhere |
| `{{mm}}` `{{pct}}` `{{deg}}` `{{mb}}` `{{loaded}}` `{{dpi}}` `{{value}}` `{{size}}` `{{gutter}}` `{{maxMb}}` `{{maxMp}}` | formatted numbers; check the English string at the freeze: a unit or sign written next to the variable in English (`{{mm}} mm`, `{{pct}}%`) stays next to it in the translation, and none is added where English has none |
| `{{unit}}` | the unit symbol of the chosen unit (`mm`, `in`) as the code formats it for the language |
| `{{paper}}` | a paper name (`A4`, or the translated Letter, Legal, Tabloid, Custom) |
| `{{orientation}}` | the translated word portrait or landscape, from the matching `orientation.*` key in the same namespace, in lower case mid-sentence |
| `{{version}}` | a study version name from `studies:version.*` |
| `{{item}}` | the spoken description of a tile (`app:preview.item` or `app:preview.itemVersion`) |
| `{{a}}` `{{b}}` | two whole sentences |
| `<name/>` | the selected image's name, shown in bold |

## app

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `app:title` | Top bar, Presets, Export | heading | "Artistica": never translated |
| `app:skipToPreview` | Top bar | skip link, visible on keyboard focus | |
| `app:topBar.home` | Spoken | name of the logo link to the landing page | |
| `app:topBar.privacy` | Top bar | pill | privacy claim (privacy-claims.md); tight |
| `app:topBar.export` | Top bar | primary button | tight |
| `app:topBar.export*` (the five reasons) | Top bar | tooltip on the disabled Export button, and its spoken description | why Export is unavailable; whole sentences |
| `app:theme.change` | Spoken | first part of the theme button's name ("Change theme: Auto") | |
| `app:theme.auto` `.light` `.dark` | Top bar | visible text of the theme button | tight |
| `app:panels.images` `.settings` `.preview` | desktop | panel headings; `images` has a count badge after it | |
| `app:settingsTabs.label` | Spoken | name of the tab list | |
| `app:settingsTabs.page` `.studies` `.lines` | Page | tabs; also hidden headings | tight |
| `app:empty.titleBefore` `app:empty.titleHighlight` | Empty | large heading in two parts: "Add some " + underlined "reference photos" | the second part is drawn with a wavy underline; translate the whole heading and split it so the highlight is the noun phrase (the space stays at the end of the first part where the language uses spaces; ja and zh-CN have none) |
| `app:empty.body` `.formats` `.privacy` | Empty | body text, a small formats line, and a privacy line | `privacy` is a privacy claim |
| `app:empty.panelHint` | Images (desktop) | hint in the empty Images panel | |
| `app:empty.noPages` | Preview | placeholder when there is no page | |
| `app:notices.dismiss` | Notices | close button on a notice | |
| `app:notices.region` | Spoken | name of the notice region | |
| `app:notices.layoutFailed` | Notices | error toast | |
| `app:mobile.steps` | Spoken | name of the step navigation | |
| `app:mobile.names.*` | phone | step tabs and the step heading | tight |
| `app:mobile.stepLabel` | Spoken | name of the step region: "Step 2 of 5: Page" | |
| `app:mobile.back` `.next` `.done` | phone | footer buttons; `done` closes a bottom sheet | |
| `app:mobile.images.tapToEdit` | Images (phone) | hint | |
| `app:mobile.studies.picker` | Studies (phone) | label of the image picker | |
| `app:mobile.lines.title` `.on` | Lines (phone) | card heading and its badge | `on` is tight |
| `app:import.more` | Notices | "+3 more" after a list of failed file names | |
| `app:import.unnamed` | Notices | stands for an image with no name, as a sentence subject | |
| `app:preview.editSelected` | Preview | button | |
| `app:preview.updating` `.updated` | Spoken | live announcements | |
| `app:preview.pageCaption` | Preview | caption under each page: "Page 1 of 3 · A4 · portrait" | keep the ` · ` separators |
| `app:preview.pageItems` | Spoken | name of a page's list of tiles | |
| `app:preview.item` `.itemVersion` `.itemLines` | Spoken | description of each tile | |
| `app:preview.customPaper` `.unnamedImage` | Preview, Spoken | fallbacks inside other strings | |
| `app:preview.orientation.*` | Preview | lower-case word inside `pageCaption` | |

## common

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `common:theme.*` | Top bar | theme names | the same words as `app:theme.*` |
| `common:units.*` | Page, Edit, Preview | unit symbols | M6 replaces them with the code's own symbols; translate only if still present at the freeze |
| `common:app.comingSoon` `common:actions.*` | none | not used by any call site on `2380a82` | translate like any other key; the locale check needs every key |

## errors

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `errors:images.*.title` | Notices | title of an import error notice | `{{name}}` is the file name |
| `errors:images.*.message` | Notices | body of the same notice; follows the title on screen and in speech | a full sentence; name the formats exactly as English does |
| `errors:images.cors.message` | Notices | | "upload it instead" means "add it from your files": glossary, "add photos (from files)" |
| `errors:export.*` | Export | error text in the Export panel | |
| `errors:generic.unexpected` | none | not used by any call site on `2380a82` | |

## export

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `export:title` `export:close` | Export | dialog title and close button | |
| `export:summary.pages` `.tiles` `.cropMarks` `.bleed` `.quality` | Export | terms of the summary list | tight |
| `export:summary.pagesValue` `.tilesValue` `.length` `.on` `.off` `.qualityValue` | Export | values of the summary list | `qualityValue`: "300 DPI, never upscaled" (glossary: upscaled) |
| `export:summary.orientation.*` | Export | lower-case word inside `pagesValue` | |
| `export:fileName` | Export | label above the file name | the file name itself stays ASCII (owner Q5) |
| `export:create` `.retry` `.cancel` | Export | buttons | `create` is the glossary's "create PDF" |
| `export:progress.label` | Export | progress text "Page 2 of 5…" | |
| `export:progress.aria` `.page` `.state.*` | Spoken | names of the progress bar and of each page's dot, with its state | |
| `export:progress.hint` | Export | hint under the progress | |
| `export:done.title` `.yay` | Export | heading and its hand-written accent | `yay` is tight |
| `export:done.download` `.again` | Export | buttons | |
| `export:done.printTitle` `.printBody` | Export | callout | quote the print-dialog options with the glossary's "actual size" and "fit to page" |

## images

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `images:dropzone.groupLabel` | Spoken | name of the add buttons' group | |
| `images:dropzone.title` `.hint` `.formats` `.privacy` | Empty | the empty card's heading, body, formats and privacy line | `privacy` is a privacy claim |
| `images:dropzone.dropMini` `.dropActive` | Images | the small drop area and its text while dragging | |
| `images:dropzone.upload` `.paste` `.link` | Images | compact buttons | tight; "Upload" opens the file picker (glossary) |
| `images:dropzone.uploadHero` `.linkHero` | Empty | large buttons | tight |
| `images:dropzone.importing` `.importingLabel` `.cancel` `.cancelLabel` `.stopped` `.dismiss` | Images | status while photos are added, its Cancel button (and spoken name) and the message after cancelling | |
| `images:dropzone.noImage.*` `.noImageDrop.*` `.pasteHint.*` | Notices | notice title and body | `pasteHint.message` names `Ctrl+V` and `⌘V`: keep both |
| `images:dropzone.url.*` | Images | the link form: title, field label, placeholder, buttons | `placeholder` is never translated |
| `images:dropzone.gifNote` | Images | note | |
| `images:list.ariaLabel` | Spoken | name of the image list | |
| `images:list.empty.*` | Images | empty list text | |
| `images:list.select` `.edit` `.remove` | Spoken | names of each row's buttons, with the image name | |
| `images:list.pixels` `.pixelsLabel` | Images, Spoken | "64 × 48" and its spoken form "64 by 48 pixels" | `pixels` is glyphs only |
| `images:list.sizeAuto` `.sizeFixed` | Images | second line of a row | tight |
| `images:list.copies` `.copiesLabel` | Images, Spoken | badge "×2" and its spoken form | `copies` keeps the `×` |
| `images:list.dpi` `.lowDpiLabel` | Images, Spoken | warning badge "20 DPI" and its spoken form | |
| `images:list.separator` | Images | the `·` between parts of a row | glyph |
| `images:list.count` | Images | "3 images" | tight |
| `images:list.removeAll.*` | Images | button and confirmation dialog | `confirmBody` is a privacy claim ("Photos are not saved anywhere") |
| `images:editSheet.title` `.subtitle` | Edit | dialog title and "name · 64 × 48 px" | |
| `images:editSheet.crop.stageLabel` `.areaLabel` `.controls` | Spoken | names of the crop stage, the movable crop area and the button group | |
| `images:editSheet.crop.help` | Edit | hint under the crop | names `Shift` and the arrow keys |
| `images:editSheet.crop.status` | Edit, Spoken | readout "Crop 40 × 30 px at 12, 8" | |
| `images:editSheet.crop.annotation` | Edit | hand-written note | tight |
| `images:editSheet.crop.position` `.size` | Edit | group labels of the step buttons | |
| `images:editSheet.crop.step.*` | Edit, Spoken | names of the arrow buttons that move or resize the crop | |
| `images:editSheet.crop.shape` `.reset` | Edit | group label and button | |
| `images:editSheet.aspect.free` `.original` | Edit | chips | tight |
| `images:editSheet.aspect.ratio*` | Edit | chips | glyphs: copy unchanged |
| `images:editSheet.transform.*` | Edit | button group and the four rotate and flip buttons | keep `90°` |
| `images:editSheet.copies.label` `.hint` `.less` `.more` | Edit | the copies counter, its hint and the spoken names of − and + | |
| `images:editSheet.copies.lessGlyph` `.moreGlyph` | Edit | the − and + on the buttons | glyphs |
| `images:editSheet.size.label` `.auto` `.fixed` `.axisLabel` `.width` `.height` `.valueLabel` | Edit | print size controls | segmented options are tight |
| `images:editSheet.size.autoHint` `.followsHeight` `.followsWidth` | Edit | hints | |
| `images:editSheet.dpi.label` `.value` `.autoOk` | Edit | print resolution meter and its text | |
| `images:editSheet.dpi.scale0` `.scale300` `.scale400` | Edit | numbers under the meter | glyphs |
| `images:editSheet.dpi.lowTitle` `.lowFixed` `.lowAuto` | Edit | warning callout | |
| `images:editSheet.actions.*` | Edit | dialog buttons | |

## pageSetup

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `pageSetup:title` | Page | heading | |
| `pageSetup:paper.heading` `.size` | Page | section heading and select label | |
| `pageSetup:paper.custom` | Page | the last option of the paper select | keeps its `…` |
| `pageSetup:paper.dims` `.times` `.width` `.height` | Page | the size line under the select and the custom size fields | `times` is a glyph |
| `pageSetup:paper.units` `.unitMm` `.unitIn` | Page | units control | options are tight |
| `pageSetup:units.*` | Page | field suffixes | M6 replaces them; translate only if still present at the freeze |
| `pageSetup:noRoom` | Preview | message in place of the preview | |
| `pageSetup:orientation.label` `.auto` `.portrait` `.landscape` | Page | orientation control | options are tight; capitalised, as options |
| `pageSetup:orientation.autoPicked` `.resolved.*` | Page | hint "Auto picked portrait: fewer pages." with the lower-case word | |
| `pageSetup:spacing.*` | Page | spacing section: heading, field labels, switch label, hints | `safeArea`, `gutter` per the glossary |
| `pageSetup:cutting.*` | Page | cutting section: heading, switch labels, field label, hint | `cropMarks`, `bleed` per the glossary |
| `pageSetup:notes.*` | Notices | notes after the app changed a value for you | |
| `pageSetup:suggestion.tip` `.text` | Page | hand-written accent and the suggestion beside it | `tip` is tight |
| `pageSetup:remembered` | Page | footnote | a privacy claim ("on this device") |

## presets

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `presets:button` | Top bar | button | tight |
| `presets:title` `.close` `.empty` `.listLabel` | Presets | dialog title, close, empty text, spoken name of the list | |
| `presets:storageFailed` | Presets | warning | a privacy-related statement: the change is not kept on this device |
| `presets:save.open` `.name` `.submit` `.cancel` | Presets | the save form | `open` keeps its `…` |
| `presets:save.needName` `.tooLong` `.exists` `.replace` `.full` | Presets | field errors and the Replace it button | |
| `presets:save.saved` `.replaced` | Spoken, Notices | announcements | |
| `presets:row.apply` `.rename` `.delete` | Presets | buttons on each row | |
| `presets:row.applyLabel` `.renameLabel` `.deleteLabel` | Spoken | the same buttons' names, with the preset name | start with the visible word (WCAG 2.5.3) |
| `presets:rename.*` | Presets | rename form and its announcement | |
| `presets:apply.*` `presets:delete.*` | Presets | confirmation dialogs, their buttons and announcements | `confirmTitle` quotes the name |
| `presets:export.button` `presets:import.button` `.file` | Presets | buttons and the spoken name of the file input | `import.button` keeps its `…` |
| `presets:import.imported` `.renamed` `.skipped` `.full` `.adjusted` | Notices | the import report, one sentence each | |
| `presets:import.renamedPair` `.listSeparator` | Notices | "old → new" and the separator between pairs | `listSeparator` is `, ` in English: use the language's list comma (ja and zh-CN `、`) |
| `presets:import.error.*` | Notices | import errors | |
| `presets:summary.separator` `.plus` | Presets | ` · ` and ` + ` joining the parts of a preset's one-line summary | glyphs with spaces; keep the spaces |
| `presets:summary.custom` `.orientation.*` `.bleed` `.version.*` `.line.*` | Presets | parts of the one-line summary under each preset name | short and lower case where English is |

## preview

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `preview:tile.fallbackName` `.versionName` | Spoken | tile names | |
| `preview:tile.lowDpi` `.lowDpiLabel` | Preview, Spoken | 10 px warning badge and its spoken form | |
| `preview:tile.scaledToFit` `.scaledToFitLabel` | Preview, Spoken | 10 px warning badge and its spoken form | badge tight |
| `preview:guides.label` | Preview | switch | tight |
| `preview:guides.legend.*` | Preview | legend above the page | tight; glossary print terms |
| `preview:arrange.dropped.*` | Notices | info notice after the arrangement was dropped | |
| `preview:arrange.toggle` `.undo` `.rerun` | Preview | toolbar buttons | `toggle`, `undo` tight |
| `preview:arrange.barLabel` `.photoOptions` `.sheetSummary` | Preview | toolbar name, phone button, summary line in the phone sheet | |
| `preview:arrange.rerunConfirm` `.rerunAction` `.cancel` `.close` | Preview | confirmation popover | |
| `preview:arrange.selectedGroup` `.moveToPage` `.pageOption` `.newPage` `.swapWith` `.swapChoose` `.swapOption` `.width` `.position` `.move*` | Preview | controls for the selected photo | `swapWith` keeps its `…` |
| `preview:arrange.roleDescription` `.blockName` `.instructions` | Spoken | what a movable photo is, its name, and the keyboard instructions | `instructions` names `Shift`, `Page Up`, `Page Down`, `Enter` |
| `preview:arrange.fixedHint` | Preview | hint | |
| `preview:arrange.chip.*` | Preview | chip over a dragged tile | tight |
| `preview:arrange.placed` `.pickedUp` `.pickUpCancelled` `.undone` `.rerunDone` `.refused.*` | Spoken | live announcements after each move | `pickedUp` names `Enter` and `Escape` (key names) |

## studies

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `studies:version.*` | Studies, Preview | chips and tile names | tight; glossary |
| `studies:panel.forImage` | Studies | heading with `<name/>` | |
| `studies:panel.noImage` `.importing` | Studies | empty and waiting text | |
| `studies:versions.*` | Studies | legend of the chips, hint, and the note that one version must stay | |
| `studies:blur.heading` `.accent` | Studies | heading and hand-written accent | `accent` tight |
| `studies:blur.amount` `.valueText` `.min` `.max` | Studies | slider label, value and end labels | |
| `studies:blur.hint` `.usedBy` | Studies | hints | |
| `studies:values.heading` `.count` `.countText` `.min` `.max` | Studies | values slider | `min` is "2 · notan": keep the digit and `·` |
| `studies:values.hue` `.customHue` `.hueText` | Studies | hue swatches and the custom hue | |
| `studies:values.ramp` `.rampLabel` `.darkest` `.lightest` | Studies, Spoken | the value ramp, its spoken name and end labels | |
| `studies:values.hint` `.usedBy` | Studies | hints | |
| `studies:swatch.*` | Studies, Spoken | names of the hue swatches | pigment names, glossary |
| `studies:applyAll.*` | Studies | button, hint and announcement | |

## lines

| Keys | Screen | Control | Notes |
|---|---|---|---|
| `lines:type.*` | Lines, Spoken | switch labels; also listed in a tile's spoken description | glossary |
| `lines:corner.*` | Spoken | names of the four spiral corner options | |
| `lines:spiral.startsAt` | Lines | label | |
| `lines:spiral.arrow.*` | Lines | arrows on the corner options | glyphs |
| `lines:panel.forImage` | Lines | heading with `<name/>` | |
| `lines:panel.everyVersion` `.noImage` `.composition` `.style` `.waiting` | Lines | hint, empty text, section headings, waiting text | |
| `lines:grid.columns` `.rows` `.times` `.range` | Lines | grid counters | `times` is a glyph; `range` is spoken "2 to 12" |
| `lines:guides.heading` `.onDevice` | Lines | section heading and badge | `onDevice` tight; privacy-related |
| `lines:guides.detail.*` | Lines | Detail slider | |
| `lines:guides.size` `.download` `.progress` `.progressSpoken` | Lines | the download box: size, button, progress and its spoken form | |
| `lines:guides.failedHint` `.errorHint` `.tryAgain` `.noWebGL` | Lines | alerts | |
| `lines:guides.edges.*` | Lines, Spoken | status of the edge outline | |
| `lines:guides.face.why` `lines:guides.pose.why` | Lines | why the download is needed | privacy claims |
| `lines:guides.face.*` `lines:guides.pose.*` (the rest) | Lines, Spoken | progress, results, errors and the Turn off button | |
| `lines:colour.*` `lines:thickness.*` `lines:opacity.*` | Lines | line style fields | `hexHint` keeps `#1f3fbf` |
| `lines:applyAll.*` | Lines | button, hint and announcement | |

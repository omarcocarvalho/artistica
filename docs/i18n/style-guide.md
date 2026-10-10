# Translation style guide

How every translation of Artistica sounds and is written. Read it with [glossary.md](glossary.md) (which word to use) and [context.md](context.md) (where a string appears and how much room it has). When this guide and the glossary disagree, the glossary wins for the choice of a term and this guide wins for everything else; report the disagreement so one of them is fixed.

## Common rules

These apply to every language.

### Voice

- **Say what the English says, at the same strength.** Don't add reassurance, don't drop a warning, don't turn "may" into "will" or "never" into "rarely". The privacy sentences are held to this word by word ([privacy-claims.md](privacy-claims.md)).
- **Plain and short, like the English.** The English UI talks to one person, in short sentences, without jargon beyond the art and print terms in the glossary. Keep that: a friendly, direct register (the per-language sections below fix it), no marketing tone, no exclamation marks except in the three hand-written accents (`pageSetup:suggestion.tip`, `studies:blur.accent`, `export:done.yay`).
- **One register for the whole language**, in the app and on the landing page alike (owner Q2).
- **The same English word is the same translated word everywhere**, unless the glossary lists two senses. "Values" in the Studies tab, the preset summary and the landing page is one word.

### Capitals

- **Sentence case**, as in English: only the first word and proper names start with a capital, in buttons, headings, tabs and labels alike ("Crop marks" → "Marcas de corte", not "Marcas de Corte").
- After a colon, carry on in lower case unless a proper name follows (English does the same: "Auto picked portrait: fewer pages.").
- Japanese, Korean and Chinese have no case; Latin words inside them keep the glossary's spelling (`PDF`, `WebP`, `iPhone`).

### What is never translated

- **Product names, file formats and brands** stay as written: `Artistica`, `PDF`, `JPG`, `PNG`, `WebP`, `GIF`, `HEIC`, `MediaPipe`, `MIT`, `GitHub`, `Google`, `iPhone`, `Mac`, `Chrome`, `Edge`, `Firefox`, `Safari`, `WebGL`. The full list is in the glossary under "Do not translate".
- **ISO paper sizes** (`A3`, `A4`, `A5`, `A6`) stay as written. `Letter`, `Legal`, `Tabloid` and `Custom` are translated (owner Q5; the glossary gives each).
- **Keyboard key names** stay as printed on the keys, inside translated sentences (owner Q16): `Shift`, `Ctrl`, `⌘`, `Page Up`, `Page Down`, `Enter`, `Esc`, and the arrow keys, which are described in words ("arrow keys" → the glossary's term). `Ctrl+V` and `⌘V` keep their form.
- **Glyph strings** are copied unchanged: `×`, `·`, `→`, `−`, `+`, `↖ ↗ ↙ ↘`, the aspect ratios (`1:1`, `4:3`, …), the slider scale numbers (`0`, `300`, `400`) and the URL placeholder `https://example.com/photo.jpg`. [context.md](context.md) lists each such key; the locale check lets them equal English.

### Variables, tags and plurals

- **`{{variables}}` are copied exactly**, including any format suffix (`{{count, number}}`), never translated, never removed, never added. Move them to wherever the sentence needs them: `"{{name}} is too large"` → `"{{name}}が大きすぎます"`. Each variable's meaning is in [context.md](context.md).
- **Tags are copied exactly.** `<name/>` (in `lines:panel.forImage` and `studies:panel.forImage`) is replaced by the image name in bold; put it where the grammar needs it ("Linhas de <name/>", "<name/>の線"). A pair like `<0>…</0>` keeps the same words inside it as the English does: don't move text across a tag boundary.
- **Never write a number into a string.** Numbers arrive formatted for the language through a variable (overview M6-R7): `{{count}}`, `{{pct}}`, `{{mm}}` and the like already carry the language's separators, unit symbol and spacing. Don't add `%`, `mm`, `°` or `MB` next to a variable that already contains them; [context.md](context.md) says which variables do. The few digits the English writes as text (`300 DPI`, `90°`, `2 × bleed`, the `1%`/`100%` slider ends) are kept as digits, with the percent sign spaced as the language formats percentages (Spanish `1 %`, the others `1%`).
- **Plurals.** A key that ends in `_one`, `_other` (and so on) is one message in several forms; the code picks the form from `count` (overview M6-R9). Write exactly the forms your language needs: `_one`, `_many`, `_other` in pt-BR, es and it (`_many` is used for counts like 1,000,000: "1.000.000 de imagens", "1.000.000 de imágenes", "1.000.000 di immagini"); only `_other` in ja, ko and zh-CN. Add a `_zero` form wherever "0" reads wrong with the `_one` or `_other` form (Portuguese puts 0 in `one`, so "0 imagem" needs `_zero`: "Nenhuma imagem"). A key that exists only as `_other` in English (`images:list.removeAll.confirmBody_other`) still needs every form your language uses.
- **Counters in Japanese, Korean and Chinese** come after the number, from the glossary's counter column (`{{count}}枚`, `{{count}}장`, `{{count}}张`).

### Punctuation

- Each language uses its own quotation marks, set out below. A name the user typed (an image or preset name) inside a sentence takes them: English `Apply “{{name}}”?`.
- A trailing ellipsis (`…`, one character) means "more follows" (a menu item that opens a dialog, a running task). Keep it, as one `…` character, in every language.
- A colon or full stop at the end of a label follows the English: labels and buttons have none; sentences end with the language's full stop.

### Length

- **A tight key** (the "Tight keys" table in [context.md](context.md)) stays within its stated limit: the Latin limit for pt-BR, es and it, the CJK limit for ja, ko and zh-CN (a CJK character is about twice as wide as a Latin letter). If the natural translation is longer, find a shorter word that keeps the meaning; never abbreviate with a full stop, never drop a word that carries meaning. If no translation fits, report the key: the layout gets fixed, the text doesn't get cut.
- **Every other string** aims at no more than the English length plus 30% in pt-BR, es and it, and needs no CJK limit beyond reading naturally.
- An accessible name (an `aria-label`, a live announcement, a visually hidden description) has no length limit, but must contain the visible text of its control word for word when it has one (WCAG 2.5.3): `presets:row.applyLabel` "Apply {{name}}" must start with the same word as `presets:row.apply`.

## pt-BR (Portuguese, Brazil)

- **Register:** *você*, friendly and direct. Never *tu*, never *o senhor*.
- **Buttons and menu items:** infinitive, as Brazilian software does ("Cancelar", "Salvar", "Baixar PDF", "Adicionar link").
- **Instructions, hints and messages:** imperative in the third person, which goes with *você* ("Adicione fotos para começar.", "Toque em uma foto para cortar…", "Tente de novo.").
- **Vocabulary:** Brazilian, not European Portuguese: *arquivo*, *tela*, *baixar*, *celular* only in casual text and *telefone* in UI text, *excluir* or *remover* (glossary), *colar*, *link*. Avoid *ecrã*, *ficheiro*, *transferir*.
- **Quotation marks:** “curly double” (“Tamanho real”), ‘single’ inside them.
- **Numbers:** formatted by the code (`1.234,5`; inches are `pol.`); don't touch.
- **Gender:** agree with the noun the string is about (*foto* and *imagem* are feminine: "Desfocada", "Nenhuma imagem"); where the noun is not known (a name variable), build the sentence so the name is not the grammatical subject of an adjective.

## es (Spanish, neutral Latin American)

- **Register:** *tú*, friendly and direct. No *vos* and no *usted*.
- **Vocabulary:** neutral Latin American, understood from Mexico to Argentina, with nothing Spain-only and no regional slang: *computadora* (never *ordenador*), *teléfono* or *celular* (never *móvil*), *archivo*, *agregar* (not *añadir*), *descargar*, *pegar*, *enlace*, *guardar*. Avoid *coger*, *vale*, *fichero*.
- **Buttons and menu items:** infinitive, as Spanish-language software does ("Cancelar", "Guardar", "Descargar PDF", "Agregar enlace").
- **Instructions, hints and messages:** imperative with *tú* ("Agrega fotos para empezar.", "Toca una foto…", "Inténtalo de nuevo.").
- **Punctuation:** opening `¿` and `¡` always ("¿Quitar todas las imágenes?"); “curly double” quotation marks; no space before `?`, `!`, `:`.
- **Numbers:** formatted by the code (`1234,5`, `50 %`); write the textual percent ends as `1 %` and `100 %`.

## it (Italian)

- **Register:** *tu*, friendly and direct. Never *Lei*.
- **Buttons and menu items:** imperative, second person singular, as Italian software does ("Annulla", "Salva", "Aggiungi foto", "Scarica PDF").
- **Instructions, hints and messages:** the same *tu* imperative ("Aggiungi una foto per iniziare.", "Riprova.").
- **Quotation marks:** «caporali» («Dimensioni effettive»), “curly double” inside them.
- **Vocabulary:** standard Italian software terms; English loanwords only where the glossary keeps them (`preset`, `link`). Elide articles before vowels (*l'immagine*, *un'immagine*).
- **Numbers:** formatted by the code (`1234,5`); don't touch.

## ja (Japanese)

- **Register:** です・ます in sentences (messages, hints, errors, announcements): 「写真はこのデバイスから送信されません。」 Never だ・である, never keigo beyond です・ます.
- **Buttons, tabs, labels and headings:** short noun or verb-stem forms, no です・ます: 「写真を追加」「PDFを作成」「キャンセル」「閉じる」「用紙サイズ」.
- **Progress and running tasks:** 〜中… for short labels (「顔を検出中…」); a full sentence when the English is one.
- **Punctuation:** full-width 、。「」！？（）. Quote a UI name or a user-typed name with 「」 (「実際のサイズ」, 「{{name}}」を適用しますか？). No full stop on buttons, labels or headings.
- **Spacing:** no space between Japanese and Latin letters or numbers: 「PDFを作成」「Shiftと矢印キー」「{{count}}枚」. A space only where the English has one between two Latin words (`Page Up`).
- **Loanwords:** katakana as the glossary gives them, with the final long-vowel mark, as current Microsoft and Apple Japanese write them (「プレビュー」「ユーザー」). Native words where the glossary prefers them (余白, 塗り足し, トンボ).
- **Counters:** from the glossary (写真・画像は「枚」, ページは「ページ」, プリセットは「件」).

## ko (Korean)

- **Register:** 해요체 in messages, hints, errors and announcements: "사진은 이 기기에만 있어요.", requests as 〜하세요 / 〜해 주세요. Never 합니다체 or 반말.
- **Buttons, tabs, labels and headings:** short noun forms: "사진 추가""PDF 만들기""취소""닫기""용지 크기".
- **Progress and running tasks:** 〜 중… ("얼굴 찾는 중…").
- **Spacing:** spaces between words as in normal Korean (띄어쓰기); a number and its counter or unit are written together ("3장", "12mm", the latter from the code).
- **Punctuation:** half-width `. , ? ! :`; “curly double” for quotations, ‘single’ for a UI name or a user-typed name (‘{{name}}’을 적용할까요?).
- **Particles after a variable:** a particle whose form depends on the last syllable (을/를, 이/가, 은/는, 와/과, 으로/로) can't follow a variable whose value is unknown. Rewrite so no such particle follows the variable ("{{name}} 삭제", "{{name}}: …") or put the variable inside quotation marks followed by a form that doesn't change ("‘{{name}}’ 프리셋을 삭제할까요?").
- **Loanwords:** as the glossary gives them; prefer Korean words where the glossary does (재단 표시, 도련, 여백).

## zh-CN (Chinese, Simplified)

- **Register:** 你, plain and neutral. Never 您.
- **Buttons, tabs, labels and headings:** short verb-object or noun forms: "添加照片""创建PDF""取消""关闭""纸张大小".
- **Messages and hints:** short full sentences ending in 。; requests without 请 unless the English says "please".
- **Progress and running tasks:** 正在 and the verb, with one `…` (see the common rule): "正在查找人脸…".
- **Punctuation:** full-width ，。：；！？（）and “curly double” quotation marks (“实际大小”，“{{name}}”). No full stop on buttons, labels or headings.
- **Spacing:** no space between Chinese and Latin letters or numbers, product names included: "创建PDF""{{count}}张照片""使用MediaPipe模型".
- **Counters:** from the glossary (照片・图片"张", 页面"页", 预设"个").
- **Vocabulary:** Mainland Simplified Chinese software terms (文件, 下载, 粘贴, 链接, 设置); no Traditional characters, no Taiwan or Hong Kong terms (檔案, 下載, 貼上, 連結).

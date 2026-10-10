# Glossary

One translation per term, used in every namespace of the app and on the landing page. The `en` column is the term as the English UI uses it; a cell may give a short form after a slash when [context.md](context.md) marks the key as tight. Sources: the print terms follow the vocabulary of print shops and of the localized Adobe InDesign and Acrobat print dialogs in each language; the art terms follow art-education usage (drawing and painting courses, pigment names on paint tubes); the software terms follow the localized operating systems (Windows, macOS, iOS, Android) in each language. A term that changes here changes in every locale file in the same pull request.

## Paper and print

| en | pt-BR | es | it | ja | ko | zh-CN | Definition and source |
|---|---|---|---|---|---|---|---|
| sheet | folha | hoja | foglio | シート | 시트 | 参考页 | A printed page of reference photos ("reference sheets"). |
| page | página | página | pagina | ページ | 페이지 | 页 / 页面 | One page of the PDF. "Page 2 of 3": ja 3ページ中2ページ, ko 3페이지 중 2페이지, zh 第2页，共3页. |
| paper | papel | papel | carta | 用紙 | 용지 | 纸张 | The physical paper. |
| paper size | tamanho do papel | tamaño del papel | formato carta | 用紙サイズ | 용지 크기 | 纸张大小 | OS print dialogs in each language. |
| Letter | Carta | Carta | Lettera | レター | 레터 | 信纸 | US Letter (owner Q5). OS print dialogs (Windows, macOS). |
| Legal | Ofício | Oficio | Legale | リーガル | 리갈 | 法定用纸 | US Legal (owner Q5). Brazilian and Latin American dialogs name it Ofício/Oficio. |
| Tabloid | Tabloide | Tabloide | Tabloid | タブロイド | 타블로이드 | 小报 | US Tabloid, 11 × 17 in (owner Q5). |
| Custom (paper) | Personalizado | Personalizado | Personalizzato | カスタム | 사용자 지정 | 自定义 | A paper size typed by the user. |
| orientation | orientação | orientación | orientamento | 向き | 방향 | 方向 | |
| portrait | retrato | vertical | verticale | 縦 | 세로 | 纵向 | Page orientation, as OS print dialogs say it. |
| landscape | paisagem | horizontal | orizzontale | 横 | 가로 | 横向 | As above. |
| auto | automático | automático | automatico | 自動 | 자동 | 自动 | Orientation, size or theme chosen by the app. |
| units | unidades | unidades | unità | 単位 | 단위 | 单位 | |
| inches | polegadas | pulgadas | pollici | インチ | 인치 | 英寸 | The long unit name in the units control; the short symbol comes from the code. |
| safe area | margem de segurança | margen de seguridad | margine di sicurezza | 余白 | 안전 여백 | 安全边距 | The blank border at the page edge that the printer can't reach. Japanese print usage calls a page's blank border 余白; 安全マージン reads as jargon. |
| gutter | espaço entre imagens | espacio entre imágenes | spazio tra le immagini | 画像の間隔 | 이미지 간격 | 图片间距 | The room left between images for cutting. Not the bookbinding gutter, so the print word (calha, medianil, 綴じ代) is wrong here. |
| bleed | sangria | sangrado | abbondanza | 塗り足し | 도련 | 出血 | Image extended past the cut line. Print-shop usage: sangria (BR), sangrado (InDesign es), abbondanza (Italian print shops), 塗り足し (Japanese print shops; InDesign says 裁ち落とし), 도련 (InDesign ko), 出血 (InDesign zh). |
| crop marks | marcas de corte | marcas de corte | segni di taglio | トンボ | 재단 표시 | 裁切标记 | Marks at the corners showing where to cut. InDesign and Acrobat dialogs: Marcas de corte, Segni di taglio, トンボ, 재단 표시, 裁切标记. The plan's 재단선 is the cut line, not the marks. |
| crop mark (one, in the legend) | marca de corte | marca de corte | segno di taglio | トンボ | 재단 표시 | 裁切标记 | Singular of the above. |
| cut line, trim | linha de corte | línea de corte | linea di taglio | 仕上がり線 | 재단선 | 裁切线 | Where the paper is cut. 仕上がり線 is the Japanese print term for the trim line. |
| DPI | DPI | DPI | DPI | DPI | DPI | DPI | Dots per inch; never translated (also in "Low resolution: 20 DPI"). |
| print size | tamanho de impressão | tamaño de impresión | dimensione di stampa | 印刷サイズ | 인쇄 크기 | 打印尺寸 | |
| print resolution | resolução de impressão | resolución de impresión | risoluzione di stampa | 印刷解像度 | 인쇄 해상도 | 打印分辨率 | |
| low resolution | baixa resolução | baja resolución | bassa risoluzione | 低解像度 | 저해상도 | 低分辨率 | Below 300 DPI; it may print soft. |
| scaled to fit | reduzida para caber | reducida para caber | ridotta per stare | 縮小して配置 | 맞춤 축소 | 已缩小以适应 | Badge on a tile that was shrunk to fit the page. Tight (context.md). |
| upscaled | ampliada | ampliada | ingrandita | 拡大 | 확대 | 放大 | "never upscaled": the image is never printed larger than its pixels allow at 300 DPI. |
| tile | quadro | recuadro | riquadro | 枠 | 칸 | 图块 | One printed picture on a page (an image, one of its versions, one copy). |
| quality | qualidade | calidad | qualità | 品質 | 품질 | 质量 | Export summary. |
| actual size (print setting) | Tamanho real | Tamaño real | Dimensioni effettive | 実際のサイズ | 실제 크기 | 实际大小 | The print-dialog option, quoted from the OS dialogs. |
| fit to page (print setting) | Ajustar à página | Ajustar a la página | Adatta alla pagina | ページに合わせる | 페이지에 맞추기 | 适合页面 | As above. |

## Photos and editing

| en | pt-BR | es | it | ja | ko | zh-CN | Definition and source |
|---|---|---|---|---|---|---|---|
| reference photo | foto de referência | foto de referencia | foto di riferimento | 資料写真 | 참고 사진 | 参考照片 | A photo the artist draws or paints from. 資料写真 is the Japanese illustrators' word. |
| photo | foto | foto | foto | 写真 | 사진 | 照片 | Used where the English says "photo". |
| image | imagem | imagen | immagine | 画像 | 이미지 | 图片 | Used where the English says "image". Keep the photo/image distinction the English makes. |
| add photos (from files) | adicionar fotos | agregar fotos | aggiungi foto | 写真を追加 | 사진 추가 | 添加照片 | The local file picker. The English button says "Upload", but nothing is sent anywhere: translate it as choosing or adding files from the device, never with the word used for "uploaded" in the privacy claims (Enviar, Subir, Carica, アップロード, 업로드, 上传). See privacy-claims.md. |
| uploaded (sent to a server) | enviado | subido | caricato | アップロード | 업로드 | 上传 | Only in the privacy sentences, where it means "sent over the internet". |
| paste | colar | pegar | incolla | 貼り付け | 붙여넣기 | 粘贴 | OS clipboard term. |
| link | link | enlace | link | リンク | 링크 | 链接 | A web address of an image. |
| drop (drag and drop) | soltar | soltar | trascina | ドロップ | 끌어다 놓기 | 拖放 | Dropping files onto the page. |
| import | importar | importar | importa | 読み込み | 가져오기 | 导入 | Opening a presets file into the app (OS term). |
| export | exportar | exportar | esporta | 書き出し | 내보내기 | 导出 | Making the PDF or the presets file. 書き出し is the macOS and Adobe Japanese term. |
| create PDF | criar PDF | crear PDF | crea PDF | PDFを作成 | PDF 만들기 | 创建PDF | The button that makes the PDF. |
| download | baixar | descargar | scarica | ダウンロード | 다운로드 | 下载 | Saving the PDF; fetching the face and pose models. |
| crop | cortar | recortar | ritaglia | トリミング | 자르기 | 裁剪 | Cutting the photo. Not the same word as crop marks in pt-BR (corte vs cortar is fine), ja (トリミング vs トンボ). |
| rotate | girar | girar | ruota | 回転 | 회전 | 旋转 | |
| flip | espelhar | voltear | rifletti | 反転 | 반전 | 翻转 | Horizontal: espelhar na horizontal, voltear horizontalmente, rifletti in orizzontale, 左右反転, 좌우 반전, 水平翻转. Vertical: espelhar na vertical, voltear verticalmente, rifletti in verticale, 上下反転, 상하 반전, 垂直翻转. |
| copies | cópias | copias | copie | 枚数 | 매수 | 份数 | How many times one image prints. |
| fixed size | tamanho fixo | tamaño fijo | dimensione fissa | 固定サイズ | 고정 크기 | 固定尺寸 | An image whose print size the user set. |
| aspect: Free | Livre | Libre | Libera | 自由 | 자유 | 自由 | Crop shape with no fixed ratio. |
| aspect: Original | Original | Original | Originale | 元の比率 | 원본 비율 | 原始比例 | Crop shape of the photo as taken. |
| remove | remover | quitar | rimuovi | 削除 | 삭제 | 移除 | Taking an image out of this session. |
| delete (a preset) | excluir | eliminar | elimina | 削除 | 삭제 | 删除 | Deleting a saved preset for good. |

## Studies

| en | pt-BR | es | it | ja | ko | zh-CN | Definition and source |
|---|---|---|---|---|---|---|---|
| study | estudo | estudio | studio | スタディ | 스터디 | 习作 | A printed version of a photo that simplifies it to help the artist see (blur, values). Art-school usage in each language. |
| Studies (tab, step) | Estudos | Estudios | Studi | スタディ | 스터디 | 习作 | |
| Original (version) | Original | Original | Originale | オリジナル | 원본 | 原图 | The photo as it is. |
| blur, squint study | desfoque | desenfoque | sfocatura | ぼかし | 흐림 | 模糊 | Blurring to see big shapes, like squinting. |
| Blurred (version) | Desfocada | Desenfocada | Sfocata | ぼかし | 흐림 | 模糊 | Agrees with foto/imagem (feminine) in pt-BR, es, it. |
| squint! (accent) | aperte os olhos! | ¡entrecierra los ojos! | strizza gli occhi! | 目を細めて！ | 눈을 가늘게! | 眯眼看！ | Hand-written accent. Tight. |
| values, tonal values | valores tonais | valores tonales | valori tonali | 明度 | 명도 | 明暗层次 | Lightness steps of a picture, the painter's sense of "value". Short form in tabs and version names: Valores, Valores, Valori, 明度, 명도, 明暗. |
| Values (version) | Valores | Valores | Valori | 明度 | 명도 | 明暗 | |
| Blur + Values (version) | Desfoque + Valores | Desenfoque + Valores | Sfocatura + Valori | ぼかし + 明度 | 흐림 + 명도 | 模糊 + 明暗 | Keep the `+` with its spaces. |
| value (one step) | valor | valor | valore | 階調 | 단계 | 层次 | "{{count}} values": {{count}} valores, {{count}} valores, {{count}} valori, {{count}}階調, {{count}}단계, {{count}}个层次. |
| value study | estudo de valores | estudio de valores | studio dei valori tonali | 明度スタディ | 명도 스터디 | 明暗习作 | |
| notan | notan | notan | notan | 濃淡 | 노탄 | 黑白 | Two-value study, from the Japanese 濃淡. |
| value ramp | escala de valores | escala de valores | scala dei valori | 明度スケール | 명도 단계표 | 明暗色阶 | The strip of value swatches from darkest to lightest. |
| darkest | mais escuro | más oscuro | più scuro | 最も暗い | 가장 어두운 | 最深 | Ramp end. |
| lightest tint | tom mais claro | tono más claro | tinta più chiara | 最も明るい色 | 가장 밝은 색 | 最浅色 | Ramp end. |
| hue | matiz | matiz | tinta | 色相 | 색상 | 色相 | The colour of a value study. Italian painters call hue "tinta". |
| custom hue | matiz personalizado | matiz personalizado | tinta personalizzata | カスタム色相 | 사용자 지정 색상 | 自定义色相 | |
| sepia | Sépia | Sepia | Seppia | セピア | 세피아 | 棕褐色 | Swatch names follow paint-tube names in each language. |
| terracotta | Terracota | Terracota | Terracotta | テラコッタ | 테라코타 | 赤陶色 | |
| ochre | Ocre | Ocre | Ocra | オーカー | 오커 | 土黄 | |
| sap green | Verde vesícula | Verde vejiga | Verde vescica | サップグリーン | 샙 그린 | 树汁绿 | The pigment name on paint tubes (verde vesícula, verde vejiga, verde vescica). |
| teal | Verde-azulado | Verde azulado | Verde petrolio | ティール | 청록 | 蓝绿 | |
| ultramarine | Azul ultramar | Azul ultramar | Blu oltremare | ウルトラマリン | 울트라마린 | 群青 | |
| violet | Violeta | Violeta | Violetto | バイオレット | 바이올렛 | 紫罗兰 | |
| neutral grey | Cinza neutro | Gris neutro | Grigio neutro | ニュートラルグレー | 뉴트럴 그레이 | 中性灰 | |
| apply to all images | aplicar a todas as imagens | aplicar a todas las imágenes | applica a tutte le immagini | すべての画像に適用 | 모든 이미지에 적용 | 应用到所有图片 | Buttons in Studies and Lines. |

## Lines and guides

| en | pt-BR | es | it | ja | ko | zh-CN | Definition and source |
|---|---|---|---|---|---|---|---|
| Lines (tab, section) | Linhas | Líneas | Linee | 線 | 선 | 线条 | |
| composition lines | linhas de composição | líneas de composición | linee di composizione | 構図線 | 구도선 | 构图线 | Geometric lines that help place the main shapes. |
| grid | grade | cuadrícula | griglia | グリッド | 격자 | 网格 | pt-BR "grade" (pt-PT would say grelha). Columns and rows: colunas, linhas / columnas, filas / colonne, righe / 列, 行 / 열, 행 / 列, 行. |
| rule of thirds | regra dos terços | regla de los tercios | regola dei terzi | 三分割法 | 삼분할 법칙 | 三分法 | Photography and art-school term. |
| diagonals | diagonais | diagonales | diagonali | 対角線 | 대각선 | 对角线 | |
| armature | armadura | armadura | armatura | 骨格線 | 골격선 | 骨架线 | The armature of the rectangle (Bouleau, *The Painter's Secret Geometry*), translated as armadura/armatura in Romance editions. The Korean loanword 아마추어 means "amateur", so a descriptive word is used in ja, ko and zh. "Diagonals & armature": Diagonais e armadura, Diagonales y armadura, Diagonali e armatura, 対角線と骨格線, 대각선과 골격선, 对角线与骨架线. |
| golden ratio | proporção áurea | proporción áurea | sezione aurea | 黄金比 | 황금비 | 黄金比例 | |
| golden spiral | espiral áurea | espiral áurea | spirale aurea | 黄金螺旋 | 황금 나선 | 黄金螺旋 | |
| centre lines | linhas centrais | líneas centrales | linee centrali | 中心線 | 중심선 | 中心线 | Lines through the middle of the photo. |
| line style | estilo da linha | estilo de línea | stile delle linee | 線のスタイル | 선 스타일 | 线条样式 | Colour, thickness, opacity: cor, espessura, opacidade / color, grosor, opacidad / colore, spessore, opacità / 色, 太さ, 不透明度 / 색상, 두께, 불투명도 / 颜色, 粗细, 不透明度. |
| guides | guias | guías | guide | ガイド | 가이드 | 辅助线 | Two senses, one word: lines found in the photo (edge outline, face, pose), and the preview overlay showing safe area, bleed and cut lines. |
| guides from the photo | guias da foto | guías de la foto | guide dalla foto | 写真からのガイド | 사진 기반 가이드 | 照片辅助线 | Section heading. |
| edge outline | contorno das bordas | contorno de bordes | contorno dei bordi | 輪郭線 | 윤곽선 | 边缘轮廓 | Lines traced along the edges in the photo. |
| detail (edge outline) | detalhe | detalle | dettaglio | 細かさ | 세밀도 | 细节 | The slider for how many edges are traced. |
| face construction lines | linhas de construção do rosto | líneas de construcción del rostro | linee di costruzione del volto | 顔のアタリ線 | 얼굴 구조선 | 面部结构线 | Brow, eye, nose and chin lines. アタリ is the Japanese illustrators' word for construction lines. Short label "Face construction": Construção do rosto, Construcción del rostro, Costruzione del volto, 顔のアタリ, 얼굴 구조선, 面部结构线. |
| pose figure | figura da pose | figura de la pose | figura della posa | ポーズの線 | 포즈 선 | 姿态线 | The stick figure of a body. "Body pose" (switch): Pose do corpo, Pose del cuerpo, Posa del corpo, 体のポーズ, 신체 포즈, 人体姿态. "Pose lines": linhas da pose, líneas de la pose, linee della posa, ポーズの線, 포즈 선, 姿态线. |
| landmarks | pontos de referência | puntos de referencia | punti di riferimento | ランドマーク | 랜드마크 | 关键点 | Points the face and pose models find. Not shown in the UI; may appear in the landing FAQ. |
| model (AI) | modelo | modelo | modello | モデル | 모델 | 模型 | The face or pose model file. "small AI model": pequeno modelo de IA, pequeño modelo de IA, piccolo modello di IA, 小さなAIモデル, 작은 AI 모델, 小型AI模型. |
| model download | download do modelo | descarga del modelo | download del modello | モデルのダウンロード | 모델 다운로드 | 模型下载 | The one-time download of a face or pose model, only after the user asks. |
| on device | no dispositivo | en el dispositivo | sul dispositivo | 端末内 | 기기에서 | 本机 | Badge: the guides run on this device. Tight. |
| this device | este dispositivo | este dispositivo | questo dispositivo | このデバイス | 이 기기 | 本设备 | Where photos, settings and presets stay. |
| offline | offline | sin conexión | offline | オフライン | 오프라인 | 离线 | Working without an internet connection. |

## Presets, arranging and the app

| en | pt-BR | es | it | ja | ko | zh-CN | Definition and source |
|---|---|---|---|---|---|---|---|
| preset | preset | preajuste | preset | プリセット | 프리셋 | 预设 | Saved settings under a name. pt-BR and it keep the loanword everyday photo apps use (o preset, il preset); it fits the 320 px top bar where "predefinição" does not (context.md). es "preajuste" is the Latin American software term. |
| settings | configurações | configuración | impostazioni | 設定 | 설정 | 设置 | |
| page setup | configuração da página | configuración de página | impostazione pagina | ページ設定 | 페이지 설정 | 页面设置 | OS print dialogs. |
| arrange | organizar | organizar | disponi | 配置 | 배치 | 排列 | Placing photos by hand on the page. |
| swap | trocar | intercambiar | scambia | 入れ替え | 교체 | 交换 | Exchanging two photos' places. |
| move to page | mover para a página | mover a la página | sposta nella pagina | ページへ移動 | 페이지로 이동 | 移到页面 | |
| re-run auto layout | refazer o layout automático | rehacer el diseño automático | ripeti l'impaginazione automatica | 自動レイアウトをやり直す | 자동 배치 다시 실행 | 重新自动排版 | Throws away the hand arrangement. |
| layout | layout | diseño | impaginazione | レイアウト | 레이아웃 | 排版 | How photos are packed onto pages. |
| undo | desfazer | deshacer | annulla | 元に戻す | 실행 취소 | 撤销 | OS term. |
| preview | prévia | vista previa | anteprima | プレビュー | 미리보기 | 预览 | Phone step: Prévia, Vista previa (tight: "Vista previa" ≤ 12, see context.md), Anteprima, プレビュー, 미리보기, 预览. |
| theme: auto, light, dark | automático, claro, escuro | automático, claro, oscuro | automatico, chiaro, scuro | 自動, ライト, ダーク | 자동, 라이트, 다크 | 自动, 浅色, 深色 | Colour theme names, as each OS names its appearance setting. |
| cancel | cancelar | cancelar | annulla | キャンセル | 취소 | 取消 | OS term. |
| close | fechar | cerrar | chiudi | 閉じる | 닫기 | 关闭 | OS term. |
| done | concluído | listo | fine | 完了 | 완료 | 完成 | Button that closes an editor. |
| dismiss | dispensar | descartar | ignora | 閉じる | 닫기 | 关闭 | Closing a notice. |
| try again | tentar de novo | intentar de nuevo | riprova | もう一度試す | 다시 시도 | 重试 | |
| notifications | notificações | notificaciones | notifiche | 通知 | 알림 | 通知 | The notice region (screen readers). |
| arrow keys | teclas de seta | teclas de flecha | tasti freccia | 矢印キー | 화살표 키 | 方向键 | Key names themselves stay in English (see Do not translate). |

## Counters (ja, ko, zh-CN)

| en | pt-BR | es | it | ja | ko | zh-CN | Definition and source |
|---|---|---|---|---|---|---|---|
| {{count}} photos / images | {{count}} fotos / imagens | {{count}} fotos / imágenes | {{count}} foto / immagini | {{count}}枚 | {{count}}장 | {{count}}张 | Counter for photos, images and sheets. |
| {{count}} pages | {{count}} páginas | {{count}} páginas | {{count}} pagine | {{count}}ページ | {{count}}페이지 | {{count}}页 | |
| {{count}} presets | {{count}} presets | {{count}} preajustes | {{count}} preset | {{count}}件 | {{count}}개 | {{count}}个 | |
| {{count}} copies | {{count}} cópias | {{count}} copias | {{count}} copie | {{count}}枚 | {{count}}장 | {{count}}份 | |

## Do not translate

These are written exactly as here in every language (the locale check may warn that they equal English; that is expected):

- Product and brand names: `Artistica`, `MediaPipe`, `Google`, `GitHub`, `MIT`, `iPhone`, `Mac`, `Chrome`, `Edge`, `Firefox`, `Safari`, `WebGL`.
- File formats and units of resolution: `PDF`, `JPG`, `PNG`, `WebP`, `GIF`, `HEIC`, `DPI`, `MB`.
- ISO paper sizes: `A3`, `A4`, `A5`, `A6`.
- Keyboard key names (owner Q16): `Shift`, `Ctrl`, `⌘`, `Page Up`, `Page Down`, `Enter`, `Esc`, and the shortcuts `Ctrl+V`, `⌘V`.
- Glyphs and ratios: `×`, `·`, `→`, `−`, `+`, `↖`, `↗`, `↙`, `↘`, `1:1`, `4:3`, `3:2`, `16:9`, `3:4`, `2:3`, `9:16`.
- The placeholder URL `https://example.com/photo.jpg` and the hex example `#1f3fbf`.

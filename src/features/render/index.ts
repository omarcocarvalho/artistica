// --- Page model (Task 1) ---
export type { DrawTile, EncodedTileImage, PageModel, Segment } from './types'
export { buildPageModels } from './page-model/build-page-models'
export type { StudyGroupOutline } from './types'
export { readingOrder } from './page-model/build-page-models'
export { CROP_MARK_WIDTH_PT } from './page-model/crop-marks'
export { resolveCrop } from './crop'
export { orientMatrix } from './pixels/tile-plan'
export type { LineStroke, TileLines } from './types'
export {
  MAX_GUIDE_CMDS_PER_TILE,
  MAX_LINE_CMDS_PER_TILE,
  tileLinesFor,
} from './page-model/tile-lines'
// --- Preview (Task 5) ---
export { PagePreview, type PagePreviewProps, type PreviewSource } from './components/PagePreview'
export { GuidesToggle } from './components/GuidesToggle'
export { GuidesLegend } from './components/GuidesLegend'
export type { StudyTileProvider, StudyTileRequest } from './preview/study-tiles'
// --- Export (Task 4) ---
export { exportPdf } from './export/export-pdf'
export type { ExportOptions, ExportProgress, ExportSource, GetSource } from './export/run-export'
export { ExportError, type ExportErrorCode } from './export/errors'
export { pdfFileName } from './export/file-name'
// --- Export dialog (Task 6) ---
export { ExportDialog, type ExportDialogProps } from './components/ExportDialog'

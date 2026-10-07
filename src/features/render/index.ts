// --- Page model (Task 1) ---
export type { DrawTile, EncodedTileImage, PageModel, Segment } from './types'
export { buildPageModels } from './page-model/build-page-models'
export type { StudyGroupOutline } from './types'
export { readingOrder } from './page-model/build-page-models'
export { CROP_MARK_WIDTH_PT } from './page-model/crop-marks'
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

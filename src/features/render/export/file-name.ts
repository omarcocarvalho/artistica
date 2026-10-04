/**
 * D10: `artistica-<PAPER>-<YYYY-MM-DD>.pdf` with the local date. `paperLabel` comes from the shell
 * (CR-E2), e.g. "A4", "Letter", "Custom"; characters unsafe in file names become "-".
 */
export function pdfFileName(paperLabel: string, date: Date): string {
  const paper = paperLabel.trim().replace(/[^A-Za-z0-9._-]+/g, '-') || 'Custom'
  const pad = (n: number): string => String(n).padStart(2, '0')
  const day = `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `artistica-${paper}-${day}.pdf`
}

/** Keep a user-edited name safe to download: trims, strips path separators, forces ".pdf". */
export function sanitizePdfFileName(name: string, fallback: string): string {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, '-')
  if (cleaned === '' || cleaned === '.pdf') return fallback
  return /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned}.pdf`
}

import {
  MAX_PRESET_FILE_BYTES,
  parsePresetFile,
  type PresetImport,
} from '../../shared/model/preset'

/** Long enough for every browser to have started the download before the URL goes. */
export const PRESET_URL_REVOKE_MS = 40_000

/** M5-R4: `artistica-presets-YYYY-MM-DD.json`, local date. */
export function presetFileName(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `artistica-presets-${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`
}

/** Saves `text` through a local Blob URL and a temporary `<a download>`; nothing leaves the device. */
export function downloadJson(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, PRESET_URL_REVOKE_MS)
}

/** M5-R4/R5: the size is checked before the file is read; never throws. */
export async function readPresetFile(file: Blob): Promise<PresetImport> {
  if (file.size > MAX_PRESET_FILE_BYTES) return { ok: false, error: 'too-large' }
  let text: string
  try {
    text = await file.text()
  } catch {
    return { ok: false, error: 'not-json' }
  }
  return parsePresetFile(text)
}

import { render, type RenderResult } from '@testing-library/react'
import { createInstance } from 'i18next'
import type { ReactElement } from 'react'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import common from '../../locales/en/common.json'
import errors from '../../locales/en/errors.json'
import images from '../../locales/en/images.json'
import { DEFAULT_EDITS, type ImageEdits, type ImageId } from '../../shared/model/image'
import { DEFAULT_STUDY } from '../../shared/model/study'
import type { LoadedImage } from './types'

export function createTestI18n() {
  const i18n = createInstance()
  void i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    ns: ['common', 'images', 'errors'],
    defaultNS: 'images',
    resources: { en: { common, images, errors } },
    interpolation: { escapeValue: false },
    initAsync: false,
  })
  return i18n
}

export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(<I18nextProvider i18n={createTestI18n()}>{ui}</I18nextProvider>)
}

let counter = 0

/** A LoadedImage with a fake preview bitmap. happy-dom has no ImageBitmap; the structural shape is enough. */
export function makeLoadedImage(
  over: Partial<Omit<LoadedImage, 'edits'>> & { edits?: Partial<ImageEdits> } = {},
): LoadedImage {
  counter += 1
  const pxW = over.pxW ?? 480
  const pxH = over.pxH ?? 640
  const { edits, ...rest } = over
  return {
    id: over.id ?? (`img-${String(counter)}` as ImageId),
    contentHash: `hash-${String(counter)}`,
    name: `photo-${String(counter)}.jpg`,
    pxW,
    pxH,
    originalPxW: pxW,
    originalPxH: pxH,
    thumbUrl: `blob:thumb-${String(counter)}`,
    preview: { width: pxW, height: pxH, close: () => undefined },
    source: new Blob(),
    study: DEFAULT_STUDY,
    ...rest,
    edits: { ...DEFAULT_EDITS, ...edits },
  }
}

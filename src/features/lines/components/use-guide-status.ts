import type { ImageDescriptor } from '../../../shared/model/image'
import {
  detectionKey,
  isOn,
  useDetections,
  type DetectionStatus,
  type GuideKind,
} from '../detect/store'

export type GuideView =
  | { readonly view: 'idle' }
  | { readonly view: 'box'; readonly bytes: number }
  | { readonly view: 'downloading'; readonly loaded: number; readonly total: number }
  | { readonly view: 'running' }
  | { readonly view: 'found' }
  | { readonly view: 'none-found' }
  | { readonly view: 'download-failed' }
  | { readonly view: 'failed' }
  | { readonly view: 'unsupported' }

export function guideView(
  kind: GuideKind,
  on: boolean,
  status: DetectionStatus | undefined,
  landmarksSupported: boolean,
): GuideView {
  if (!on) return { view: 'idle' }
  // owner Q15, default: without WebGL, a note replaces the download box.
  const noWebGL =
    kind !== 'edges' &&
    ((!landmarksSupported && (status === undefined || status.state === 'needs-download')) ||
      (status?.state === 'failed' && status.reason === 'unsupported'))
  if (noWebGL) return { view: 'unsupported' }
  if (status === undefined) return { view: 'idle' }
  switch (status.state) {
    case 'needs-download':
      return { view: 'box', bytes: status.bytes }
    case 'downloading':
      return { view: 'downloading', loaded: status.loaded, total: status.total }
    case 'running':
      return { view: 'running' }
    case 'done':
      return status.found > 0 ? { view: 'found' } : { view: 'none-found' }
    case 'failed':
      return kind !== 'edges' && (status.reason === 'download' || status.reason === 'integrity')
        ? { view: 'download-failed' }
        : { view: 'failed' }
  }
}

export function useGuideStatus(
  kind: GuideKind,
  image: Pick<ImageDescriptor, 'contentHash' | 'edits' | 'lines'>,
): DetectionStatus | undefined {
  const key = isOn(kind, image) ? detectionKey(kind, image) : null
  return useDetections((s) => (key === null ? undefined : s.status.get(key)))
}

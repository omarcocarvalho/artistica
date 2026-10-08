import { create } from 'zustand'
import type { ImageDescriptor } from '../../../shared/model/image'
import { cropKey } from '../guides/map'
import type { EdgeOutline, FaceLandmarks, ImageGuides, PoseLandmarks } from '../guides/types'

export type AiModel = 'face' | 'pose'
export type GuideKind = 'face' | 'pose' | 'edges'

export type DetectionStatus =
  | { readonly state: 'needs-download'; readonly bytes: number }
  | { readonly state: 'downloading'; readonly loaded: number; readonly total: number }
  | { readonly state: 'running' }
  | { readonly state: 'done'; readonly found: number }
  | {
      readonly state: 'failed'
      readonly reason: 'download' | 'integrity' | 'unsupported' | 'error'
    }

export type DetectionResult = readonly FaceLandmarks[] | readonly PoseLandmarks[] | EdgeOutline

export type ModelState = 'unknown' | 'absent' | 'cached' | 'downloading' | 'failed'

export interface DetectionsState {
  readonly results: ReadonlyMap<string, DetectionResult>
  readonly status: ReadonlyMap<string, DetectionStatus>
  readonly models: Readonly<Record<AiModel, ModelState>>
}

export const INITIAL_DETECTIONS: DetectionsState = {
  results: new Map(),
  status: new Map(),
  models: { face: 'unknown', pose: 'unknown' },
}

export const useDetections = create<DetectionsState>()(() => INITIAL_DETECTIONS)

type KeyedImage = Pick<ImageDescriptor, 'contentHash' | 'edits' | 'lines'>

/** M4-R8, prefixed with the kind so face and pose of one image never share an entry. */
export function detectionKey(kind: GuideKind, img: KeyedImage): string {
  if (kind === 'edges') {
    return `edges|${img.contentHash}|${cropKey(img.edits.crop)}|d${String(img.lines.edges.detailPct)}`
  }
  return `${kind}|${img.contentHash}|r${String(img.edits.rotation)}`
}

export function isOn(kind: GuideKind, img: Pick<ImageDescriptor, 'lines'>): boolean {
  return kind === 'edges' ? img.lines.edges.on : img.lines[kind]
}

export function guidesFor(state: DetectionsState, img: ImageDescriptor): ImageGuides {
  const found = (kind: GuideKind) =>
    isOn(kind, img) ? (state.results.get(detectionKey(kind, img)) ?? null) : null
  return {
    faces: found('face') as readonly FaceLandmarks[] | null,
    poses: found('pose') as readonly PoseLandmarks[] | null,
    edges: found('edges') as EdgeOutline | null,
  }
}

const KINDS: readonly GuideKind[] = ['face', 'pose', 'edges']

export function guidesPending(state: DetectionsState, images: readonly ImageDescriptor[]): boolean {
  return images.some((img) =>
    KINDS.some((kind) => {
      if (!isOn(kind, img)) return false
      const s = state.status.get(detectionKey(kind, img))?.state
      return s === 'downloading' || s === 'running'
    }),
  )
}

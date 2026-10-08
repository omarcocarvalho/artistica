import type { PathCmd } from '../types'

/** A point normalised to the source image (pxW × pxH, EXIF-corrected, before crop, rotation, flips): 0..1, y down. */
export interface SourcePoint {
  readonly x: number
  readonly y: number
}

export interface FaceLandmarks {
  /** 478, in MediaPipe face-mesh order. */
  readonly points: readonly SourcePoint[]
}

export interface PoseLandmarks {
  /** 33, in MediaPipe pose order. */
  readonly points: readonly SourcePoint[]
  /** 33, 0..1. */
  readonly visibility: readonly number[]
}

export interface EdgeOutline {
  /** At most MAX_EDGE_VERTICES points in total. */
  readonly polylines: readonly (readonly SourcePoint[])[]
}

/** What has been found for one image, for its current rotation, crop and detail. null = nothing known (not run, running, failed). */
export interface ImageGuides {
  readonly faces: readonly FaceLandmarks[] | null
  readonly poses: readonly PoseLandmarks[] | null
  readonly edges: EdgeOutline | null
}

export const NO_GUIDES: ImageGuides = { faces: null, poses: null, edges: null }

/** Paths in source pixels (M4-R10). */
export interface SourcePath {
  readonly cmds: readonly PathCmd[]
}

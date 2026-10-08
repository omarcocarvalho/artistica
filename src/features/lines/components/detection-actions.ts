import { createContext, useContext } from 'react'
import type { ImageId } from '../../../shared/model/image'
import type { AiModel, GuideKind } from '../detect/store'

export interface DetectionActions {
  /** The user's "Download & turn on" (M4-R19). */
  readonly download: (model: AiModel) => void
  readonly retry: (kind: GuideKind, imageId: ImageId) => void
  /** False when face and pose guides can't run here: no WebGL (owner Q15, default). */
  readonly landmarksSupported: boolean
}

export const DetectionsContext = createContext<DetectionActions | null>(null)

export function useDetectionActions(): DetectionActions | null {
  return useContext(DetectionsContext)
}
interface CanvasMaker {
  createElement(tag: 'canvas'): Pick<HTMLCanvasElement, 'getContext'>
}

/** Whether a page canvas gets a WebGL context, which face and pose guides need (C1-R1). */
export function pageHasWebGL(doc: CanvasMaker = document): boolean {
  try {
    const canvas = doc.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

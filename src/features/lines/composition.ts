import {
  activeLineTypes,
  COMPOSITION_LINE_TYPES,
  type CompositionLineType,
  type LineSettings,
  type LineType,
} from '../../shared/model/lines'
import { armaturePaths, centrePaths, goldenPaths, gridPaths, thirdsPaths } from './geometry'
import { goldenSpiral } from './spiral'
import type { FramePath, FrameSize, PathCmd } from './types'

const isComposition = (type: LineType): type is CompositionLineType =>
  (COMPOSITION_LINE_TYPES as readonly LineType[]).includes(type)

/** Every active type's paths in canonical order (M3-R15); a type that draws nothing is left out. Centre lines are the only dashed type (M3-R14). */
export function compositionPaths(lines: LineSettings, frame: FrameSize): FramePath[] {
  const cmdsOf = (type: FramePath['type']): readonly PathCmd[] => {
    switch (type) {
      case 'grid':
        return gridPaths(lines.grid.cols, lines.grid.rows, frame)
      case 'thirds':
        return thirdsPaths(frame)
      case 'armature':
        return armaturePaths(frame)
      case 'golden':
        return goldenPaths(frame)
      case 'spiral':
        return goldenSpiral(lines.spiral.corner, frame)
      case 'centre':
        return centrePaths(frame)
    }
  }
  return activeLineTypes(lines)
    .filter(isComposition)
    .flatMap((type) => {
      const cmds = cmdsOf(type)
      return cmds.length === 0 ? [] : [{ type, dashed: type === 'centre', cmds }]
    })
}

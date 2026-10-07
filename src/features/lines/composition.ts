import { activeLineTypes, type LineSettings } from '../../shared/model/lines.ts'
import { armaturePaths, centrePaths, goldenPaths, gridPaths, thirdsPaths } from './geometry.ts'
import { goldenSpiral } from './spiral.ts'
import type { FramePath, FrameSize, PathCmd } from './types.ts'

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
  return activeLineTypes(lines).flatMap((type) => {
    const cmds = cmdsOf(type)
    return cmds.length === 0 ? [] : [{ type, dashed: type === 'centre', cmds }]
  })
}

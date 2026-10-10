import { describe, expect, it } from 'vitest'
import * as ui from './index'

describe('ui barrel', () => {
  it('exports exactly the shared runtime surface', () => {
    expect(Object.keys(ui).sort()).toEqual(
      [
        'Badge',
        'BottomSheet',
        'Button',
        'Callout',
        'Chip',
        'ColourField',
        'CountField',
        'Dialog',
        'ICON_NAMES',
        'Icon',
        'IconButton',
        'NumberField',
        'ProgressBar',
        'SegmentedControl',
        'Select',
        'SketchCard',
        'Slider',
        'Switch',
        'Tabs',
        'Tooltip',
        'VisuallyHidden',
        'buttonClasses',
        'cx',
        'parseDecimal',
        'useAfterPaint',
        'useImportWait',
      ].sort(),
    )
  })

  it('buttonClasses styles a link like a Button (CCR-D7)', () => {
    expect(ui.buttonClasses('primary', 'lg', { block: true })).toBe(
      'ds-btn ds-btn--primary ds-btn--lg ds-btn--block',
    )
  })

  it('parseDecimal is usable from the barrel', () => {
    expect(ui.parseDecimal('1,5')).toBe(1.5)
  })
})

import { describe, expect, it } from 'vitest'
import { shouldHandlePaste } from './paste'

describe('shouldHandlePaste', () => {
  it('ignores pastes into text inputs, textareas, selects and contenteditable (e.g. the "add link" field)', () => {
    const input = document.createElement('input')
    const area = document.createElement('textarea')
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    editable.tabIndex = 0
    expect(shouldHandlePaste(input)).toBe(false)
    expect(shouldHandlePaste(area)).toBe(false)
    expect(shouldHandlePaste(editable)).toBe(false)
  })
  it('handles pastes on the body and on buttons', () => {
    expect(shouldHandlePaste(document.body)).toBe(true)
    expect(shouldHandlePaste(document.createElement('button'))).toBe(true)
    expect(shouldHandlePaste(null)).toBe(true)
  })
  it('treats non-text inputs (file, checkbox) as handled', () => {
    const file = document.createElement('input')
    file.type = 'file'
    expect(shouldHandlePaste(file)).toBe(true)
  })
})

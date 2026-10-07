import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useImportWait } from './use-import-wait'

function Panel({ importing }: { importing: boolean }) {
  const { waiting, hintId, hintRef, panelRef } = useImportWait(importing)
  return (
    <div ref={panelRef}>
      <p ref={hintRef} id={hintId} tabIndex={-1}>
        {waiting ? 'Waiting' : null}
      </p>
      <button type="button" disabled={waiting} aria-describedby={waiting ? hintId : undefined}>
        Grid
      </button>
    </div>
  )
}

const outside = document.createElement('button')

afterEach(() => {
  outside.remove()
})

function setup(importing = false) {
  document.body.append(outside)
  const view = render(<Panel importing={importing} />)
  const set = (next: boolean) => {
    act(() => {
      view.rerender(<Panel importing={next} />)
    })
  }
  return {
    set,
    control: () => screen.getByRole('button', { name: 'Grid' }),
    hint: () => view.container.querySelector('p') as HTMLElement,
  }
}

describe('useImportWait', () => {
  it('reports the wait and links the controls to the hint', () => {
    const { control } = setup(true)
    expect(control()).toBeDisabled()
    expect(control()).toHaveAccessibleDescription('Waiting')
  })

  it('moves focus from a disabled control to the hint, and back when the wait ends', () => {
    const { set, control, hint } = setup()
    control().focus()
    set(true)
    expect(document.activeElement).toBe(hint())
    set(false)
    expect(document.activeElement).toBe(control())
  })

  it('does not take focus back once the person has moved it elsewhere', () => {
    const { set, control } = setup()
    control().focus()
    set(true)
    outside.focus()
    set(false)
    expect(document.activeElement).toBe(outside)
  })

  it('leaves focus outside the panel alone', () => {
    const { set } = setup()
    outside.focus()
    set(true)
    expect(document.activeElement).toBe(outside)
    set(false)
    expect(document.activeElement).toBe(outside)
  })

  it('never returns focus to a control from an earlier wait', () => {
    const { set, control, hint } = setup()
    control().focus()
    set(true)
    outside.focus()
    set(false)
    set(true)
    hint().focus()
    set(false)
    expect(document.activeElement).toBe(hint())
  })
})

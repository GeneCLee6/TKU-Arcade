// Two known gaps of the promotion board (docs/PRD/e3-promotion-board.md, C5 細節): Esc with the
// square's drawer open in focus mode closed both, and two-finger zoom stopped working once the
// layout crossed 900 px (the scrolling box is a new element then).
import { act, fireEvent, render, renderHook } from '@testing-library/react'
import { useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { useBoardZoom } from '../../../src/games/promotion/useBoardZoom.ts'
import { useImmersive } from '../../../src/games/promotion/useImmersive.ts'

describe('focus mode', () => {
  async function enterFocus() {
    const hook = renderHook(() => {
      const target = useRef<HTMLDivElement>(document.createElement('div'))
      return useImmersive(target)
    })
    // jsdom has no Fullscreen API, so entering falls back to focus mode
    await act(() => hook.result.current.enter())
    return hook
  }

  it('is left with Esc', async () => {
    const hook = await enterFocus()
    expect(hook.result.current.mode).toBe('focus')
    act(() => void fireEvent.keyDown(window, { key: 'Escape' }))
    expect(hook.result.current.mode).toBe('off')
  })

  it('stays when that Esc closes an open dialog (the square’s drawer)', async () => {
    const hook = await enterFocus()
    const dialog = document.createElement('dialog')
    dialog.setAttribute('open', '')
    document.body.append(dialog)
    act(() => void fireEvent.keyDown(window, { key: 'Escape' }))
    expect(hook.result.current.mode).toBe('focus')
    dialog.remove()
    act(() => void fireEvent.keyDown(window, { key: 'Escape' }))
    expect(hook.result.current.mode).toBe('off')
  })
})

/** Two fingers `spread` px apart, as the touch events carry them */
function pinch(element: Element, type: string, spread: number) {
  const touches = [
    { clientX: 0, clientY: 0 },
    { clientX: spread, clientY: 0 },
  ]
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'touches', { value: touches })
  element.dispatchEvent(event)
}

describe('two-finger zoom', () => {
  function Board() {
    const [wide, setWide] = useState(true)
    const { attach, zoom: level } = useBoardZoom()
    // Like GameLayout: the wide and narrow layouts are separate trees, so the box is remounted
    return (
      <>
        <button onClick={() => setWide((was) => !was)}>switch</button>
        <output data-testid="zoom">{level}</output>
        {wide ? (
          <div key="wide" data-testid="box" ref={attach} />
        ) : (
          <section key="narrow">
            <div data-testid="box" ref={attach} />
          </section>
        )}
      </>
    )
  }

  it('still works on the new box after the layout switches', () => {
    const view = render(<Board />)
    const first = view.getByTestId('box')
    act(() => {
      pinch(first, 'touchstart', 100)
      pinch(first, 'touchmove', 200)
      pinch(first, 'touchend', 0)
    })
    expect(view.getByTestId('zoom').textContent).toBe('2')

    act(() => void fireEvent.click(view.getByText('switch')))
    const second = view.getByTestId('box')
    expect(second).not.toBe(first)
    act(() => {
      pinch(second, 'touchstart', 100)
      pinch(second, 'touchmove', 150)
    })
    expect(view.getByTestId('zoom').textContent).toBe('3')
  })
})

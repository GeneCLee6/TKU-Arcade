import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { DEFAULT_BINDINGS, type Bindings } from '../../shared/kart/input.ts'
import { DEFAULT_RULES, type KartRules } from '../../shared/kart/physics.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { ControlsPanel } from '../../src/kart/ControlsPanel.tsx'
import {
  keyLabel,
  loadBindings,
  loadRules,
  padLabel,
  readGamepad,
  saveBindings,
  saveRules,
} from '../../src/kart/devices.ts'

registerMessages(KART_MESSAGES)
const t = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

function Harness({ saves = true, onClose = () => {} }: { saves?: boolean; onClose?: () => void }) {
  const [bindings, setBindings] = useState<Bindings>(DEFAULT_BINDINGS)
  const [rules, setRules] = useState<KartRules>(DEFAULT_RULES)
  return (
    <>
      <span data-testid="drift">{JSON.stringify(bindings.keys.drift)}</span>
      <span data-testid="boost">{JSON.stringify(bindings.keys.boost)}</span>
      <span data-testid="rules">{JSON.stringify(rules)}</span>
      <ControlsPanel
        t={t}
        bindings={bindings}
        rules={rules}
        onBindings={(next) => {
          setBindings(next)
          return saves
        }}
        onRules={(next) => {
          setRules(next)
          return saves
        }}
        onClose={onClose}
      />
    </>
  )
}

const status = () => screen.getByRole('status')
const press = (code: string) => fireEvent.keyDown(window, { code })

describe('the controls panel', () => {
  it('starts with the keyboard on its title and names every place with its binding', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: 'Controls' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Drift, Keyboard 1: Z' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drift, Keyboard 2: Space' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Drift, Gamepad 1: RB' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Steer left, Gamepad 1: Left stick left' }),
    ).toBeInTheDocument()
  })

  it('binds the next key pressed, and keeps it from reaching the page', () => {
    const onPage = vi.fn()
    window.addEventListener('keydown', onPage)
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Drift, Keyboard 1: Z' }))
    expect(
      screen.getByRole('button', { name: 'Drift, Keyboard 1: Press a key' }),
    ).toBeInTheDocument()
    expect(status()).toHaveTextContent('Press a key for Drift')

    press('ShiftLeft')
    expect(screen.getByTestId('drift')).toHaveTextContent('["ShiftLeft","Space"]')
    expect(status()).toHaveTextContent('Drift: Left Shift.')
    expect(onPage).not.toHaveBeenCalled()
    window.removeEventListener('keydown', onPage)
  })

  it('takes a key from the action that had it, and says so', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Boost, Keyboard 1: X' }))
    press('Space')
    expect(screen.getByTestId('boost')).toHaveTextContent('["Space","KeyE"]')
    expect(screen.getByTestId('drift')).toHaveTextContent('["KeyZ",null]')
    expect(status()).toHaveTextContent('It was taken from Drift, Keyboard 2')
    expect(screen.getByRole('button', { name: 'Drift, Keyboard 2: None' })).toBeInTheDocument()
  })

  it('cancels with Escape, empties with Backspace and refuses reserved keys', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Drift, Keyboard 1: Z' }))
    press('KeyF')
    expect(status()).toHaveTextContent('F is kept for the page')
    press('Escape')
    expect(status()).toHaveTextContent('Nothing changed.')
    // Escape while waiting cancels the wait, not the panel
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByTestId('drift')).toHaveTextContent('["KeyZ","Space"]')

    fireEvent.click(screen.getByRole('button', { name: 'Drift, Keyboard 1: Z' }))
    press('Backspace')
    expect(screen.getByTestId('drift')).toHaveTextContent('[null,"Space"]')
    expect(status()).toHaveTextContent('Drift: emptied.')

    press('Escape')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('resets to the defaults', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Boost, Keyboard 1: X' }))
    press('Space')
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(screen.getByTestId('boost')).toHaveTextContent('["KeyX","KeyE"]')
    expect(status()).toHaveTextContent('Back to the default controls.')
  })

  it('says when the browser will not keep the change', () => {
    render(<Harness saves={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Boost, Keyboard 1: X' }))
    press('KeyC')
    expect(status()).toHaveTextContent("won't keep the change")
  })

  it('switches the rules', () => {
    render(<Harness />)
    fireEvent.click(
      screen.getByRole('checkbox', { name: 'Fire a boost by itself when the gauge fills' }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Release boosts and chains' }))
    expect(screen.getByTestId('rules')).toHaveTextContent('{"autoBoost":true,"chainBoosts":false}')
  })

  it('binds a gamepad control pressed after the wait began, not one already held', () => {
    let frame: FrameRequestCallback | undefined
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
    const axes = [0, 0, 0, 0]
    // A is held when the wait begins
    buttons[0] = { pressed: true, touched: true, value: 1 }
    const gamepad = { id: 'Test pad', connected: true, mapping: 'standard', buttons, axes }
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [gamepad] })

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Boost, Gamepad 1: X' }))
    expect(status()).toHaveTextContent('Press a gamepad button or push a stick for Boost')
    act(() => frame?.(0))
    expect(
      screen.getByRole('button', { name: 'Boost, Gamepad 1: Press a gamepad control' }),
    ).toBeInTheDocument()

    buttons[3] = { pressed: true, touched: true, value: 1 }
    act(() => frame?.(16))
    expect(screen.getByRole('button', { name: 'Boost, Gamepad 1: Y' })).toBeInTheDocument()
    // Y was the second boost button: it moved
    expect(screen.getByRole('button', { name: 'Boost, Gamepad 2: None' })).toBeInTheDocument()
    Reflect.deleteProperty(navigator, 'getGamepads')
  })

  it('says when there is no gamepad yet', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Drift, Gamepad 1: RB' }))
    expect(status()).toHaveTextContent('No gamepad found yet')
  })
})

describe('storage', () => {
  it('keeps bindings and rules', () => {
    const changed = {
      ...DEFAULT_BINDINGS,
      keys: { ...DEFAULT_BINDINGS.keys, drift: ['ShiftLeft', null] },
    }
    expect(saveBindings(changed)).toBe(true)
    expect(loadBindings()).toEqual(changed)
    expect(saveRules({ autoBoost: true, chainBoosts: false })).toBe(true)
    expect(loadRules()).toEqual({ autoBoost: true, chainBoosts: false })
  })

  it('works without localStorage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(loadBindings()).toEqual(DEFAULT_BINDINGS)
    expect(loadRules()).toEqual(DEFAULT_RULES)
    expect(saveBindings(DEFAULT_BINDINGS)).toBe(false)
    expect(saveRules(DEFAULT_RULES)).toBe(false)
  })

  it('ignores broken rules', () => {
    localStorage.setItem('tku-arcade.kart.rules', '{"autoBoost":"yes"')
    expect(loadRules()).toEqual(DEFAULT_RULES)
    localStorage.setItem('tku-arcade.kart.rules', '{"autoBoost":1,"chainBoosts":false}')
    expect(loadRules()).toEqual({ autoBoost: false, chainBoosts: false })
  })
})

describe('devices', () => {
  it('names keys and gamepad controls', () => {
    expect(keyLabel('KeyW', t)).toBe('W')
    expect(keyLabel('Digit3', t)).toBe('3')
    expect(keyLabel('Space', t)).toBe('Space')
    expect(keyLabel('Numpad4', t)).toBe('Numpad 4')
    expect(keyLabel('Backquote', t)).toBe('Backquote')
    expect(padLabel({ kind: 'button', index: 0 }, t)).toBe('A')
    expect(padLabel({ kind: 'button', index: 12 }, t)).toBe('D-pad up')
    expect(padLabel({ kind: 'button', index: 20 }, t)).toBe('Button 20')
    expect(padLabel({ kind: 'axis', index: 3, direction: 1 }, t)).toBe('Right stick down')
    expect(padLabel({ kind: 'axis', index: 5, direction: -1 }, t)).toBe('Axis 5 −')
  })

  it('reads the first connected gamepad, preferring the standard mapping', () => {
    const odd = { id: 'Odd', connected: true, mapping: '', buttons: [], axes: [] }
    const standard = {
      id: 'Standard',
      connected: true,
      mapping: 'standard',
      buttons: [{ pressed: true, touched: true, value: 0 }],
      axes: [0.5],
    }
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [null, odd, standard],
    })
    // A digital button reports value 0 on some browsers: pressed still counts as 1
    expect(readGamepad()).toEqual({ id: 'Standard', snapshot: { buttons: [1], axes: [0.5] } })
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [null] })
    expect(readGamepad()).toBeUndefined()
    Reflect.deleteProperty(navigator, 'getGamepads')
    expect(readGamepad()).toBeUndefined()
  })
})

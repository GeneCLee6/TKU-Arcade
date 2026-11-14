import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KART_MESSAGES } from '../../shared/kart/i18n.ts'
import { KART_TUNING, type KartTuning } from '../../shared/kart/physics.ts'
import { PRESETS, serializeTuning } from '../../shared/kart/tuning.ts'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { loadTuning, saveTuning } from '../../src/kart/devices.ts'
import { TuningPanel } from '../../src/kart/TuningPanel.tsx'

registerMessages(KART_MESSAGES)
const t = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `kart.${string}`, params)

beforeEach(() => {
  localStorage.clear()
  current = KART_TUNING
})
afterEach(() => vi.restoreAllMocks())

let current: KartTuning = KART_TUNING

function Harness({ saves = true, onClose = () => {} }: { saves?: boolean; onClose?: () => void }) {
  const [tuning, setTuning] = useState<KartTuning>(KART_TUNING)
  return (
    <TuningPanel
      t={t}
      tuning={tuning}
      onTuning={(next) => {
        current = next
        setTuning(next)
        return saves
      }}
      onClose={onClose}
    />
  )
}

const status = () => screen.getByTestId('kart-tuning-status')
const jsonBox = () => screen.getByRole('textbox', { name: /The numbers as JSON/ })

describe('the tuning panel', () => {
  it('starts on its title, on the standard preset, with a slider for every number', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: 'Tuning' })).toHaveFocus()
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('standard')
    expect(screen.getAllByRole('slider')).toHaveLength(Object.keys(KART_TUNING).length)
    const top = screen.getByRole('slider', { name: 'Top speed' })
    expect(top).toHaveValue('50')
    expect(top).toHaveAttribute('aria-valuetext', '50.0 m/s')
    expect(screen.getByRole('slider', { name: 'Drift angle cap' })).toHaveValue('42')
    expect(screen.getByTestId('kart-slips')).toHaveTextContent(
      'A drift settles at 33° steering into it, 23° centred and 13° steering out.',
    )
  })

  it('changes a number at once, and the preset becomes Custom', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('slider', { name: 'Grip' }), { target: { value: '14.5' } })
    expect(current.grip).toBe(14.5)
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('custom')
    fireEvent.change(screen.getByRole('slider', { name: 'Drift angle cap' }), {
      target: { value: '45' },
    })
    expect(current.driftMaxSlip).toBeCloseTo((45 * Math.PI) / 180, 12)
  })

  it('switches presets, and the drift angles follow', () => {
    render(<Harness />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset' }), {
      target: { value: 'loose' },
    })
    expect(current).toBe(PRESETS.loose)
    expect(status()).toHaveTextContent('Preset: Loose.')
    expect(screen.getByTestId('kart-slips')).toHaveTextContent('45° steering into it')
    fireEvent.click(screen.getByRole('button', { name: 'Back to Standard' }))
    expect(current).toBe(PRESETS.standard)
  })

  it('exports the numbers as JSON into the box', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(jsonBox()).toHaveValue(serializeTuning(KART_TUNING))
    expect(await screen.findByText('Exported to the box and copied.')).toBeInTheDocument()
  })

  it('imports good JSON and refuses bad JSON without changing anything', () => {
    render(<Harness />)
    fireEvent.change(jsonBox(), { target: { value: '{not json' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(status()).toHaveTextContent("That isn't JSON, or it's far too long. Nothing changed.")
    expect(current).toBe(KART_TUNING)

    fireEvent.change(jsonBox(), { target: { value: '{"topSpeed": 500}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(status()).toHaveTextContent('Top speed has to be a number from 15 to 70.')
    expect(current).toBe(KART_TUNING)

    fireEvent.change(jsonBox(), { target: { value: '[1, 2]' } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(status()).toHaveTextContent("That JSON isn't kart tuning.")

    fireEvent.change(jsonBox(), { target: { value: serializeTuning(PRESETS.planted) } })
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    expect(status()).toHaveTextContent('Imported.')
    expect(current).toEqual(PRESETS.planted)
    expect(screen.getByRole('combobox', { name: 'Preset' })).toHaveValue('planted')
  })

  it('says when the browser will not keep a change', () => {
    render(<Harness saves={false} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Preset' }), {
      target: { value: 'planted' },
    })
    expect(status()).toHaveTextContent("won't keep the change")
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    fireEvent.keyDown(window, { code: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('storing the tuning', () => {
  it('keeps it in localStorage and reads it back', () => {
    expect(loadTuning()).toEqual({ tuning: KART_TUNING, preset: 'standard' })
    expect(saveTuning(PRESETS.loose)).toBe(true)
    expect(loadTuning()).toEqual({ tuning: PRESETS.loose, preset: 'loose' })
  })

  it('falls back to the standard preset when what is stored is broken', () => {
    localStorage.setItem('tku-arcade.kart.tuning', '{"grip": "lots"}')
    expect(loadTuning()).toEqual({ tuning: KART_TUNING, preset: 'standard' })
  })

  it('survives a browser that blocks storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(loadTuning().preset).toBe('standard')
    expect(saveTuning(PRESETS.loose)).toBe(false)
  })
})

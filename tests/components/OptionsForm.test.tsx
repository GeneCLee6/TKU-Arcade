import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  OptionsSchema,
  OptionValues,
} from '../../shared/games/types.ts'
import { OptionsForm } from '../../src/components/OptionsForm.tsx'
import { setLanguage } from '../../src/i18n/t.ts'
import { promotionInfo } from '../../shared/games/promotion/info.ts'

// Keys no catalog has come back as themselves, which proves they went through t(); the real strings
// are checked below against a real game
const SCHEMA: OptionsSchema<OptionValues> = {
  fast: { kind: 'boolean', labelKey: 'games.x.fast', default: false },
  rounds: { kind: 'int', labelKey: 'games.x.rounds', min: 10, max: 200, default: 50 },
  dice: {
    kind: 'select',
    labelKey: 'games.x.dice',
    choices: [
      { value: 'small', labelKey: 'games.x.dice.small' },
      { value: 'big', labelKey: 'games.x.dice.big' },
    ],
    default: 'small',
  },
  seats: {
    kind: 'select',
    labelKey: 'games.x.seats',
    choices: [
      { value: 2, labelKey: 'games.x.seats.two' },
      { value: 4, labelKey: 'games.x.seats.four' },
    ],
    default: 2,
  },
}

const VALUES: OptionValues = { fast: false, rounds: 50, dice: 'small', seats: 2 }

function setup(values: OptionValues = VALUES, editable = true) {
  const onChange = vi.fn()
  const form = (next: OptionValues) => (
    <OptionsForm schema={SCHEMA} values={next} editable={editable} onChange={onChange} />
  )
  const view = render(form(values))
  return { onChange, showValues: (next: OptionValues) => view.rerender(form(next)) }
}

const rounds = () => screen.getByLabelText('games.x.rounds') as HTMLInputElement
const typeRounds = (text: string) => fireEvent.change(rounds(), { target: { value: text } })

beforeEach(() => {
  setLanguage('en')
})

describe('a game without options', () => {
  it('renders nothing, for the host or anyone else', () => {
    for (const editable of [true, false]) {
      const { container, unmount } = render(
        <OptionsForm schema={{}} values={{}} editable={editable} onChange={vi.fn()} />,
      )
      expect(container).toBeEmptyDOMElement()
      unmount()
    }
  })
})

describe('the host', () => {
  it('turns a boolean on, sending every value', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'games.x.fast' }))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...VALUES, fast: true })
  })

  it('picks a choice, sending every value', () => {
    const { onChange } = setup()
    const select = screen.getByRole('combobox', { name: 'games.x.dice' })
    expect(screen.getByRole('option', { name: 'games.x.dice.big' })).toBeInTheDocument()
    fireEvent.change(select, { target: { value: 'big' } })
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...VALUES, dice: 'big' })
  })

  it('keeps a numeric choice a number', () => {
    const { onChange } = setup()
    fireEvent.change(screen.getByRole('combobox', { name: 'games.x.seats' }), {
      target: { value: '4' },
    })
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...VALUES, seats: 4 })
  })

  it('fills in what the room does not have, so the values sent are complete', () => {
    const { onChange } = setup({ fast: true })
    fireEvent.change(screen.getByRole('combobox', { name: 'games.x.dice' }), {
      target: { value: 'big' },
    })
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      fast: true,
      rounds: 50,
      dice: 'big',
      seats: 2,
    })
  })

  it('says the range of a number', () => {
    setup()
    expect(rounds()).toHaveAccessibleDescription('10 to 200')
    expect(rounds()).toHaveAttribute('min', '10')
    expect(rounds()).toHaveAttribute('max', '200')
  })

  describe('typing a number', () => {
    it('sends nothing until done, then the number, on leaving the field', () => {
      const { onChange } = setup()
      typeRounds('1')
      typeRounds('12')
      typeRounds('120')
      expect(rounds().value).toBe('120')
      expect(onChange).not.toHaveBeenCalled()

      fireEvent.blur(rounds())
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...VALUES, rounds: 120 })
    })

    it('sends it on Enter too, once', () => {
      const { onChange } = setup()
      typeRounds('120')
      fireEvent.keyDown(rounds(), { key: 'Enter' })
      fireEvent.blur(rounds())
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...VALUES, rounds: 120 })
    })

    it.each([
      ['below the range', '3', 10],
      ['above the range', '9999', 200],
      ['far above the range', '1e6', 200],
    ])('clamps a number %s', (_, text, sent) => {
      const { onChange } = setup()
      typeRounds(text)
      fireEvent.blur(rounds())
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...VALUES, rounds: sent })
    })

    it.each([
      ['nothing', ''],
      ['a fraction', '12.5'],
      ['something too big to be a number', '1e999'],
    ])('ignores %s, going back to the room’s value', (_, text) => {
      const { onChange } = setup()
      typeRounds(text)
      fireEvent.blur(rounds())
      expect(onChange).not.toHaveBeenCalled()
      expect(rounds().value).toBe('50')
    })

    it('sends nothing when it ends where it began', () => {
      const { onChange } = setup()
      typeRounds('60')
      typeRounds('50')
      fireEvent.blur(rounds())
      expect(onChange).not.toHaveBeenCalled()
    })

    it('sends nothing when clamping lands on what the room already has', () => {
      const { onChange } = setup({ ...VALUES, rounds: 200 })
      typeRounds('999')
      fireEvent.blur(rounds())
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('shows the room’s value, not its own', () => {
    it('a sent number shows the old value until the server says so', () => {
      const { showValues } = setup()
      typeRounds('120')
      fireEvent.blur(rounds())
      expect(rounds().value).toBe('50')

      showValues({ ...VALUES, rounds: 120 })
      expect(rounds().value).toBe('120')
    })

    it('a change from the server replaces what was being typed, and that is not sent', () => {
      const { onChange, showValues } = setup()
      typeRounds('120')

      showValues({ ...VALUES, rounds: 70 })
      expect(rounds().value).toBe('70')

      fireEvent.blur(rounds())
      expect(onChange).not.toHaveBeenCalled()
      expect(rounds().value).toBe('70')
    })

    it('a checkbox and a select do not move until the server says so', () => {
      const { showValues } = setup()
      const check = screen.getByRole('checkbox', { name: 'games.x.fast' })
      const select = screen.getByRole('combobox', { name: 'games.x.dice' })
      fireEvent.click(check)
      fireEvent.change(select, { target: { value: 'big' } })
      expect(check).not.toBeChecked()
      expect(select).toHaveValue('small')

      showValues({ ...VALUES, fast: true, dice: 'big' })
      expect(check).toBeChecked()
      expect(select).toHaveValue('big')
    })
  })
})

describe('everyone else', () => {
  it('reads the same fields, with no controls', () => {
    setup({ fast: true, rounds: 70, dice: 'big', seats: 4 }, false)
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()

    const valueOf = (label: string) => screen.getByText(label).nextElementSibling
    expect(valueOf('games.x.fast')).toHaveTextContent('On')
    expect(valueOf('games.x.rounds')).toHaveTextContent('70')
    expect(valueOf('games.x.dice')).toHaveTextContent('games.x.dice.big')
    expect(valueOf('games.x.seats')).toHaveTextContent('games.x.seats.four')
  })

  it('reads a boolean that is off', () => {
    setup(VALUES, false)
    expect(screen.getByText('games.x.fast').nextElementSibling).toHaveTextContent('Off')
  })

  it('follows the room', () => {
    const { showValues } = setup(VALUES, false)
    showValues({ ...VALUES, rounds: 90 })
    expect(screen.getByText('games.x.rounds').nextElementSibling).toHaveTextContent('90')
  })
})

describe('a real game', () => {
  // What the browser has: the info's schema, without the module's hidden fields (promotion's `edition`)
  it('shows its translated strings', () => {
    const props = { schema: promotionInfo.options, values: {}, onChange: vi.fn() }
    render(<OptionsForm {...props} editable />)
    expect(screen.getByRole('combobox', { name: /dice/i })).toBeInTheDocument()
    expect(screen.queryByText(/games\.promotion/)).toBeNull()
  })
})

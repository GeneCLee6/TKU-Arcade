import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SpectrumAnswererView, SpectrumReveal } from '../../../shared/games/spectrum/types.ts'
import { NumberLine, STAGGER_MS } from '../../../src/games/spectrum/NumberLine.tsx'
import {
  lanes,
  LANE_GAP,
  lineOrder,
  position,
  revealMarks,
  type NumberLineMark,
} from '../../../src/games/spectrum/numberLine.ts'
import { moveSeat } from '../../../src/games/spectrum/order.ts'
import { OrderList } from '../../../src/games/spectrum/OrderList.tsx'
import { setLanguage } from '../../../src/i18n/t.ts'

const NAMES = ['Mei', 'Gene', 'Ann', 'Bo', 'Cy']
const nameOf = (seat: number) => NAMES[seat]

const mark = (
  seat: number,
  number: number,
  extra: Partial<NumberLineMark> = {},
): NumberLineMark => ({
  seat,
  name: nameOf(seat),
  text: `answer ${'abcde'[seat]}`,
  number,
  pick: null,
  correct: null,
  close: false,
  ...extra,
})

const answerer = (
  seat: number,
  number: number,
  text: string | null = `answer ${'abcde'[seat]}`,
): SpectrumAnswererView => ({
  seat,
  status: text === null ? 'out' : 'answered',
  text,
  number,
})

afterEach(() => setLanguage('en'))

describe('the sums', () => {
  it('puts 1 at the start of the line and 10 at the end, evenly between', () => {
    expect(position(1)).toBe(0)
    expect(position(10)).toBe(1)
    expect(position(4)).toBeCloseTo(1 / 3)
    expect(position(0)).toBe(0)
    expect(position(12)).toBe(1)
  })

  it('orders lowest first, equal numbers by seat', () => {
    const ordered = lineOrder([mark(3, 9), mark(1, 2), mark(4, 2), mark(2, 5)])
    expect(ordered.map((m) => m.seat)).toEqual([1, 4, 2, 3])
  })

  it('stacks marks that are too close into lanes, and only those', () => {
    expect(LANE_GAP).toBe(3)
    // 1, 4, 7, 10 are three apart each: one lane holds them all
    expect(lanes(lineOrder([mark(0, 1), mark(1, 4), mark(2, 7), mark(3, 10)]))).toEqual([
      0, 0, 0, 0,
    ])
    // 2, 3, 5: 3 is too close to 2, and 5 to 3 but not to 2
    expect(lanes(lineOrder([mark(0, 2), mark(1, 3), mark(2, 5)]))).toEqual([0, 1, 0])
    // Ten of the same number, all different lanes
    const same = Array.from({ length: 10 }, (_, seat) => mark(seat, 6))
    expect(lanes(lineOrder(same))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('reads a revealed largest-and-smallest guess into marks', () => {
    const reveal: SpectrumReveal = {
      guess: { kind: 'extremes', max: 1, min: 2 },
      missed: null,
      correct: [2],
      points: [1, 0, 1, 0],
    }
    const marks = revealMarks([answerer(1, 7), answerer(2, 2), answerer(3, 9)], reveal, nameOf)
    expect(marks.map(({ seat, pick, correct }) => [seat, pick, correct])).toEqual([
      [1, 'max', false],
      [2, 'min', true],
      [3, null, null],
    ])
    expect(marks[0]).toMatchObject({ name: 'Gene', text: 'answer b', number: 7 })
  })

  it('reads a full order into places, and an answerer who sat out with no answer', () => {
    const reveal: SpectrumReveal = {
      guess: { kind: 'order', seats: [2, 1] },
      missed: null,
      correct: [2, 1],
      points: [2, 1, 1, 0],
    }
    const marks = revealMarks(
      [answerer(1, 7), answerer(2, 2), answerer(3, 9, null)],
      reveal,
      nameOf,
    )
    expect(marks.map(({ seat, pick, correct, text }) => [seat, pick, correct, text])).toEqual([
      [1, 2, true, 'answer b'],
      [2, 1, true, 'answer c'],
      [3, null, null, null],
    ])
  })

  it('leaves out an answerer whose number is not shown, and marks nothing with no guess', () => {
    const reveal: SpectrumReveal = { guess: null, missed: 'time', correct: [], points: [0, 0, 0] }
    const hidden = { ...answerer(1, 7), number: null }
    const marks = revealMarks([hidden, answerer(2, 4)], reveal, nameOf)
    expect(marks).toHaveLength(1)
    expect(marks[0]).toMatchObject({ seat: 2, pick: null, correct: null })
  })

  it('moves one seat in an order, and nothing when out of range', () => {
    expect(moveSeat([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4])
    expect(moveSeat([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3])
    expect(moveSeat([1, 2, 3], 0, -1)).toEqual([1, 2, 3])
    expect(moveSeat([1, 2, 3], 2, 3)).toEqual([1, 2, 3])
    expect(moveSeat([1, 2, 3], 1, 1)).toEqual([1, 2, 3])
  })
})

describe('NumberLine', () => {
  const marks = [
    mark(1, 7, { pick: 'max', correct: false }),
    mark(2, 2, { pick: 'min', correct: true }),
    mark(3, 9),
    mark(4, 8),
  ]

  it('names the two ends and draws ticks 1 to 10', () => {
    render(<NumberLine low="least wanted" high="most wanted" marks={marks} />)
    expect(screen.getByText('1 = least wanted')).toBeInTheDocument()
    expect(screen.getByText('10 = most wanted')).toBeInTheDocument()
    const track = screen.getByTestId('number-line-track')
    for (const tick of ['1', '5', '10'])
      expect(within(track).getAllByText(tick).length).toBeGreaterThan(0)
  })

  it('puts each answer at its number, lowest rising first', () => {
    render(<NumberLine low="low" high="high" marks={marks} />)
    const two = screen.getByTestId('mark-2')
    const nine = screen.getByTestId('mark-3')
    expect(two.style.left).toBe('11.11111111111111%')
    expect(nine.style.left).toBe(`${(8 / 9) * 100}%`)
    expect(two.style.animationDelay).toBe('0ms')
    expect(screen.getByTestId('mark-1').style.animationDelay).toBe(`${STAGGER_MS}ms`)
    expect(within(two).getByText('answer c')).toBeInTheDocument()
    expect(within(two).getByText('Ann')).toBeInTheDocument()
    expect(within(two).getByText('2')).toBeInTheDocument()
  })

  it('stacks the close ones: 7, 8 and 9 cannot share a lane', () => {
    render(<NumberLine low="low" high="high" marks={marks} />)
    const lane = (seat: number) => screen.getByTestId(`mark-${seat}`).dataset.lane
    expect([lane(2), lane(1), lane(4), lane(3)]).toEqual(['0', '0', '1', '2'])
  })

  it('says what the guesser picked and whether it was right, in words, not only colour', () => {
    render(<NumberLine low="low" high="high" marks={marks} />)
    expect(within(screen.getByTestId('mark-1')).getByText(/✕\s*Largest/)).toBeInTheDocument()
    expect(within(screen.getByTestId('mark-2')).getByText(/✓\s*Smallest/)).toBeInTheDocument()
    expect(within(screen.getByTestId('mark-3')).queryByText(/Largest|Smallest/)).toBeNull()
  })

  it('reads out the whole line in order to a screen reader, the drawing hidden from it', () => {
    render(<NumberLine low="low" high="high" marks={marks} />)
    expect(screen.getByTestId('number-line-track')).toHaveAttribute('aria-hidden', 'true')
    const items = within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items).toEqual([
      '2: Ann said “answer c” (guessed: Smallest) Guessed right',
      '7: Gene said “answer b” (guessed: Largest) Guessed wrong',
      '8: Cy said “answer e”',
      '9: Bo said “answer d”',
    ])
  })

  it('shows an answerer who sat out with no answer, and places in a full order', () => {
    render(
      <NumberLine
        low="low"
        high="high"
        marks={[mark(1, 3, { pick: 1, correct: true }), mark(2, 6, { text: null })]}
      />,
    )
    expect(within(screen.getByTestId('mark-1')).getByText(/✓\s*Placed 1/)).toBeInTheDocument()
    expect(within(screen.getByTestId('mark-2')).getByText('—')).toBeInTheDocument()
    expect(screen.getByText('6: Ann, no answer')).toBeInTheDocument()
  })

  it('does not animate a view that is already old', () => {
    render(<NumberLine low="low" high="high" marks={marks} animate={false} />)
    expect(screen.getByTestId('mark-1').style.animationDelay).toBe('')
  })

  it('speaks Chinese too', () => {
    setLanguage('zh-TW')
    render(<NumberLine low="最不想吃" high="最想吃" marks={marks} />)
    expect(screen.getByText('1 ＝最不想吃')).toBeInTheDocument()
    expect(within(screen.getByTestId('mark-1')).getByText(/✕\s*最大/)).toBeInTheDocument()
  })
})

describe('OrderList', () => {
  const items = [
    { seat: 1, name: 'Gene', text: '牛肉麵' },
    { seat: 2, name: 'Ann', text: '水煮青菜' },
    { seat: 3, name: 'Bo', text: '鹽酥雞' },
  ]

  it('lists the answers in the order given, with the two ends', () => {
    render(
      <OrderList low="least" high="most" items={items} order={[3, 1, 2]} onChange={() => {}} />,
    )
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows.map((row) => within(row).getByText(/牛肉麵|水煮青菜|鹽酥雞/).textContent)).toEqual([
      '鹽酥雞',
      '牛肉麵',
      '水煮青菜',
    ])
    expect(screen.getByText('1 = least')).toBeInTheDocument()
    expect(screen.getByText('10 = most')).toBeInTheDocument()
  })

  it('moves a row with its buttons, which stop at the ends', () => {
    const onChange = vi.fn()
    render(<OrderList low="l" high="h" items={items} order={[1, 2, 3]} onChange={onChange} />)
    expect(screen.getByRole('button', { name: 'Gene: move towards 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Bo: move towards 10' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Ann: move towards 1' }))
    expect(onChange).toHaveBeenLastCalledWith([2, 1, 3])
    fireEvent.click(screen.getByRole('button', { name: 'Ann: move towards 10' }))
    expect(onChange).toHaveBeenLastCalledWith([1, 3, 2])
  })

  it('moves a row dragged onto another', () => {
    const onChange = vi.fn()
    render(<OrderList low="l" high="h" items={items} order={[1, 2, 3]} onChange={onChange} />)
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    fireEvent.dragStart(rows[0], { dataTransfer: { effectAllowed: '' } })
    fireEvent.dragOver(rows[2])
    fireEvent.drop(rows[2])
    expect(onChange).toHaveBeenCalledWith([2, 3, 1])
  })

  it('does nothing once disabled', () => {
    render(
      <OrderList low="l" high="h" items={items} order={[1, 2, 3]} onChange={() => {}} disabled />,
    )
    expect(
      screen.getAllByRole('button').every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true)
    expect(within(screen.getByRole('list')).getAllByRole('listitem')[0]).toHaveAttribute(
      'draggable',
      'false',
    )
  })
})

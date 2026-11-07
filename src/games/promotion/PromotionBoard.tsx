import { memo, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import styled, { keyframes } from 'styled-components'
import { BOARD, END_CELL, getCell } from '../../../shared/games/promotion/board.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { color, seatColor } from '../../styles/tokens.ts'
import {
  arcControl,
  arcPoints,
  cellNameLines,
  centre,
  piecePoints,
  type BoardLayout,
  type CellBox,
  type Point,
} from './boardLayout.ts'
import { cellForKey } from './boardKeys.ts'
import { MOVE_MS } from './useRollPlayback.ts'

export interface BoardPiece {
  seat: number
  cell: string
  /** A person's initial, or their seat's number if nobody sits there now */
  mark: string
}

export interface PieceFlight {
  seat: number
  from: string
  to: string
  demoted: boolean
}

export interface PromotionBoardProps {
  layout: BoardLayout
  pieces: readonly BoardPiece[]
  /** The seat to mark as about to move, or moving */
  activeSeat: number | null
  selected: string | null
  onSelect(cell: string): void
  /** The piece in the air: `pieces` already has it where it lands */
  flight: PieceFlight | null
  reducedMotion: boolean
  /** How wide the board is, as a share of its viewport */
  zoom: number
}

/** The board: an original drawing of the cells, with the pieces over them. It only shows `view` */
export function PromotionBoard({
  layout,
  pieces,
  activeSeat,
  selected,
  onSelect,
  flight,
  reducedMotion,
  zoom,
}: PromotionBoardProps) {
  const t = useT()
  const points = piecePoints(pieces, layout)
  const flown = flight && !reducedMotion ? flightPath(flight, pieces, layout) : null
  const hintId = useId()

  return (
    <>
      <VisuallyHidden id={hintId}>{t('board.keyboardHint')}</VisuallyHidden>
      <Svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ width: `${zoom * 100}%` }}
        role="group"
        aria-label={t('games.promotion.ui.boardLabel', { count: BOARD.length })}
        aria-describedby={hintId}
      >
        <Cells layout={layout} selected={selected} onSelect={onSelect} />
        {flown && flight && (
          <FlightLine
            d={flown.d}
            pathLength={1}
            $demoted={flight.demoted}
            style={{ stroke: flight.demoted ? undefined : seatColor(flight.seat) }}
          />
        )}
        {pieces.map((piece) => (
          <Piece
            key={piece.seat}
            piece={piece}
            point={points.get(piece.seat)}
            active={piece.seat === activeSeat}
            trail={flown && flight?.seat === piece.seat ? flown.trail : null}
            reducedMotion={reducedMotion}
          />
        ))}
      </Svg>
    </>
  )
}

function flightPath(
  flight: PieceFlight,
  pieces: readonly BoardPiece[],
  layout: BoardLayout,
): { d: string; trail: Point[] } | null {
  // Where the piece stood before it left: its share of the cell, with it still there
  const before = pieces.map((piece) =>
    piece.seat === flight.seat ? { seat: piece.seat, cell: flight.from } : piece,
  )
  const from = piecePoints(before, layout).get(flight.seat)
  const to = piecePoints(pieces, layout).get(flight.seat)
  if (!from || !to) return null
  const control = arcControl(from, to)
  return {
    d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`,
    trail: arcPoints(from, to, 16),
  }
}

// Apart from the pieces: 79 cells need no new layout each time a piece moves
const Cells = memo(function Cells({
  layout,
  selected,
  onSelect,
}: Pick<PromotionBoardProps, 'layout' | 'selected' | 'onSelect'>) {
  const t = useT()
  const group = useRef<SVGGElement>(null)
  // One Tab stop for the 79 cells: the cell in focus, or else the one being shown, so that coming
  // back to the board lands on what the game is about right now
  const [focused, setFocused] = useState<string | null>(null)
  const tabStop = focused ?? selected ?? layout.cells[0].id

  const onKeyDown = (event: KeyboardEvent, id: string) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!event.repeat) onSelect(id)
      return
    }
    const next = cellForKey(layout, id, event.key)
    if (next === null) return
    event.preventDefault()
    group.current?.querySelector<SVGGElement>(`[data-cell="${next}"]`)?.focus()
  }

  return (
    <g ref={group}>
      {layout.cells.map((box) => {
        const full = t(`games.promotion.cell.${box.id}`)
        const end = box.id === END_CELL
        return (
          <CellGroup
            key={box.id}
            role="button"
            aria-pressed={box.id === selected}
            tabIndex={box.id === tabStop ? 0 : -1}
            onClick={() => onSelect(box.id)}
            onKeyDown={(event) => onKeyDown(event, box.id)}
            onFocus={() => setFocused(box.id)}
            onBlur={() => setFocused(null)}
            data-cell={box.id}
          >
            <title>{full}</title>
            <CellRect
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              rx={8}
              $tier={tierOf(box.id)}
              $selected={box.id === selected}
            />
            <CellName box={box} full={full} end={end} shape={layout.shape} />
          </CellGroup>
        )
      })}
    </g>
  )
})

/** Which colour band of the ladder a cell is in; rank thresholds as in the result notes (rules.ts) */
function tierOf(id: string): Tier {
  if (id === END_CELL) return 'end'
  const { rank } = getCell(id)
  if (rank >= 19) return 3
  if (rank >= 11) return 2
  if (rank >= 5) return 1
  return 0
}

type Tier = 0 | 1 | 2 | 3 | 'end'

const LINE_GAP = { cjk: 25, latin: 19 }
const END_SIZE = 40

function CellName({
  box,
  full,
  end,
  shape,
}: {
  box: CellBox
  full: string
  end: boolean
  shape: BoardLayout['shape']
}) {
  const { lines, latin } = cellNameLines(full)
  const middle = centre(box)
  const lineGap = end ? 44 : latin ? LINE_GAP.latin : LINE_GAP.cjk
  // Above the middle: the pieces stand along the bottom
  const top = middle.y - (end ? 0 : 11) - ((lines.length - 1) * lineGap) / 2
  const room = box.width - 8
  // A Latin letter is about half its size wide. The end cell is sized to fit, however narrow; other
  // cells keep one size and only what would overflow gets squeezed
  const longest = Math.max(...lines.map((line) => line.length))
  const size = end
    ? Math.min(END_SIZE, room / (longest * (latin ? 0.6 : 1)))
    : latin
      ? shape === 'portrait'
        ? 20
        : 18
      : 23
  return (
    <>
      {lines.map((line, at) => {
        const wide = !end && line.length * size * (latin ? 0.56 : 1) > room
        return (
          <NameText
            key={at}
            x={middle.x}
            y={top + at * lineGap}
            style={{ fontSize: size }}
            $end={end}
            textLength={wide ? room : undefined}
            lengthAdjust={wide ? 'spacingAndGlyphs' : undefined}
          >
            {line}
          </NameText>
        )
      })}
    </>
  )
}

const PIECE_RADIUS = 17

function Piece({
  piece,
  point,
  active,
  trail,
  reducedMotion,
}: {
  piece: BoardPiece
  point: Point | undefined
  active: boolean
  trail: Point[] | null
  reducedMotion: boolean
}) {
  const ref = useRef<SVGGElement>(null)
  // The keyframes as text: a re-render in mid-air (someone's chat, someone leaving) is the same
  // flight and must not start it over
  const frames = trail?.map(({ x, y }) => `translate(${x}px, ${y}px)`).join('|') ?? null

  useLayoutEffect(() => {
    if (!frames || !ref.current?.animate) return undefined
    const animation = ref.current.animate(
      frames.split('|').map((transform) => ({ transform })),
      { duration: MOVE_MS, easing: 'ease-in-out' },
    )
    return () => animation.cancel()
  }, [frames])

  if (!point) return null
  return (
    <PieceGroup
      ref={ref}
      $glide={!reducedMotion && !trail}
      style={{ transform: `translate(${point.x}px, ${point.y}px)` }}
      aria-hidden="true"
      data-seat={piece.seat}
    >
      {active && <TurnRing r={PIECE_RADIUS + 6} $still={reducedMotion} />}
      <PieceDisc r={PIECE_RADIUS} style={{ fill: seatColor(piece.seat) }} />
      <PieceMark>{piece.mark}</PieceMark>
    </PieceGroup>
  )
}

const TIER_FILL: Record<Tier, string> = {
  0: color.boardTier0,
  1: color.boardTier1,
  2: color.boardTier2,
  3: color.boardTier3,
  end: color.boardEnd,
}

const Svg = styled.svg`
  display: block;
  max-width: none;
  height: auto;
  user-select: none;
`

const CellRect = styled.rect<{ $tier: Tier; $selected: boolean }>`
  fill: ${(p) => TIER_FILL[p.$tier]};
  stroke: ${(p) => (p.$selected ? color.text : color.border)};
  stroke-width: ${(p) => (p.$selected ? 4 : 1)};
  cursor: pointer;
`

// Thicker than `selected`'s outline, so that the two read apart when they are different cells. The
// browser's outline around an SVG group is not reliable, and the gap between cells has room for this
const CellGroup = styled.g`
  &&:focus-visible {
    outline: none;
  }

  &:focus-visible > rect {
    stroke: ${color.accent};
    stroke-width: 8;
  }
`

const NameText = styled.text<{ $end: boolean }>`
  fill: ${(p) => (p.$end ? color.onBoardEnd : color.text)};
  font-weight: ${(p) => (p.$end ? 700 : 500)};
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
`

const draw = keyframes`
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
`

const FlightLine = styled.path<{ $demoted: boolean }>`
  fill: none;
  stroke: ${(p) => (p.$demoted ? color.danger : color.text)};
  stroke-width: 5;
  stroke-linecap: round;
  stroke-dasharray: 1;
  opacity: 0.7;
  pointer-events: none;
  animation: ${draw} ${MOVE_MS}ms ease-in-out both;
`

const PieceGroup = styled.g<{ $glide: boolean }>`
  pointer-events: none;
  transition: ${(p) => (p.$glide ? 'transform 220ms ease-out' : 'none')};
`

const PieceDisc = styled.circle`
  stroke: ${color.onSeat};
  stroke-width: 3;
`

const PieceMark = styled.text`
  fill: ${color.onSeat};
  font-size: 19px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: central;
`

const pulse = keyframes`
  50% {
    transform: scale(1.22);
    opacity: 0.45;
  }
`

// Whose turn it is must not rest on the colour alone: there is a ring, and the words in the dock
const TurnRing = styled.circle<{ $still: boolean }>`
  fill: none;
  stroke: ${color.text};
  stroke-width: 4;
  animation: ${(p) => (p.$still ? 'none' : pulse)} 1200ms ease-in-out infinite;
`

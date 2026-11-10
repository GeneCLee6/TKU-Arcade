import { memo, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import styled, { keyframes } from 'styled-components'
import {
  BOARD,
  END_CELL,
  FACES,
  START_CELL,
  getCell,
  type Face,
} from '../../../shared/games/promotion/board.ts'
import { knobOf } from '../../../shared/games/promotion/departments.ts'
import { promotionScreenMessages } from '../../../shared/games/promotion/i18n.screen.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { registerMessages, type Translate } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { color, font, promotionBoard as paint, seatColor } from '../../styles/tokens.ts'
import {
  arcControl,
  arcPoints,
  cellNameLines,
  centre,
  piecePoints,
  PLAQUE_HEIGHT,
  type BlockBox,
  type BoardLayout,
  type CellBox,
  type Point,
} from './boardLayout.ts'
import { cellForKey } from './boardKeys.ts'
import { MOVE_MS } from './useRollPlayback.ts'

// The board's own strings: plaques, seals, hat buttons. They load with the game's screen
registerMessages(promotionScreenMessages)

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
  /** The cell being explained: it is outlined, and where each result leads from it is marked */
  selected: string | null
  onSelect(cell: string): void
  /** The piece in the air: `pieces` already has it where it lands */
  flight: PieceFlight | null
  reducedMotion: boolean
  /** How wide the board is, as a share of its viewport */
  zoom: number
}

/** `url(#…)` of the board's gradients: lacquer, rice paper, gold and the shine on round things */
type Paints = Record<'l' | 'p' | 'g' | 's', string>

/**
 * The board (e3-t04, e3-t08): an original drawing of a lacquered sheet, the offices in departments,
 * with the pieces over them. It only shows `view`.
 */
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
  // Unique to this board, so that two boards on one page never share gradients
  const prefix = `pb${useId().replace(/\W/g, '')}`
  const ids = { l: `${prefix}l`, p: `${prefix}p`, g: `${prefix}g`, s: `${prefix}s` }
  const paints = Object.fromEntries(
    Object.entries(ids).map(([key, id]) => [key, `url(#${id})`]),
  ) as Paints
  const here = pieces.find((piece) => piece.seat === activeSeat)?.cell ?? null

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
        <Gradients ids={ids} />
        <Frame layout={layout} lacquer={paints.l} />
        <Cells
          layout={layout}
          selected={selected}
          here={here}
          hereSeat={activeSeat}
          onSelect={onSelect}
          paints={paints}
        />
        {flown && flight && (
          <FlightLine
            d={flown.d}
            pathLength={1}
            stroke={flight.demoted ? paint.face.zang : seatColor(flight.seat)}
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
            sheen={paints.s}
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

/** A radial gradient: [offset, colour, opacity] stops from its centre out */
const radial = (id: string, cx: string, cy: string, stops: [number, string, number?][]) => (
  <radialGradient id={id} cx={cx} cy={cy} r="110%">
    {stops.map(([offset, stop, opacity = 1]) => (
      <stop key={offset} offset={offset} stopColor={stop} stopOpacity={opacity} />
    ))}
  </radialGradient>
)

const Gradients = memo(function Gradients({ ids }: { ids: Paints }) {
  return (
    <defs>
      {radial(ids.l, '50%', '0%', [
        [0, paint.lacquerHi],
        [0.55, paint.lacquer],
        [1, paint.lacquerDeep],
      ])}
      {radial(ids.p, '30%', '20%', [
        [0, paint.paperHi],
        [0.6, paint.paper],
        [1, paint.paperShade],
      ])}
      {radial(ids.g, '50%', '25%', [
        [0, paint.endHi],
        [0.52, paint.end],
        [1, paint.endDeep],
      ])}
      {radial(ids.s, '35%', '28%', [
        [0, paint.sheen, 0.9],
        [0.18, paint.sheen, 0.35],
        [0.5, paint.sheen, 0],
        [0.9, paint.shade, 0.45],
      ])}
    </defs>
  )
})

/** The lacquered sheet with its gold trim, and each department's panel and plaque */
const Frame = memo(function Frame({ layout, lacquer }: { layout: BoardLayout; lacquer: string }) {
  const t = useT()
  const { width, height } = layout
  return (
    <g aria-hidden="true">
      <rect width={width} height={height} rx={10} fill={lacquer} stroke={paint.gold} strokeWidth={6} />
      <rect
        x={11}
        y={11}
        width={width - 22}
        height={height - 22}
        rx={4}
        fill="none"
        stroke={paint.goldDeep}
        strokeWidth={1.5}
      />
      {layout.blocks.map((block) => (
        <Department key={block.id} block={block} name={t(`games.promotion.dept.${block.id}`)} />
      ))}
    </g>
  )
})

function Department({ block, name }: { block: BlockBox; name: string }) {
  const latin = /[a-z]/i.test(name)
  const size = latin ? 15 : 19
  // Spaced out like carved characters; the space after the last one is taken back by moving over
  const spacing = latin ? 1.5 : size * 0.45
  const length = [...name].length
  const width = Math.min(block.width - 24, length * (spacing + (latin ? size * 0.58 : size)) + 40)
  const x = block.plaqueX - width / 2
  const y = block.plaqueY - PLAQUE_HEIGHT / 2
  return (
    <>
      <rect
        x={block.x}
        y={block.y}
        width={block.width}
        height={block.height}
        rx={4}
        fill={paint.block}
        fillOpacity={0.25}
        stroke={paint.gold}
        strokeOpacity={0.45}
      />
      <rect
        x={x}
        y={y}
        width={width}
        height={PLAQUE_HEIGHT}
        rx={2}
        fill={paint.plaque}
        stroke={paint.gold}
      />
      <rect
        x={x - 4}
        y={y - 4}
        width={width + 8}
        height={PLAQUE_HEIGHT + 8}
        rx={3}
        fill="none"
        stroke={paint.goldDeep}
        strokeWidth={1.5}
      />
      <Ink
        x={block.plaqueX + spacing / 2}
        y={block.plaqueY + 1}
        fill={paint.onPlaque}
        style={{ fontSize: size, letterSpacing: spacing }}
        textLength={width < 80 ? width - 16 : undefined}
        lengthAdjust="spacingAndGlyphs"
      >
        {name}
      </Ink>
    </>
  )
}

/** Which cells the selected one leads to, and on which results */
function destinations(selected: string | null): Map<string, Face[]> {
  const found = new Map<string, Face[]>()
  if (!selected || selected === END_CELL) return found
  const { moves } = getCell(selected)
  for (const face of FACES) found.set(moves[face], [...(found.get(moves[face]) ?? []), face])
  return found
}

// Apart from the pieces: 79 cells need no new drawing each time a piece moves
const Cells = memo(function Cells({
  layout,
  selected,
  here,
  hereSeat,
  onSelect,
  paints,
}: {
  layout: BoardLayout
  selected: string | null
  here: string | null
  hereSeat: number | null
  onSelect(cell: string): void
  paints: Paints
}) {
  const t = useT()
  const group = useRef<SVGGElement>(null)
  // One Tab stop for the 79 cells: the cell in focus, or else the one being shown, so that coming
  // back to the board lands on what the game is about right now
  const [focused, setFocused] = useState<string | null>(null)
  const tabStop = focused ?? selected ?? START_CELL
  const leadsTo = destinations(selected)

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
        // Selected wins over whose turn it is: the outline says one thing at a time
        const outline =
          box.id === selected
            ? paint.select
            : box.id === here && hereSeat !== null
              ? seatColor(hereSeat)
              : null
        const { x, y, width, height } = box
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
            {/* The focus ring sits on the lacquer around the cell, in a colour neither the
                selection nor any seat uses. The browser's outline round an SVG group is unreliable */}
            <rect
              data-ring=""
              x={x - 5}
              y={y - 5}
              width={width + 10}
              height={height + 13}
              rx={6}
              fill="none"
              strokeWidth={6}
            />
            {/* A raised tile: its edge below, then the paper (or the gold of the end) */}
            <rect x={x} y={y + 3} width={width} height={height} rx={3} fill={paint.drop} />
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={3}
              fill={end ? paints.g : paints.p}
              stroke={paint.edge}
            />
            {end ? <EndCell box={box} t={t} full={full} /> : <Tile box={box} full={full} t={t} sheen={paints.s} />}
            {outline && (
              <rect
                x={x + 1.5}
                y={y + 1.5}
                width={width - 3}
                height={height - 3}
                rx={3}
                fill="none"
                stroke={outline}
                strokeWidth={4}
              />
            )}
            <Badges box={box} faces={leadsTo.get(box.id)} t={t} />
          </CellGroup>
        )
      })}
    </g>
  )
})

/** An office's paper: its hat button, its rank's seal and its name */
function Tile({ box, full, t, sheen }: { box: CellBox; full: string; t: Translate; sheen: string }) {
  const { rank } = getCell(box.id)
  const knob = knobOf(rank)
  const { lines, latin } = cellNameLines(full)
  const size = latin ? 16 : 21
  const gap = latin ? 17 : 23
  // Clear of the seal on the right when the name is in Chinese; Latin seals are short and flat
  const middleX = box.x + (latin ? box.width / 2 : box.width / 2 - 7)
  const middleY = box.y + Math.min(box.height / 2 - 2, 42)
  const room = box.width - (latin ? 14 : 30)
  return (
    <>
      {knob && (
        <>
          <circle
            cx={box.x + 12}
            cy={box.y + 12}
            r={5.5}
            fill={paint.knob[knob]}
            stroke={paint.ink}
            strokeOpacity={0.45}
          />
          <circle cx={box.x + 12} cy={box.y + 12} r={5.5} fill={sheen} />
        </>
      )}
      <Seal box={box} text={t(`games.promotion.seal.${rank}`)} />
      {lines.map((line, at) => {
        const wide = line.length * size * (latin ? 0.56 : 1) > room
        return (
          <Ink
            key={at}
            x={middleX}
            y={middleY + (at - (lines.length - 1) / 2) * gap}
            fill={paint.ink}
            style={{ fontSize: size }}
            textLength={wide ? room : undefined}
            lengthAdjust={wide ? 'spacingAndGlyphs' : undefined}
          >
            {line}
          </Ink>
        )
      })}
    </>
  )
}

/**
 * The rank as a red seal in the corner, tilted a little as a stamp is: upright characters in
 * Chinese, a short flat tag in English
 */
function Seal({ box, text }: { box: CellBox; text: string }) {
  const latin = /[a-z]/i.test(text)
  const lines = latin ? [text] : [...text]
  const width = latin ? text.length * 5.6 + 8 : 14
  const height = latin ? 15 : lines.length * 11.5 + 6
  const x = box.x + box.width - width - 4
  const y = box.y + 5
  return (
    <g transform={latin ? undefined : `rotate(3 ${x + 7} ${y + height / 2})`}>
      <rect x={x} y={y} width={width} height={height} fill={paint.seal} stroke={paint.onSeal} strokeOpacity={0.35} strokeWidth={0.8} />
      {lines.map((line, at) => (
        <Ink key={at} x={x + width / 2} y={y + (latin ? 8 : 3 + (at + 0.5) * 11.5)} fill={paint.onSeal} style={{ fontSize: latin ? 9.5 : 10.5 }}>
          {line}
        </Ink>
      ))}
    </g>
  )
}

/** The end of the game: gold, a gateway, its name and the rule that ends the game */
function EndCell({ box, t, full }: { box: CellBox; t: Translate; full: string }) {
  const { lines, latin } = cellNameLines(full)
  const { x } = centre(box)
  const nameY = box.y + box.height * 0.47
  const top = box.y + 12
  return (
    <>
      <rect
        x={box.x + 5}
        y={box.y + 5}
        width={box.width - 10}
        height={box.height - 10}
        rx={2}
        fill="none"
        stroke={paint.onEnd}
        strokeOpacity={0.5}
        strokeWidth={1.5}
      />
      {/* A gateway: a roof, two beams' ends and four posts */}
      <path
        d={`M${x - 36} ${top + 8}L${x} ${top}L${x + 36} ${top + 8}M${x - 30} ${top + 14}h60M${x - 30} ${top + 8}v18m16-18v18m28-18v18m16-18v18`}
        fill="none"
        stroke={paint.onEnd}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
      <Ink
        x={x + (latin ? 0 : 7)}
        y={nameY}
        fill={paint.onEnd}
        style={{ fontSize: latin ? 34 : 44, letterSpacing: latin ? 2 : 14 }}
      >
        {lines.join(' ')}
      </Ink>
      <Ink x={x} y={nameY + 34} fill={paint.onEnd} style={{ fontSize: 15, letterSpacing: 2 }}>
        {t('games.promotion.end.motto')}
      </Ink>
    </>
  )
}

const BADGE = 20

/** Where the selected cell leads: a small coloured stamp of each result that goes here */
function Badges({ box, faces, t }: { box: CellBox; faces: Face[] | undefined; t: Translate }) {
  if (!faces) return null
  const end = box.id === END_CELL
  const left = end ? box.x + (box.width - faces.length * (BADGE + 3)) / 2 : box.x + 6
  const top = box.y + box.height - BADGE - (end ? 30 : 5)
  return (
    <g aria-hidden="true">
      {faces.map((face, at) => {
        const x = left + at * (BADGE + 3)
        return (
          <g key={face} data-badge={face}>
            <rect
              x={x}
              y={top}
              width={BADGE}
              height={BADGE}
              rx={2}
              fill={paint.face[face]}
              stroke={paint.ink}
              strokeOpacity={0.5}
            />
            <Ink x={x + BADGE / 2} y={top + BADGE / 2 + 0.5} fill={paint.onFace} style={{ fontSize: 14 }}>
              {t(`games.promotion.glyph.${face}`)}
            </Ink>
          </g>
        )
      })}
    </g>
  )
}

const PIECE_RADIUS = 14

function Piece({
  piece,
  point,
  active,
  trail,
  reducedMotion,
  sheen,
}: {
  piece: BoardPiece
  point: Point | undefined
  active: boolean
  trail: Point[] | null
  reducedMotion: boolean
  sheen: string
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
      {active && <TurnRing r={PIECE_RADIUS + 5} $still={reducedMotion} />}
      {/* A domed disc: its shadow on the paper, the seat's colour, then the light on top */}
      <ellipse cx={1.5} cy={8} rx={PIECE_RADIUS} ry={8.5} fill={paint.shade} opacity={0.4} />
      <circle r={PIECE_RADIUS} style={{ fill: seatColor(piece.seat) }} stroke={paint.ink} strokeWidth={1.5} />
      <circle r={PIECE_RADIUS} fill={sheen} />
      <Ink style={{ fill: color.onSeat, fontSize: 15, fontFamily: 'inherit' }}>
        {piece.mark}
      </Ink>
    </PieceGroup>
  )
}

const Svg = styled.svg`
  display: block;
  max-width: none;
  height: auto;
  user-select: none;
`

/** Every word on the board: centred on its point, in the brush face */
const Ink = styled.text`
  font-family: ${font.kai};
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
`

// The ring drawn round the cell (data-ring) is the focus style: the browser's own outline round an
// SVG group, which some draw even after a click, is not
const CellGroup = styled.g`
  cursor: pointer;

  &&:focus,
  &&:focus-visible {
    outline: none;
  }

  &:focus-visible > [data-ring] {
    stroke: ${paint.focus};
  }
`

const draw = keyframes`
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
`

const FlightLine = styled.path`
  fill: none;
  stroke-width: 5;
  stroke-linecap: round;
  stroke-dasharray: 1;
  opacity: 0.8;
  pointer-events: none;
  animation: ${draw} ${MOVE_MS}ms ease-in-out both;
`

const PieceGroup = styled.g<{ $glide: boolean }>`
  pointer-events: none;
  transition: ${(p) => (p.$glide ? 'transform 220ms ease-out' : 'none')};
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
  stroke: ${paint.ink};
  stroke-width: 3.5;
  animation: ${(p) => (p.$still ? 'none' : pulse)} 1200ms ease-in-out infinite;
`

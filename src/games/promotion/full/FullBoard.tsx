import {
  memo,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import styled, { keyframes } from 'styled-components'
import type { FullBoard as Board, FullCell } from '../../../../shared/games/promotion/boardFull.ts'
import { FULL_FACES, FULL_START, type FullFace } from '../../../../shared/games/promotion/fullFaces.ts'
import { VisuallyHidden } from '../../../components/VisuallyHidden.ts'
import type { Language, Translate } from '../../../i18n/t.ts'
import { useLanguage, useT } from '../../../i18n/useT.ts'
import { color, font, promotionBoard as paint, seatColor } from '../../../styles/tokens.ts'
import { fullArtHref, fullArtSize, fullKnob } from './fullArt.ts'
import { boardCellName, fullCellName, nameLines } from './fullText.ts'
import { fullCellForKey } from './fullKeys.ts'
import type { Box, FullBlockBox, FullCellBox, FullLayout, FullRungBox } from './fullLayout.ts'
import { STEP_MS } from './useTurnPlayback.ts'

export interface FullPiece {
  seat: number
  cell: string
  /** A person's initial, or their seat's number if nobody sits there now */
  mark: string
  /** Retired or exiled: drawn faint, the career over */
  done: boolean
}

export interface FullFlight {
  seat: number
  from: string
  to: string
  /** Down, not up: a fall is drawn in the colour of graft */
  fall: boolean
}

export interface FullBoardProps {
  /** The board the game plays on (boardFull.ts `fullBoard`), laid out by `layout` */
  board: Board
  layout: FullLayout
  pieces: readonly FullPiece[]
  activeSeat: number | null
  /** The cell being explained: outlined, with where each result leads from it marked */
  selected: string | null
  onSelect(cell: string): void
  flight: FullFlight | null
  reducedMotion: boolean
  /** How wide the board is drawn, as CSS */
  width?: string
  /** Drawn small: names grow to fill their cells, seals lose their words */
  dense?: boolean
  /** The cell a decision is about (C8), outlined dashed in the deciding seat's colour */
  pending?: { cell: string; seat: number } | null
  /** Who stands at each grade of the ladder (品級考), as compared at the end */
  grades?: ReadonlyMap<number, readonly number[]>
}

type Paints = Record<'l' | 'p' | 'g' | 's', string>

/**
 * The full board (e3-t14): the same lacquer, rice paper, brush and seals as the simple one, its 37
 * departments each under an upright plaque, and on every cell a watermark of the rank's hat, so that
 * how senior an office is shows at a glance. It only shows `view`.
 */
export function FullBoard({
  board,
  layout,
  pieces,
  activeSeat,
  selected,
  onSelect,
  flight,
  reducedMotion,
  width,
  dense = false,
  pending = null,
  grades,
}: FullBoardProps) {
  const t = useT()
  const hintId = useId()
  const prefix = `fb${useId().replace(/\W/g, '')}`
  const ids = { l: `${prefix}l`, p: `${prefix}p`, g: `${prefix}g`, s: `${prefix}s` }
  const paints = Object.fromEntries(
    Object.entries(ids).map(([key, id]) => [key, `url(#${id})`]),
  ) as Paints
  const points = piecePoints(pieces, layout)
  const flown = flight && !reducedMotion ? flightPath(flight, pieces, layout) : null
  const here = pieces.find((piece) => piece.seat === activeSeat)?.cell ?? null

  return (
    <>
      <VisuallyHidden id={hintId}>{t('board.keyboardHint')}</VisuallyHidden>
      <Svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        style={{ width: width ?? '100%' }}
        role="group"
        aria-label={t('games.promotion.full.boardLabel', {
          count: board.cells.length,
          depts: board.depts.length,
        })}
        aria-describedby={hintId}
        data-full-board=""
      >
        <Gradients ids={ids} />
        <Frame layout={layout} lacquer={paints.l} />
        <Cells
          board={board}
          layout={layout}
          selected={selected}
          here={here}
          hereSeat={activeSeat}
          onSelect={onSelect}
          paints={paints}
          dense={dense}
        />
        {layout.rungs.length > 0 && <Ladder rungs={layout.rungs} grades={grades} />}
        {pending && layout.byId.get(pending.cell) && (
          <PendingRing box={layout.byId.get(pending.cell) as FullCellBox} seat={pending.seat} />
        )}
        {flown && flight && (
          <FlightLine
            key={`${flight.from}>${flight.to}`}
            d={flown.d}
            pathLength={1}
            stroke={flight.fall ? paint.face.zang : seatColor(flight.seat)}
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

interface Point {
  x: number
  y: number
}

const centre = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })

const PIECE_RADIUS = 12

/** Where the pieces on one cell go: along its bottom from the right corner, overlapping when many */
function piecePoints(pieces: readonly { seat: number; cell: string }[], layout: FullLayout) {
  const points = new Map<number, Point>()
  const seen = new Map<string, number[]>()
  for (const piece of pieces) seen.set(piece.cell, [...(seen.get(piece.cell) ?? []), piece.seat])
  for (const [cell, seats] of seen) {
    const box = layout.byId.get(cell)
    if (!box) continue
    const middle = centre(box)
    const step = seats.length > 1 ? Math.min(18, (box.width - 26) / (seats.length - 1)) : 0
    seats.forEach((seat, at) => {
      points.set(seat, {
        x: middle.x + box.width / 2 - 14 - at * step,
        y: middle.y + box.height / 2 - 14 - (at % 2) * 3,
      })
    })
  }
  return points
}

function arcPoints(from: Point, to: Point, steps: number): { control: Point; points: Point[] } {
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
  const [dx, dy] = [to.x - from.x, to.y - from.y]
  const length = Math.hypot(dx, dy) || 1
  const lift = Math.min(140, length * 0.3)
  const side = dx > 0 ? 1 : -1
  const control = {
    x: middle.x + (side * dy * lift) / length,
    y: middle.y - (side * dx * lift) / length,
  }
  const points = Array.from({ length: steps + 1 }, (_, step) => {
    const k = step / steps
    const [a, b, c] = [(1 - k) ** 2, 2 * k * (1 - k), k ** 2]
    return { x: a * from.x + b * control.x + c * to.x, y: a * from.y + b * control.y + c * to.y }
  })
  return { control, points }
}

function flightPath(flight: FullFlight, pieces: readonly FullPiece[], layout: FullLayout) {
  const before = pieces.map((piece) =>
    piece.seat === flight.seat ? { seat: piece.seat, cell: flight.from } : piece,
  )
  const from = piecePoints(before, layout).get(flight.seat)
  const to = piecePoints(pieces, layout).get(flight.seat)
  if (!from || !to) return null
  const { control, points } = arcPoints(from, to, 16)
  return { d: `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`, trail: points }
}

const radial = (id: string, stops: [number, string, number?][], cy = '20%') => (
  <radialGradient id={id} cx="35%" cy={cy} r="110%">
    {stops.map(([offset, stop, opacity = 1]) => (
      <stop key={offset} offset={offset} stopColor={stop} stopOpacity={opacity} />
    ))}
  </radialGradient>
)

const Gradients = memo(function Gradients({ ids }: { ids: Paints }) {
  return (
    <defs>
      {radial(ids.l, [
        [0, paint.lacquerHi],
        [0.55, paint.lacquer],
        [1, paint.lacquerDeep],
      ], '0%')}
      {radial(ids.p, [
        [0, paint.paperHi],
        [0.6, paint.paper],
        [1, paint.paperShade],
      ])}
      {radial(ids.g, [
        [0, paint.endHi],
        [0.52, paint.end],
        [1, paint.endDeep],
      ])}
      {radial(ids.s, [
        [0, paint.sheen, 0.9],
        [0.18, paint.sheen, 0.35],
        [0.5, paint.sheen, 0],
        [0.9, paint.shade, 0.45],
      ])}
    </defs>
  )
})

/** The lacquered sheet with its gold trim, and each department's panel and upright plaque */
const Frame = memo(function Frame({ layout, lacquer }: { layout: FullLayout; lacquer: string }) {
  const t = useT()
  const language = useLanguage()
  const { width, height } = layout
  return (
    <g aria-hidden="true">
      <rect width={width} height={height} rx={10} fill={lacquer} stroke={paint.gold} strokeWidth={5} />
      <rect
        x={8}
        y={8}
        width={width - 16}
        height={height - 16}
        rx={4}
        fill="none"
        stroke={paint.goldDeep}
        strokeWidth={1.2}
      />
      {layout.blocks.map((block) => (
        <Plaque
          key={block.id}
          block={block}
          name={t(`games.promotion.full.plaque.${block.id}`)}
          upright={language === 'zh-TW'}
        />
      ))}
    </g>
  )
})

function Plaque({ block, name, upright }: { block: FullBlockBox; name: string; upright: boolean }) {
  const { plaque } = block
  const middle = centre(plaque)
  const chars = [...name]
  // Upright characters, as many as the plaque stands tall for; English on its side
  const size = upright ? Math.min(16, (plaque.height - 8) / chars.length) : 11
  return (
    <>
      <rect
        x={block.x}
        y={block.y}
        width={block.width}
        height={block.height}
        rx={3}
        fill={paint.block}
        fillOpacity={0.22}
        stroke={paint.gold}
        strokeOpacity={0.35}
      />
      <rect
        x={plaque.x}
        y={plaque.y}
        width={plaque.width}
        height={plaque.height}
        rx={2}
        fill={paint.plaque}
        stroke={paint.gold}
      />
      {upright ? (
        chars.map((char, at) => (
          <Ink
            key={at}
            x={middle.x}
            y={middle.y + (at - (chars.length - 1) / 2) * size * 1.05}
            fill={paint.onPlaque}
            style={{ fontSize: size }}
          >
            {char}
          </Ink>
        ))
      ) : (
        <Ink
          x={middle.x}
          y={middle.y}
          fill={paint.onPlaque}
          transform={`rotate(-90 ${middle.x} ${middle.y})`}
          style={{ fontSize: size, letterSpacing: 0.5 }}
          textLength={name.length * size * 0.56 > plaque.height - 6 ? plaque.height - 6 : undefined}
          lengthAdjust="spacingAndGlyphs"
        >
          {name}
        </Ink>
      )}
    </>
  )
}

/** Which cells the selected one leads to, and on which results */
function destinations(board: Board, selected: string | null): Map<string, FullFace[]> {
  const found = new Map<string, FullFace[]>()
  if (!selected || !board.has(selected)) return found
  const cell = board.get(selected)
  if (cell.kind === 'end' || cell.kind === 'event') return found
  for (const face of FULL_FACES) {
    const to = cell.moves[face]
    if (to === selected) continue
    found.set(to, [...(found.get(to) ?? []), face])
  }
  return found
}

// Apart from the pieces: some 200 cells need no new drawing each time a piece moves
const Cells = memo(function Cells({
  board,
  layout,
  selected,
  here,
  hereSeat,
  onSelect,
  paints,
  dense,
}: {
  board: Board
  layout: FullLayout
  selected: string | null
  here: string | null
  hereSeat: number | null
  onSelect(cell: string): void
  paints: Paints
  dense: boolean
}) {
  const t = useT()
  const language = useLanguage()
  const group = useRef<SVGGElement>(null)
  // One Tab stop for the whole board: the cell in focus, else the one being shown
  const [focused, setFocused] = useState<string | null>(null)
  const tabStop = focused ?? selected ?? FULL_START
  const leadsTo = destinations(board, selected)

  const onKeyDown = (event: KeyboardEvent, id: string) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!event.repeat) onSelect(id)
      return
    }
    const next = fullCellForKey(layout, id, event.key)
    if (next === null) return
    event.preventDefault()
    group.current?.querySelector<SVGGElement>(`[data-cell="${next}"]`)?.focus()
  }

  return (
    <g ref={group}>
      {layout.cells.map((box) => {
        const cell = board.get(box.id)
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
            data-rank={cell.rank}
          >
            <title>{`${fullCellName(box.id, language)} · ${t(`games.promotion.full.rank.${cell.rank}`)}`}</title>
            <rect
              data-ring=""
              x={x - 4}
              y={y - 4}
              width={width + 8}
              height={height + 10}
              rx={5}
              fill="none"
              strokeWidth={5}
            />
            <rect x={x} y={y + 2.5} width={width} height={height} rx={3} fill={paint.drop} />
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={3}
              fill={tileFill(cell, paints)}
              stroke={paint.edge}
            />
            <Tile box={box} cell={cell} t={t} language={language} sheen={paints.s} dense={dense} />
            {outline && (
              <rect
                x={x + 1.5}
                y={y + 1.5}
                width={width - 3}
                height={height - 3}
                rx={3}
                fill="none"
                stroke={outline}
                strokeWidth={3.5}
              />
            )}
            <Badges box={box} faces={leadsTo.get(box.id)} t={t} />
          </CellGroup>
        )
      })}
    </g>
  )
})

/** Paper for an office; gold for the grand congratulations and the honoured retirement; grey exile */
function tileFill(cell: FullCell, paints: Paints): string {
  if (cell.id === 'dahe' || cell.id === 'yugao') return paints.g
  if (cell.id === 'changshu') return paint.exile
  return paints.p
}

/** What is written on a cell: dark ink on paper and gold, light on the grey of exile */
const inkOf = (cell: FullCell) =>
  cell.id === 'changshu' ? paint.onExile : cell.id === 'dahe' || cell.id === 'yugao' ? paint.onEnd : paint.ink

/**
 * A cell's face: the watermark of its rank (the bigger and grander the hat, the higher the office),
 * the hat button, the rank's seal, the name, and the markers of its rules: what it requires, the
 * silver it gives or takes, the gift its retirement brings
 */
function Tile({
  box,
  cell,
  t,
  language,
  sheen,
  dense,
}: {
  box: FullCellBox
  cell: FullCell
  t: Translate
  language: Language
  sheen: string
  dense: boolean
}) {
  const ink = inkOf(cell)
  const knob = fullKnob(cell.rank)
  const name = boardCellName(cell.id, language)
  const { lines, latin } = nameLines(name)
  const longest = Math.max(...lines.map((line) => [...line].length))
  const base = latin ? 12.5 : 16
  const size = Math.min(base * (dense ? 1.3 : 1), latin ? 24 : (box.width - 10) / Math.max(2, longest))
  const gap = size * 1.08
  const middleX = box.x + box.width / 2
  const middleY = box.y + box.height / 2 - (dense ? 0 : 3)
  const room = box.width - 8
  const art = Math.min(box.width, box.height) * fullArtSize(cell)
  const seal = cell.kind === 'end' ? '' : t(`games.promotion.full.seal.${cell.rank}`)
  // Seniority as warmth too: the higher the office, the more gold in its paper
  const warmth = cell.kind === 'end' ? 0 : Math.min(0.5, 0.5 * (cell.rank / 26) ** 1.6)
  return (
    <>
      {warmth > 0.02 && (
        <rect
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx={3}
          fill={paint.end}
          opacity={warmth}
        />
      )}
      <use
        href={fullArtHref(cell.art)}
        x={box.x + (box.width - art) / 2}
        y={box.y + (box.height - art) / 2}
        width={art}
        height={art}
        color={ink}
        opacity={cell.kind === 'end' ? 0.34 : 0.3}
        style={knob ? ({ '--knob': paint.knob[knob] } as CSSProperties) : undefined}
        data-art={cell.art}
      />
      {knob && (
        <>
          <circle cx={box.x + 8} cy={box.y + 8} r={4} fill={paint.knob[knob]} stroke={paint.ink} strokeOpacity={0.45} />
          <circle cx={box.x + 8} cy={box.y + 8} r={4} fill={sheen} />
        </>
      )}
      {seal && <Seal box={box} text={dense ? '' : seal} />}
      {lines.map((line, at) => {
        const wide = [...line].length * size * (latin ? 0.56 : 1) > room
        return (
          <Ink
            key={at}
            x={middleX}
            y={middleY + (at - (lines.length - 1) / 2) * gap}
            fill={ink}
            style={{ fontSize: size }}
            textLength={wide ? room : undefined}
            lengthAdjust={wide ? 'spacingAndGlyphs' : undefined}
          >
            {line}
          </Ink>
        )
      })}
      <Markers box={box} cell={cell} t={t} />
    </>
  )
}

/** The rank as a small red seal in the top right corner */
function Seal({ box, text }: { box: FullCellBox; text: string }) {
  const latin = /[a-z]/i.test(text)
  const chars = latin ? [text] : [...text]
  const width = latin ? Math.max(14, text.length * 4.6 + 5) : 10
  const height = latin ? 11 : text ? chars.length * 8.4 + 3 : 12
  const x = box.x + box.width - width - 3
  const y = box.y + 3
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={paint.seal} opacity={0.92} />
      {text &&
        chars.map((char, at) => (
          <Ink
            key={at}
            x={x + width / 2}
            y={y + (latin ? 5.8 : 1.5 + (at + 0.5) * 8.4)}
            fill={paint.onSeal}
            style={{ fontSize: latin ? 7.5 : 7.8 }}
          >
            {char}
          </Ink>
        ))}
    </g>
  )
}

/** The kind of choice or event a cell brings (C8): an offered post, a minor post to buy out of, an event */
const choiceOf = (cell: FullCell) =>
  cell.offer ? 'offer' : cell.minor ? 'minor' : cell.event !== null ? 'event' : null

/** Silver and requirements, as small stamps along the bottom of the cell; a choice or event on top */
function Markers({ box, cell, t }: { box: FullCellBox; cell: FullCell; t: Translate }) {
  const bottom = box.y + box.height - 3
  const silver = cell.retire ?? (cell.money !== 0 ? cell.money : null)
  const choice = choiceOf(cell)
  return (
    <g>
      {choice && (
        <g data-choice={choice}>
          <rect x={box.x + 3} y={box.y + 15} width={15} height={12} rx={6} fill={paint.choice} />
          <Ink
            x={box.x + 10.5}
            y={box.y + 21}
            fill={paint.onChoice}
            style={{ fontSize: 8, fontFamily: /[a-z]/i.test(t(`games.promotion.full.tag.${choice}`)) ? font.sans : undefined }}
            textLength={11}
            lengthAdjust="spacingAndGlyphs"
          >
            {t(`games.promotion.full.tag.${choice}`)}
          </Ink>
        </g>
      )}
      {silver !== null && (
        <g data-silver={silver}>
          <circle cx={box.x + 8} cy={bottom - 6} r={5.5} fill={paint.silver} stroke={paint.silverDeep} />
          <Ink
            x={box.x + 15}
            y={bottom - 6}
            fill={cell.retire !== null || cell.money > 0 ? paint.gain : paint.loss}
            style={{ fontSize: 9, textAnchor: 'start', fontFamily: font.sans }}
          >
            {cell.retire !== null
              ? t('games.promotion.full.tag.congrats', { amount: cell.retire })
              : cell.money > 0
                ? `+${cell.money}`
                : `−${-cell.money}`}
          </Ink>
        </g>
      )}
      {cell.requires && (
        <g data-requires={cell.requires}>
          <rect
            x={box.x + box.width - 17}
            y={bottom - 12}
            width={14}
            height={12}
            rx={2}
            fill={paint.requirement}
          />
          <Ink
            x={box.x + box.width - 10}
            y={bottom - 6}
            fill={paint.onRequirement}
            style={{ fontSize: 8, fontFamily: /[a-z]/i.test(t(`games.promotion.full.tag.${cell.requires}`)) ? font.sans : undefined }}
            textLength={12}
            lengthAdjust="spacingAndGlyphs"
          >
            {t(`games.promotion.full.tag.${cell.requires}`)}
          </Ink>
        </g>
      )}
    </g>
  )
}

/** The ladder of grades the end compares (品級考): a rung each, with the seats now at it */
function Ladder({
  rungs,
  grades,
}: {
  rungs: readonly FullRungBox[]
  grades: ReadonlyMap<number, readonly number[]> | undefined
}) {
  const t = useT()
  return (
    <g data-ladder="">
      {rungs.map((rung) => {
        const seats = grades?.get(rung.grade) ?? []
        const label = t(`games.promotion.full.grade.${rung.grade}`)
        return (
          <g key={rung.grade} data-grade={rung.grade}>
            <title>{t('games.promotion.full.gradeTitle', { grade: rung.grade, name: label })}</title>
            <rect x={rung.x} y={rung.y} width={rung.width} height={rung.height} rx={3} fill={paint.paper} stroke={paint.edge} />
            <Ink x={rung.x + rung.width / 2} y={rung.y + 12} fill={paint.seal} style={{ fontSize: 11, fontFamily: font.sans }}>
              {rung.grade}
            </Ink>
            <Ink
              x={rung.x + rung.width / 2}
              y={rung.y + rung.height / 2 + 2}
              fill={paint.ink}
              style={{ fontSize: 12 }}
              textLength={[...label].length * 12 > rung.width - 6 ? rung.width - 6 : undefined}
              lengthAdjust="spacingAndGlyphs"
            >
              {label}
            </Ink>
            {seats.map((seat, at) => (
              <circle
                key={seat}
                cx={rung.x + 8 + at * 9}
                cy={rung.y + rung.height - 8}
                r={4}
                style={{ fill: seatColor(seat) }}
                stroke={paint.ink}
                strokeWidth={0.8}
                data-ladder-seat={seat}
              />
            ))}
          </g>
        )
      })}
    </g>
  )
}

/** The cell a decision is about, outlined dashed in the deciding seat's colour */
function PendingRing({ box, seat }: { box: FullCellBox; seat: number }) {
  return (
    <PendingRect
      x={box.x - 3}
      y={box.y - 3}
      width={box.width + 6}
      height={box.height + 6}
      rx={5}
      fill="none"
      stroke={seatColor(seat)}
      strokeWidth={4}
      strokeDasharray="7 5"
      data-pending-cell={box.id}
      aria-hidden="true"
    />
  )
}

const BADGE = 13

/** Where the selected cell leads: a coloured stamp of each result that goes here, along the top */
function Badges({ box, faces, t }: { box: FullCellBox; faces: FullFace[] | undefined; t: Translate }) {
  if (!faces) return null
  const left = box.x + (box.width - faces.length * (BADGE + 2)) / 2
  const top = box.y - BADGE / 2
  return (
    <g aria-hidden="true">
      {faces.map((face, at) => {
        const x = left + at * (BADGE + 2)
        return (
          <g key={face} data-badge={face}>
            <rect x={x} y={top} width={BADGE} height={BADGE} rx={2} fill={paint.face[face]} stroke={paint.ink} strokeOpacity={0.6} />
            <Ink x={x + BADGE / 2} y={top + BADGE / 2 + 0.5} fill={paint.onFace} style={{ fontSize: 10 }}>
              {t(`games.promotion.full.glyph.${face}`)}
            </Ink>
          </g>
        )
      })}
    </g>
  )
}

function Piece({
  piece,
  point,
  active,
  trail,
  reducedMotion,
  sheen,
}: {
  piece: FullPiece
  point: Point | undefined
  active: boolean
  trail: Point[] | null
  reducedMotion: boolean
  sheen: string
}) {
  const ref = useRef<SVGGElement>(null)
  const frames = trail?.map(({ x, y }) => `translate(${x}px, ${y}px)`).join('|') ?? null

  useLayoutEffect(() => {
    if (!frames || !ref.current?.animate) return undefined
    const animation = ref.current.animate(
      frames.split('|').map((transform) => ({ transform })),
      { duration: STEP_MS, easing: 'ease-in-out' },
    )
    return () => animation.cancel()
  }, [frames])

  if (!point) return null
  return (
    <PieceGroup
      ref={ref}
      $glide={!reducedMotion && !trail}
      style={{ transform: `translate(${point.x}px, ${point.y}px)`, opacity: piece.done ? 0.6 : 1 }}
      aria-hidden="true"
      data-seat={piece.seat}
    >
      {active && <TurnRing r={PIECE_RADIUS + 4} $still={reducedMotion} />}
      <ellipse cx={1.2} cy={6.5} rx={PIECE_RADIUS} ry={7} fill={paint.shade} opacity={0.4} />
      <circle r={PIECE_RADIUS} style={{ fill: seatColor(piece.seat) }} stroke={paint.ink} strokeWidth={1.3} />
      <circle r={PIECE_RADIUS} fill={sheen} />
      <Ink style={{ fill: color.onSeat, fontSize: 13, fontFamily: 'inherit' }}>{piece.mark}</Ink>
    </PieceGroup>
  )
}

const Svg = styled.svg`
  display: block;
  max-width: none;
  height: auto;
  user-select: none;
`

const Ink = styled.text`
  font-family: ${font.kai};
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
`

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
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 1;
  opacity: 0.8;
  pointer-events: none;
  animation: ${draw} ${STEP_MS}ms ease-in-out both;
`

const march = keyframes`
  to {
    stroke-dashoffset: -24;
  }
`

const PendingRect = styled.rect`
  pointer-events: none;
  animation: ${march} 900ms linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
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

const TurnRing = styled.circle<{ $still: boolean }>`
  fill: none;
  stroke: ${paint.ink};
  stroke-width: 3;
  animation: ${(p) => (p.$still ? 'none' : pulse)} 1200ms ease-in-out infinite;
`

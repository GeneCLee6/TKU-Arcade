import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import styled, { keyframes } from 'styled-components'
import type { FullArt } from '../../../../shared/games/promotion/boardFull.ts'
import { promotionFullMessages } from '../../../../shared/games/promotion/i18n.full.ts'
import type {
  FullPlayer,
  PromotionAction,
  PromotionFullView,
} from '../../../../shared/games/promotion/types.ts'
import type { Standing } from '../../../../shared/games/types.ts'
import type { RoomMember } from '../../../../shared/protocol.ts'
import { Avatar } from '../../../components/Avatar.tsx'
import { Button } from '../../../components/Button.tsx'
import { Drawer } from '../../../components/Drawer.tsx'
import { GameLayout } from '../../../components/GameLayout.tsx'
import { Muted } from '../../../components/roomParts.ts'
import { registerMessages } from '../../../i18n/t.ts'
import { useLanguage, useT } from '../../../i18n/useT.ts'
import { initialOf } from '../../../lib/avatar.ts'
import { playCue, setSoundOn, useSoundOn, useSoundUnlock } from '../../../lib/sound.ts'
import { useReducedMotion } from '../../../lib/useMediaQuery.ts'
import { color, fontSize, promotionBoard, radius, seatColor, space } from '../../../styles/tokens.ts'
import type { GameScreenProps } from '../../screens.ts'
import { useBoardFit } from '../useBoardFit.ts'
import { MAX_ZOOM, MIN_ZOOM, useBoardZoom } from '../useBoardZoom.ts'
import { useImmersive } from '../useImmersive.ts'
import { fullArtHref, fullKnob } from './fullArt.ts'
import { FullBoard, type FullFlight, type FullPiece } from './FullBoard.tsx'
import { loadFullBoardFont } from './fullFont.ts'
import { FullDice } from './FullDice.tsx'
import { useFullData } from './fullData.ts'
import type { SquareLayout } from './fullSquare.ts'
import { shortCellName } from './fullText.ts'
import {
  beforeTransfers,
  comboText,
  degreeText,
  householdText,
  ladderGrade,
  lastComboText,
  seatInfo,
  transferText,
  turnSentence,
} from './fullWords.ts'
import { SETTLE_STEPS } from './settleSteps.ts'
import { useTurnPlayback } from './useTurnPlayback.ts'

// Everything this screen says, with its cell and department names in boardFull.ts: loaded only with
// a full edition's game, the board's data after the first paint (fullData.ts)
registerMessages(promotionFullMessages)

// Each player's way through the game, once it is over: out of the first screen
const FullRoutes = lazy(() => import('./FullRoutes.tsx'))
// Only once a game ends, or once someone has a choice to make: off the first screen too (budget)
const Settlement = lazy(() =>
  import('./Settlement.tsx').then((module) => ({ default: module.Settlement })),
)
const DecisionPrompt = lazy(() =>
  import('./DecisionPrompt.tsx').then((module) => ({ default: module.DecisionPrompt })),
)
// A cell's details, only when someone taps one: out of the first screen too (2026-11-14, to make room
// in the 150 kB budget for new games)
const FullCellDetail = lazy(() => import('./FullCellDetail.tsx').then((module) => ({ default: module.FullCellDetail })))

/** Below this many CSS pixels a cell is drawn dense: bigger names, seals without words */
const DENSE_CELL = 48
const BOARD_MARGIN = 8
/** The least room inside the square board's outer ring for a decision's card to go there */
const PROMPT_MIN_W = 300
const PROMPT_MIN_H = 150
/** If the room never answers a roll, the button comes back after this */
const ROLL_ANSWER_MS = 4000

/**
 * The full edition's screen (e3-t14). Rules stay on the server: this draws `view`. Like the simple
 * screen, the whole board, whose turn it is and the roll are on one screen without scrolling; every
 * line of the dock has a fixed height, so that nothing a roll says moves the board. A turn plays out
 * beat by beat (useTurnPlayback): each throw of the four dice and what it makes, each move, then the
 * silver with its reasons. The game ends in a settlement shown a step at a time, then the result.
 *
 * Since C8 the board's data (names, moves, layout) comes after the first paint: until it does, the
 * dock, the seats and their silver show and the board says it is being drawn. A decision the game
 * waits for (an offered post, buying office) is a card over the foot of the board (DecisionPrompt):
 * the dock's lines keep their height and the board its size.
 */
export default function FullScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const language = useLanguage()
  const state = game.view as unknown as PromotionFullView
  const reducedMotion = useReducedMotion()
  const data = useFullData()
  const board = data ? data.fullBoard(state.rulesVersion) : null
  useEffect(() => {
    if (data) loadFullBoardFont()
  }, [data])
  const zoom = useBoardZoom()
  const { viewport, show, zoom: zoomLevel } = zoom

  const frame = useRef<HTMLDivElement>(null)
  const turnPanel = useRef<HTMLDivElement>(null)
  const immersive = useImmersive(frame)
  const immersed = immersive.mode !== 'off'
  const { stage: stageHeight, box, stageRef, boxRef } = useBoardFit(turnPanel, !immersed)
  const layouts = data?.layouts ?? null
  const fit =
    board && layouts
      ? box
        ? layouts.fitBoard(board, box.width - 2 * BOARD_MARGIN, box.height - 2 * BOARD_MARGIN)
        : { layout: layouts.unfitted(board), scale: 0 }
      : null
  const layout = fit?.layout ?? null
  const boardWidth = box && fit ? `${fit.layout.width * fit.scale * zoomLevel}px` : `${zoomLevel * 100}%`
  const dense = box !== null && fit !== null && layouts !== null && layouts.CELL_W * fit.scale * zoomLevel < DENSE_CELL

  const [selected, setSelected] = useState<string | null>(null)
  const toggleCell = useCallback(
    (cell: string) => setSelected((current) => (current === cell ? null : cell)),
    [setSelected],
  )
  const [ledgerOpen, setLedgerOpen] = useState(false)
  const [asked, setAsked] = useState(false)
  useSoundUnlock()

  const { last, players } = state
  const playback = useTurnPlayback(players, last, game.over, reducedMotion, state.acts)
  const beat = playback.beat
  const playing = beat !== null

  const members = Object.values(room.view.members)
  const seatHolder = (seat: number): RoomMember | undefined =>
    members.find((member) => member.seat === seat)
  const nameOf = (seat: number) =>
    seatHolder(seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })
  const playerOf = (seat: number | null): FullPlayer | undefined =>
    players.find((player) => player.seat === seat)

  // Where the mover's piece is in the middle of a turn: where it started, then each step of its path
  const moverCell = (() => {
    if (!beat || !last) return null
    if (beat.kind === 'move') return last.path[beat.index]
    if (beat.kind === 'pay') return last.path.at(-1) ?? last.from
    return last.from
  })()
  const pieces: FullPiece[] = players.map((player) => {
    const holder = seatHolder(player.seat)
    return {
      seat: player.seat,
      cell: moverCell !== null && last?.seat === player.seat ? moverCell : player.cell,
      mark: holder ? initialOf(holder.name) : String(player.seat + 1),
      done: player.status !== 'active',
    }
  })
  const flight: FullFlight | null = (() => {
    if (beat?.kind !== 'move' || !last) return null
    const from = beat.index === 0 ? last.from : last.path[beat.index - 1]
    const to = last.path[beat.index]
    if (from === to || !board || !board.has(from) || !board.has(to)) return null
    return { seat: last.seat, from, to, fall: board.get(to).rank < board.get(from).rank }
  })()

  // Silver and the pot as they stood before this turn's transfers, until those play
  const paid = !playing || beat.kind === 'pay'
  const before = last && !paid ? beforeTransfers(players, state.bank, last.transfers) : null
  const moneyOf = (player: FullPlayer) => before?.money.get(player.seat) ?? player.money
  const bank = before?.bank ?? state.bank

  // Until the turn is all shown the move is still the mover's
  const activeSeat = playing && last ? last.seat : state.turn
  // A decision waits (C8): shown once the turn that brought it has played out
  const pending = state.pending ?? null
  const deciding = pending !== null && !playing && !game.over
  const myDecision = deciding && game.legal.length > 0 && pending.seat === state.you
  const canRoll = game.legal.length > 0 && !playing && !asked && pending === null

  const answerKey = `${playback.count}:${state.turn}:${state.decisions ?? 0}`
  const [answeredKey, setAnsweredKey] = useState(answerKey)
  if (answerKey !== answeredKey) {
    setAnsweredKey(answerKey)
    setAsked(false)
  }
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAsked(false), ROLL_ANSWER_MS)
    return () => clearTimeout(timer)
  }, [asked])

  const yourTurn = game.legal.length > 0 && !playing
  const wasYourTurn = useRef(yourTurn)
  useEffect(() => {
    if (yourTurn && !wasYourTurn.current) playCue('turn')
    wasYourTurn.current = yourTurn
  }, [yourTurn])

  // When zoomed in, the board follows the piece
  const landing = flight?.to
  useEffect(() => {
    if (!landing || zoomLevel === MIN_ZOOM || !layout) return
    const cell = layout.byId.get(landing)
    if (cell) show((cell.x + cell.width / 2) / layout.width, (cell.y + cell.height / 2) / layout.height)
  }, [landing, zoomLevel, layout, show])

  // The settlement, a step at a time, once the last turn has played; then the result
  const [settleStep, setSettleStep] = useState(0)
  const [settleClosed, setSettleClosed] = useState(false)
  // A rematch in the same room starts the next game's settlement afresh
  if (!game.over && (settleClosed || settleStep !== 0)) {
    setSettleClosed(false)
    setSettleStep(0)
  }
  const settling = game.over && state.settlement !== null && !playing
  const settled = reducedMotion || settleStep >= SETTLE_STEPS
  const showSettlement = settling && !settleClosed

  const roll = () => {
    if (!canRoll) return
    setAsked(true)
    room.act({ type: 'roll' })
  }

  const answer = (action: PromotionAction) => {
    if (!myDecision || asked) return
    setAsked(true)
    room.act(action)
  }
  const decisionTimer = room.timers.find((timer) => timer.id.startsWith('decide-')) ?? null

  const showSeat = (cell: string) => {
    toggleCell(cell)
    viewport.current
      ?.querySelector(`[data-cell="${cell}"]`)
      ?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  const ownCell = playerOf(state.you)?.cell
  const markedCell = selected ?? ownCell ?? playerOf(activeSeat)?.cell ?? null

  // What names a cell waits for the board's data
  const seatDetail = (member: RoomMember) => {
    const player = playerOf(member.seat)
    return player && data ? seatInfo(t, language, player) : null
  }
  const resultDetail = (standing: Standing) => {
    const player = playerOf(standing.seat)
    return player && data ? seatInfo(t, language, player) : null
  }
  const topSeats = game.result?.standings.filter((standing) => standing.rank === 1) ?? []
  const resultHeadline = t('games.promotion.full.mostSilver', {
    names: new Intl.ListFormat(language).format(topSeats.map((standing) => nameOf(standing.seat))),
  })

  // The dock's three lines, each a fixed height: who is to move, what the dice make, what happened
  const shownThrow = (() => {
    if (!last) return null
    if (beat?.kind === 'throw' || beat?.kind === 'read') return last.throws[beat.index]
    return last.throws.at(-1) ?? null
  })()
  const tumbling = beat?.kind === 'throw'
  const combo = (() => {
    if (!last || !shownThrow || tumbling || !data) return ''
    if (beat?.kind === 'read') return comboText(t, shownThrow, last.birth, language, beat.index < last.throws.length - 1)
    return lastComboText(t, last, language)
  })()
  const throwCount =
    last && beat && (beat.kind === 'throw' || beat.kind === 'read') && last.throws.length > 1
      ? ` (${beat.index + 1}/${last.throws.length})`
      : ''
  // While a decision waits, the line under the dice says what is being decided
  const sentence = !playing && last && data
    ? deciding
      ? t(`games.promotion.full.watching.${pending.kind}`, {
          name: nameOf(pending.seat),
          cell: shortCellName(pending.cell, language),
        })
      : turnSentence(t, language, last, playerOf(last.seat), nameOf(last.seat))
    : ''
  // The card goes where it does not hide the cell it is about
  const pendingBox = deciding && layout ? layout.byId.get(pending.cell) : undefined
  const promptOnTop = pendingBox !== undefined && layout !== null && pendingBox.y + pendingBox.height / 2 > layout.height / 2
  // On the square board, inside the outer ring (where every cell that asks is), if the card has room
  const promptArea = (() => {
    if (!deciding || !layout || !box || !fit || zoomLevel !== MIN_ZOOM) return null
    if (!('square' in layout)) return null
    const { inner } = (layout as SquareLayout).square
    const left = (box.width - layout.width * fit.scale) / 2
    const top = (box.height - layout.height * fit.scale) / 2
    const area = {
      x: left + inner.x * fit.scale,
      y: top + inner.y * fit.scale,
      width: inner.width * fit.scale,
      height: inner.height * fit.scale,
    }
    return area.width >= PROMPT_MIN_W && area.height >= PROMPT_MIN_H ? area : null
  })()

  let mainText: string
  if (playing && last) mainText = t('games.promotion.full.rolling', { name: nameOf(last.seat) })
  else if (game.over) mainText = t('games.promotion.full.gameOver')
  else if (deciding) {
    mainText = myDecision
      ? t('games.promotion.full.yourChoice')
      : t('games.promotion.full.deciding', { name: nameOf(pending.seat) })
  } else if (yourTurn) {
    mainText =
      playerOf(state.you)?.origin === null
        ? t('games.promotion.full.yourBirth')
        : t('games.promotion.full.yourTurn')
  } else if (state.turn !== null) mainText = t('games.promotion.full.turnOf', { name: nameOf(state.turn) })
  else mainText = t('games.promotion.full.gameOver')

  const turn = (
    <TurnPanel ref={turnPanel}>
      <FullDice dice={shownThrow?.dice ?? null} tumbling={tumbling} />
      <TurnText>
        <MainLine title={mainText}>{mainText}</MainLine>
        <SmallLine data-combo="" title={combo || undefined}>
          {combo}
          {throwCount}
        </SmallLine>
        <RollLine role="status" title={sentence || undefined} data-roll-line="">
          {sentence}
        </RollLine>
      </TurnText>
      {state.you !== null && !game.over && (
        <RollButton aria-disabled={!canRoll} $waiting={!canRoll} onClick={roll}>
          {t('games.promotion.full.ui.roll')}
        </RollButton>
      )}
    </TurnPanel>
  )

  const zoomButtons = (
    <>
      <Button
        $variant="secondary"
        $size="sm"
        aria-label={t('games.promotion.full.ui.zoomOut')}
        disabled={zoom.zoom <= MIN_ZOOM}
        onClick={zoom.zoomOut}
      >
        −
      </Button>
      <Button
        $variant="secondary"
        $size="sm"
        aria-label={t('games.promotion.full.ui.zoomIn')}
        disabled={zoom.zoom >= MAX_ZOOM}
        onClick={zoom.zoomIn}
      >
        +
      </Button>
      <Button $variant="secondary" $size="sm" disabled={zoom.zoom === MIN_ZOOM} onClick={zoom.reset}>
        {t('games.promotion.full.ui.zoomFit')}
      </Button>
    </>
  )

  const ledgerButton = (
    <Button $variant="secondary" $size="sm" onClick={() => setLedgerOpen(true)}>
      {t('games.promotion.full.ledger')}
    </Button>
  )

  const seatStrip = (
    <SeatStrip aria-label={t('games.promotion.full.ui.seats')}>
      {players.map((player) => (
        <SeatChip
          key={player.seat}
          art={board?.has(player.cell) ? board.get(player.cell).art : null}
          player={player}
          name={nameOf(player.seat)}
          money={moneyOf(player)}
          turn={player.seat === activeSeat}
          pressed={selected === player.cell}
          onClick={() => showSeat(player.cell)}
        />
      ))}
      <Pot data-pot={bank}>
        <PotLabel>{t('games.promotion.full.bank')}</PotLabel>
        <PotAmount>{t('games.promotion.full.silver', { amount: bank })}</PotAmount>
        <PotLabel>{t('games.promotion.full.round', { round: state.round, limit: state.turnLimit })}</PotLabel>
      </Pot>
    </SeatStrip>
  )

  const here = selected
    ? players.filter((player) => player.cell === selected).map((player) => nameOf(player.seat))
    : []

  // The ladder of grades (品級考, C8): who stands where in the comparison the end makes
  const grades = new Map<number, number[]>()
  if (data && state.rulesVersion === 2) {
    for (const player of players) {
      if (player.origin === null) continue
      const grade = ladderGrade(player, data.gradeOf, true)
      grades.set(grade, [...(grades.get(grade) ?? []), player.seat])
    }
  }

  return (
    <GameLayout
      room={room}
      turnSeat={activeSeat}
      seatDetail={seatDetail}
      seatTint
      resultHeadline={resultHeadline}
      resultDetail={resultDetail}
      resultHeld={playing || (settling && !settled && !settleClosed)}
      resultExtra={
        game.over && data ? (
          <Suspense fallback={null}>
            <FullRoutes
              players={players}
              nameOf={nameOf}
              cellName={(id) => shortCellName(id, language)}
            />
          </Suspense>
        ) : undefined
      }
      dock={immersed ? undefined : turn}
      ownCountdown
    >
      <Frame ref={frame} $immersed={immersed} data-immersion={immersive.mode} data-edition="full">
        <Stage
          ref={stageRef}
          data-fit-screen=""
          style={!immersed && stageHeight !== null ? { height: stageHeight } : undefined}
        >
          {!immersed && (
            <Toolbar>
              {seatStrip}
              <Tools>
                {zoomButtons}
                {ledgerButton}
                <Button $variant="secondary" $size="sm" onClick={() => void immersive.enter()}>
                  {t('games.promotion.full.ui.fullscreen')}
                </Button>
                <SoundButton />
              </Tools>
            </Toolbar>
          )}

          <BoardArea ref={boxRef}>
            <Viewport ref={viewport} $zoomed={zoom.zoom > MIN_ZOOM}>
              {board && layout ? (
              <FullBoard
                board={board}
                layout={layout}
                pieces={pieces}
                activeSeat={activeSeat}
                selected={markedCell}
                onSelect={toggleCell}
                flight={flight}
                reducedMotion={reducedMotion}
                width={boardWidth}
                dense={dense}
                pending={deciding ? { cell: pending.cell, seat: pending.seat } : null}
                grades={grades}
                bank={bank}
              />
              ) : (
                <Loading role="status">{t('games.promotion.full.loading')}</Loading>
              )}
            </Viewport>
            {beat?.kind === 'pay' && last && (
              <Payments aria-hidden="true" data-payments="">
                {last.transfers.map((transfer, at) => (
                  <Payment key={at} style={{ animationDelay: `${at * 160}ms` }}>
                    {transferText(t, transfer, nameOf)}
                  </Payment>
                ))}
              </Payments>
            )}
            {showSettlement && state.settlement && (
              <Suspense fallback={null}>
                <Settlement
                  settlement={state.settlement}
                  nameOf={nameOf}
                  step={settleStep}
                  onStep={setSettleStep}
                  onClose={() => setSettleClosed(true)}
                  reducedMotion={reducedMotion}
                />
              </Suspense>
            )}
            {deciding && data && !showSettlement && (
              <Suspense fallback={null}>
                <DecisionPrompt
                  pending={pending}
                  mine={myDecision}
                  name={nameOf(pending.seat)}
                  money={moneyOf(players[pending.seat])}
                  timer={decisionTimer}
                  waiting={asked}
                  onAnswer={answer}
                  top={promptOnTop}
                  area={promptArea}
                />
              </Suspense>
            )}
            {board && (
              <Suspense fallback={null}>
                <FullCellDetail board={board} id={selected} here={here} onClose={() => setSelected(null)} />
              </Suspense>
            )}
          </BoardArea>

          {!immersed && <Tip>{t('games.promotion.full.ui.sidewaysTip')}</Tip>}
        </Stage>

        {immersed && (
          <Rail>
            {seatStrip}
            {turn}
            <Tools>
              {zoomButtons}
              {ledgerButton}
              <Button $variant="secondary" $size="sm" onClick={immersive.exit}>
                {t('games.promotion.full.ui.exitFullscreen')}
              </Button>
            </Tools>
          </Rail>
        )}
      </Frame>
      <Drawer
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        title={t('games.promotion.full.ledgerTitle')}
      >
        {last && last.transfers.length > 0 ? (
          <Ledger>
            {last.transfers.map((transfer, at) => (
              <li key={at}>{transferText(t, transfer, nameOf)}</li>
            ))}
          </Ledger>
        ) : (
          <Muted>{t('games.promotion.full.ledgerEmpty')}</Muted>
        )}
        {data && (
          <Ledger>
            {players.map((player) => (
              <li key={player.seat}>
                {nameOf(player.seat)}: {seatInfo(t, language, player)}
              </li>
            ))}
          </Ledger>
        )}
        {state.settlement && (
          <Button
            $variant="secondary"
            $size="sm"
            onClick={() => {
              setLedgerOpen(false)
              setSettleStep(SETTLE_STEPS)
              setSettleClosed(false)
            }}
          >
            {t('games.promotion.full.settlement')}
          </Button>
        )}
      </Drawer>
    </GameLayout>
  )
}

/**
 * A seat in the strip over the board: their colour, name, the hat of their office, silver, and what
 * they hold (degree, household). Retired and exiled seats are marked in words, not by colour alone
 */
function SeatChip({
  art,
  player,
  name,
  money,
  turn,
  pressed,
  onClick,
}: {
  /** The watermark of the seat's cell; null until the board's data is there */
  art: FullArt | null
  player: FullPlayer
  name: string
  money: number
  turn: boolean
  pressed: boolean
  onClick(): void
}) {
  const t = useT()
  const knob = fullKnob(player.rank)
  const tags = [
    player.degree > 0 ? t(`games.promotion.full.degreeShort.${player.degree}`) : null,
    player.origin !== null ? householdText(t, player, true) : null,
    player.bought ? t('games.promotion.full.boughtShort') : null,
    (player.titles ?? 0) > 0 ? t('games.promotion.full.titlesShort', { count: player.titles ?? 0 }) : null,
    player.status !== 'active' ? t(`games.promotion.full.status.${player.status}`) : null,
  ].filter(Boolean)
  const previous = useRef(money)
  const [delta, setDelta] = useState<{ amount: number; key: number } | null>(null)
  useEffect(() => {
    const change = money - previous.current
    previous.current = money
    if (change !== 0) setDelta((last) => ({ amount: change, key: (last?.key ?? 0) + 1 }))
  }, [money])

  return (
    <Chip
      type="button"
      $turn={turn}
      $done={player.status !== 'active'}
      aria-pressed={pressed}
      onClick={onClick}
      data-seat-chip={player.seat}
      data-status={player.status}
      title={`${name} · ${degreeText(t, player)}`}
    >
      <Avatar name={name} tint={seatColor(player.seat)} />
      <ChipText>
        <ChipName>{name}</ChipName>
        <ChipMeta>
          <Silver data-money={money}>{t('games.promotion.full.silver', { amount: money })}</Silver>
          {tags.length > 0 && ` · ${tags.join(' · ')}`}
        </ChipMeta>
      </ChipText>
      <svg viewBox="0 0 100 100" width={24} height={24} aria-hidden="true">
        {art && (
          <use
            href={fullArtHref(art)}
            style={knob ? ({ '--knob': promotionBoard.knob[knob] } as CSSProperties) : undefined}
          />
        )}
      </svg>
      {delta && (
        <Float key={delta.key} aria-hidden="true" $gain={delta.amount > 0}>
          {delta.amount > 0 ? `+${delta.amount}` : `−${-delta.amount}`}
        </Float>
      )}
    </Chip>
  )
}

function SoundButton() {
  const t = useT()
  const on = useSoundOn()
  return (
    <Button $variant="secondary" $size="sm" onClick={() => setSoundOn(!on)}>
      {t(on ? 'games.promotion.full.ui.soundOn' : 'games.promotion.full.ui.soundOff')}
    </Button>
  )
}

const Frame = styled.div<{ $immersed: boolean }>`
  ${(p) =>
    p.$immersed
      ? `
    position: fixed;
    inset: 0;
    z-index: 9;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(170px, 240px);
    gap: ${space.sm}px;
    /* Out from under the status bar, the notch and the home indicator (installed as an app) */
    padding: calc(${space.sm}px + env(safe-area-inset-top)) calc(${space.sm}px + env(safe-area-inset-right))
      calc(${space.sm}px + env(safe-area-inset-bottom)) calc(${space.sm}px + env(safe-area-inset-left));
    background: ${color.bg};

    @media (orientation: portrait) {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr) auto;
    }
  `
      : ''}
`

const Stage = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${space.sm}px;
  min-height: 0;
`

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
`

// A fixed height whatever the chips say: silver changing never moves what is under it
const SeatStrip = styled.div`
  flex: 1 1 260px;
  display: flex;
  gap: ${space.xs}px;
  min-width: 0;
  height: 56px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: ${space.xs}px;
  scrollbar-width: thin;
`

// One row, scrolling sideways on a narrow screen rather than wrapping into more: the board keeps the height
const Tools = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.xs}px;
  max-width: 100%;
  overflow-x: auto;
  scrollbar-width: none;

  & > * {
    flex: none;
  }
`

const Chip = styled.button<{ $turn: boolean; $done: boolean }>`
  position: relative;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  max-width: 200px;
  height: 46px;
  padding: 2px ${space.xs}px 2px 2px;
  background: ${color.surface};
  color: ${color.text};
  border: 1px ${(p) => (p.$done ? 'dashed' : 'solid')} ${color.border};
  outline: ${(p) => (p.$turn ? `2px solid ${color.text}` : 'none')};
  outline-offset: -1px;
  border-radius: 23px;
  font-family: inherit;
  font-size: ${fontSize.sm}px;
  font-weight: ${(p) => (p.$turn ? 600 : 400)};
  cursor: pointer;
`

const ChipText = styled.span`
  display: grid;
  min-width: 0;
  line-height: 1.15;
  text-align: left;
`

const ChipName = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`

const ChipMeta = styled.span`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: ${color.muted};
  font-size: 12px;
  font-weight: 400;
`

const Silver = styled.span`
  color: ${color.text};
  font-weight: 600;
  font-variant-numeric: tabular-nums;
`

const rise = keyframes`
  from {
    transform: translateY(4px);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  to {
    transform: translateY(-14px);
    opacity: 0;
  }
`

// Over the chip, never beside it: the strip keeps its size
const Float = styled.span<{ $gain: boolean }>`
  position: absolute;
  top: -2px;
  right: 30px;
  padding: 0 4px;
  border-radius: 4px;
  background: ${(p) => (p.$gain ? color.success : color.danger)};
  color: ${color.onSeat};
  font-size: 12px;
  font-weight: 700;
  pointer-events: none;
  opacity: 0;
  animation: ${rise} 1800ms ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Pot = styled.div`
  flex: none;
  display: grid;
  align-content: center;
  height: 46px;
  padding: 0 ${space.sm}px;
  border: 1px solid ${promotionBoard.gold};
  border-radius: ${radius.component}px;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
`

const PotLabel = styled.span`
  color: ${color.muted};
  font-size: 11px;
  white-space: nowrap;
`

const PotAmount = styled.span`
  font-weight: 700;
  font-size: ${fontSize.sm}px;
  white-space: nowrap;
`

const BoardArea = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
`

const Viewport = styled.div<{ $zoomed: boolean }>`
  position: absolute;
  inset: 0;
  display: flex;
  padding: ${BOARD_MARGIN}px;
  overflow: ${(p) => (p.$zoomed ? 'auto' : 'hidden')};
  touch-action: pan-x pan-y;
  background: ${color.bg};
  border-radius: ${radius.component}px;

  & > svg {
    margin: auto;
    flex: none;
  }
`

const Loading = styled.p`
  margin: auto;
  color: ${color.muted};
`

const slideIn = keyframes`
  from {
    transform: translateY(-8px);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
`

// The silver of a turn, over the top of the board while it plays: never in the page's flow
const Payments = styled.ul`
  position: absolute;
  top: ${space.md}px;
  left: 50%;
  z-index: 1;
  transform: translateX(-50%);
  display: grid;
  gap: 2px;
  width: max-content;
  max-width: calc(100% - ${2 * space.md}px);
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  list-style: none;
  background: ${color.surface};
  color: ${color.text};
  border: 2px solid ${promotionBoard.gold};
  border-radius: ${radius.card}px;
  font-size: ${fontSize.sm}px;
  pointer-events: none;
`

const Payment = styled.li`
  animation: ${slideIn} 300ms ease-out both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Ledger = styled.ul`
  margin: 0 0 ${space.md}px;
  padding-left: ${space.lg}px;
  font-variant-numeric: tabular-nums;
`

const Rail = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: ${space.md}px;
  min-width: 0;
  overflow-y: auto;

  /* The rail is narrow but tall: its buttons wrap, "Exit full screen" always in sight */
  & ${Tools} {
    flex-wrap: wrap;
    overflow: visible;
  }

  @media (orientation: portrait) {
    flex-direction: row;
    flex-wrap: wrap;
  }
`

const Tip = styled.p`
  display: none;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;

  @media (max-width: 599px) and (orientation: portrait) {
    display: block;
  }
`

// The whole width of the dock or the rail, whatever it says
const TurnPanel = styled.div`
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px ${space.md}px;
`

// Every line a fixed height, cut short rather than wrapped: no roll changes the dock's height, and so
// none refits the board (useBoardFit)
const TurnText = styled.div`
  flex: 1 1 100px;
  min-width: 0;
`

const MAIN_LINE = 22
const SMALL_LINE = 17

const oneLine = `
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`

const MainLine = styled.p`
  margin: 0;
  height: ${MAIN_LINE}px;
  line-height: ${MAIN_LINE}px;
  font-weight: 600;
  ${oneLine}
`

const SmallLine = styled.p`
  margin: 0;
  height: ${SMALL_LINE}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: ${SMALL_LINE}px;
  ${oneLine}
`

const RollLine = styled(SmallLine)`
  height: ${2 * SMALL_LINE}px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
  overflow-wrap: anywhere;
  color: ${color.text};
`

const RollButton = styled(Button)<{ $waiting: boolean }>`
  flex: none;
  min-width: 88px;
  opacity: ${(p) => (p.$waiting ? 0.5 : 1)};
  cursor: ${(p) => (p.$waiting ? 'not-allowed' : 'pointer')};

  &:hover:not(:disabled) {
    opacity: ${(p) => (p.$waiting ? 0.5 : 0.85)};
  }
`

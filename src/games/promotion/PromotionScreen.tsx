import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { getCell } from '../../../shared/games/promotion/board.ts'
import type { LastRoll, PromotionView } from '../../../shared/games/promotion/types.ts'
import type { Standing } from '../../../shared/games/types.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import type { Translate } from '../../i18n/t.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { initialOf } from '../../lib/avatar.ts'
import { playCue, setSoundOn, useSoundOn, useSoundUnlock } from '../../lib/sound.ts'
import { useReducedMotion } from '../../lib/useMediaQuery.ts'
import {
  color,
  fontSize,
  radius,
  seatColor,
  space,
} from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { loadBoardFont } from './boardFont.ts'
import { BOARD_LAYOUTS, CELL_WIDTH, fitBoard } from './boardLayout.ts'
import { CellDetail } from './CellDetail.tsx'
import { cellText, shortCellText } from './cellText.ts'
import { PromotionBoard, type BoardPiece, type PieceFlight } from './PromotionBoard.tsx'
import { artHref, knobStyle, rankArtOf } from './rankArt.ts'
import { RollDisplay } from './RollDisplay.tsx'
import { useBoardFit } from './useBoardFit.ts'
import { MIN_ZOOM, MAX_ZOOM, useBoardZoom } from './useBoardZoom.ts'
import { useImmersive } from './useImmersive.ts'
import { useRollPlayback } from './useRollPlayback.ts'

// Each player's way through the game, once it is over: out of the first screen
const SimpleRoutes = lazy(() => import('./SimpleRoutes.tsx'))

/** Below this many CSS pixels a cell is drawn dense: bigger names, seals without words */
const DENSE_CELL = 60
/** Room left round the board inside its box, for the focus ring of a cell at the edge */
const BOARD_MARGIN = 8

/** If the room never answers a roll, the button comes back after this */
const ROLL_ANSWER_MS = 4000


/**
 * The promotion game's screen (e3-t04, e3-t05, e3-t10). Rules stay on the server: this draws `view`.
 * The whole board, whose turn it is and the roll are on one screen without scrolling: the stage takes
 * the height the page leaves it, and the board the arrangement and size that fill it best. Full
 * screen puts the board on the whole screen with a rail for the turn.
 */
export default function PromotionScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const language = useLanguage()
  const state = game.view as unknown as PromotionView
  const reducedMotion = useReducedMotion()
  useEffect(loadBoardFont, [])
  const zoom = useBoardZoom()
  const { viewport, show, zoom: zoomLevel } = zoom

  const frame = useRef<HTMLDivElement>(null)
  const turnPanel = useRef<HTMLDivElement>(null)
  const immersive = useImmersive(frame)
  const immersed = immersive.mode !== 'off'
  const { stage: stageHeight, box, stageRef, boxRef } = useBoardFit(turnPanel, !immersed)
  // Until the box is measured (and in tests, where nothing is) the board on its side, as wide as it may
  const fit = box
    ? fitBoard(box.width - 2 * BOARD_MARGIN, box.height - 2 * BOARD_MARGIN)
    : { layout: BOARD_LAYOUTS.landscape, scale: 0 }
  const { layout } = fit
  const boardWidth = box ? `${layout.width * fit.scale * zoomLevel}px` : `${zoomLevel * 100}%`
  const dense = box !== null && CELL_WIDTH * fit.scale * zoomLevel < DENSE_CELL

  const [selected, setSelected] = useState<string | null>(null)
  // Stable, so that the board's memoised cells sit out a chat message or someone's move
  const toggleCell = useCallback(
    (cell: string) => setSelected((current) => (current === cell ? null : cell)),
    [],
  )
  const [asked, setAsked] = useState(false)
  useSoundUnlock()

  const { last, players } = state
  const playback = useRollPlayback(players, last, game.over, reducedMotion)
  const rolling = playback.stage === 'rolling'
  const playing = playback.stage !== 'idle'

  const members = Object.values(room.view.members)
  const seatHolder = (seat: number): RoomMember | undefined =>
    members.find((member) => member.seat === seat)
  const nameOf = (seat: number) =>
    seatHolder(seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  const pieces: BoardPiece[] = players.map((player) => {
    const holder = seatHolder(player.seat)
    return {
      seat: player.seat,
      // While the top spins the piece has not left yet
      cell: rolling && last?.seat === player.seat ? last.from : player.cell,
      mark: holder ? initialOf(holder.name) : String(player.seat + 1),
    }
  })
  const flight: PieceFlight | null =
    playback.stage === 'moving' && last && last.from !== last.to
      ? { seat: last.seat, from: last.from, to: last.to, demoted: last.face === 'zang' }
      : null

  // Until the piece lands the move is still the mover's
  const activeSeat = playing && last ? last.seat : state.turn
  const canRoll = game.legal.length > 0 && !playing && !asked

  // The button waits for the answer, so that a double tap is not refused with "not your turn"
  const answerKey = `${playback.count}:${state.turn}`
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

  // A chime when the wait is over, for someone looking away from the screen
  const yourTurn = game.legal.length > 0 && !playing
  const wasYourTurn = useRef(yourTurn)
  useEffect(() => {
    if (yourTurn && !wasYourTurn.current) playCue('turn')
    wasYourTurn.current = yourTurn
  }, [yourTurn])

  // When zoomed in, the board follows the piece
  const landing = flight?.to
  useEffect(() => {
    if (!landing || zoomLevel === MIN_ZOOM) return
    const cell = layout.byId.get(landing)
    if (cell) show((cell.x + cell.width / 2) / layout.width, (cell.y + cell.height / 2) / layout.height)
  }, [landing, zoomLevel, layout, show])

  // A seat's chip also brings its cell into sight when the board is zoomed in
  const showSeat = (cell: string) => {
    toggleCell(cell)
    viewport.current
      ?.querySelector(`[data-cell="${cell}"]`)
      ?.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  const roll = () => {
    if (!canRoll) return
    setAsked(true)
    room.act({ type: 'roll' })
  }

  // What the board marks unless asked about another cell: where you stand, or for a spectator where
  // the one to move stands. Its details open only when asked for, over the board
  const ownCell = players.find((player) => player.seat === state.you)?.cell
  const moverCell =
    players.find((player) => player.seat === activeSeat)?.cell ?? last?.to ?? players[0]?.cell
  const markedCell = selected ?? ownCell ?? moverCell

  const officeOf = (seat: number | null) => {
    const player = players.find((candidate) => candidate.seat === seat)
    if (!player) return null
    const rank = t(`games.promotion.rank.${getCell(player.cell).rank}`)
    return `${cellText(t, player.cell)} · ${rank}`
  }
  const seatDetail = (member: RoomMember) => officeOf(member.seat)
  // `score` is how senior they ended up, 0 to 24, not points: the office says it in words
  const resultDetail = (standing: Standing) => officeOf(standing.seat)

  // Reaching the end wins outright; at the round limit there can be a tie at the top
  const topSeats = game.result?.standings.filter((standing) => standing.rank === 1) ?? []
  const resultHeadline =
    state.winner !== null
      ? t('games.promotion.ui.winner', { name: nameOf(state.winner) })
      : t('games.promotion.ui.mostSenior', {
          names: new Intl.ListFormat(language).format(
            topSeats.map((standing) => nameOf(standing.seat)),
          ),
        })

  // The whole sentence stays in the page for a screen reader and on hover, however it is cut short
  const sentence = !rolling && last ? rollSentence(t, last, nameOf(last.seat)) : ''
  const turn = (
    <TurnPanel ref={turnPanel}>
      <RollDisplay kind={state.dice} roll={last} rolling={rolling} />
      <TurnText>
        <TurnLine
          state={state}
          over={game.over}
          yourTurn={yourTurn}
          nameOf={nameOf}
          rolling={rolling}
        />
        {/* Two lines kept for it whether or not there is a roll to tell: the dock never changes height */}
        <RollLine role="status" title={sentence || undefined}>
          {sentence}
        </RollLine>
        <SmallText>
          {t('games.promotion.ui.round', { round: state.round, limit: state.turnLimit })}
        </SmallText>
      </TurnText>
      {state.you !== null && !game.over && (
        <RollButton aria-disabled={!canRoll} $waiting={!canRoll} onClick={roll}>
          {t('games.promotion.ui.roll')}
        </RollButton>
      )}
    </TurnPanel>
  )

  const zoomButtons = (
    <>
      <Button
        $variant="secondary"
        $size="sm"
        aria-label={t('games.promotion.ui.zoomOut')}
        disabled={zoom.zoom <= MIN_ZOOM}
        onClick={zoom.zoomOut}
      >
        −
      </Button>
      <Button
        $variant="secondary"
        $size="sm"
        aria-label={t('games.promotion.ui.zoomIn')}
        disabled={zoom.zoom >= MAX_ZOOM}
        onClick={zoom.zoomIn}
      >
        +
      </Button>
      <Button $variant="secondary" $size="sm" disabled={zoom.zoom === MIN_ZOOM} onClick={zoom.reset}>
        {t('games.promotion.ui.zoomFit')}
      </Button>
    </>
  )

  return (
    <GameLayout
      room={room}
      turnSeat={activeSeat}
      seatDetail={seatDetail}
      seatTint
      resultHeadline={resultHeadline}
      resultDetail={resultDetail}
      resultHeld={playing}
      resultExtra={
        game.over ? (
          <Suspense fallback={null}>
            <SimpleRoutes players={players} nameOf={nameOf} />
          </Suspense>
        ) : undefined
      }
      // Full screen has its own in the rail beside the board: one roll button at a time
      dock={immersed ? undefined : turn}
    >
      <Frame ref={frame} $immersed={immersed} data-immersion={immersive.mode}>
        <Stage
          ref={stageRef}
          data-fit-screen=""
          style={!immersed && stageHeight !== null ? { height: stageHeight } : undefined}
        >
          {!immersed && (
            <Toolbar>
              <SeatStrip aria-label={t('games.promotion.ui.seats')}>
                {players.map((player) => (
                  <SeatChip
                    key={player.seat}
                    type="button"
                    $turn={player.seat === activeSeat}
                    aria-pressed={selected === player.cell}
                    onClick={() => showSeat(player.cell)}
                  >
                    <Avatar name={nameOf(player.seat)} tint={seatColor(player.seat)} />
                    <ChipName>{nameOf(player.seat)}</ChipName>
                    {/* Their stage of career at a glance: the hat of their cell's watermark */}
                    <svg viewBox="0 0 100 100" width={26} height={26} aria-hidden="true">
                      <use
                        href={artHref(rankArtOf(player.cell) ?? 'court')}
                        style={knobStyle(getCell(player.cell).rank)}
                      />
                    </svg>
                  </SeatChip>
                ))}
              </SeatStrip>
              <Tools>
                {zoomButtons}
                <Button $variant="secondary" $size="sm" onClick={() => void immersive.enter()}>
                  {t('games.promotion.ui.fullscreen')}
                </Button>
                <SoundButton />
              </Tools>
            </Toolbar>
          )}

          <BoardArea ref={boxRef}>
            <Viewport ref={viewport} $zoomed={zoom.zoom > MIN_ZOOM}>
              <PromotionBoard
                layout={layout}
                pieces={pieces}
                activeSeat={activeSeat}
                selected={markedCell ?? null}
                onSelect={toggleCell}
                flight={flight}
                reducedMotion={reducedMotion}
                width={boardWidth}
                dense={dense}
              />
            </Viewport>
            <CellDetail id={selected} onClose={() => setSelected(null)} />
          </BoardArea>

          {/* On a phone held upright the names are small: the board is biggest on its side */}
          {!immersed && <Tip>{t('games.promotion.ui.sidewaysTip')}</Tip>}
        </Stage>

        {immersed && (
          <Rail>
            {turn}
            <Tools>
              {zoomButtons}
              <Button $variant="secondary" $size="sm" onClick={immersive.exit}>
                {t('games.promotion.ui.exitFullscreen')}
              </Button>
            </Tools>
          </Rail>
        )}
      </Frame>
    </GameLayout>
  )
}

function TurnLine({
  state,
  over,
  yourTurn,
  nameOf,
  rolling,
}: {
  state: PromotionView
  over: boolean
  yourTurn: boolean
  nameOf(seat: number): string
  rolling: boolean
}) {
  const t = useT()
  const { last, turn, winner, you } = state
  let text: string
  if (rolling && last) text = t('games.promotion.ui.rolling', { name: nameOf(last.seat) })
  else if (over) {
    text =
      winner !== null
        ? t('games.promotion.ui.winner', { name: nameOf(winner) })
        : t('games.promotion.ui.gameOver')
  } else if (yourTurn) text = t('games.promotion.ui.yourTurn')
  else if (turn !== null) text = t('games.promotion.ui.turnOf', { name: nameOf(turn) })
  else text = t('games.promotion.ui.gameOver')
  return (
    <>
      <MainLine>{text}</MainLine>
      {you === null && !over && <SmallText>{t('room.spectating')}</SmallText>}
    </>
  )
}

function rollSentence(t: Translate, last: LastRoll, name: string): string {
  const face = t(`games.promotion.face.${last.face}`)
  const from = shortCellText(t, last.from)
  if (last.from === last.to) return t('games.promotion.ui.rolledStayed', { name, face, from })
  return t('games.promotion.ui.rolled', { name, face, from, to: shortCellText(t, last.to) })
}

function SoundButton() {
  const t = useT()
  const on = useSoundOn()
  return (
    <Button $variant="secondary" $size="sm" onClick={() => setSoundOn(!on)}>
      {t(on ? 'games.promotion.ui.soundOn' : 'games.promotion.ui.soundOff')}
    </Button>
  )
}

// Full screen and focus mode are the same layout: the frame over the whole screen, the board beside
// a rail (below it when the screen stands upright). Focus mode is what a browser without the
// Fullscreen API gets, the page's chrome covered instead of the browser's
const Frame = styled.div<{ $immersed: boolean }>`
  ${(p) =>
    p.$immersed
      ? `
    position: fixed;
    inset: 0;
    z-index: 9;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(150px, 220px);
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

const SeatStrip = styled.div`
  flex: 1 1 200px;
  display: flex;
  gap: ${space.xs}px;
  min-width: 0;
  overflow-x: auto;
  /* Room for the focus ring, which this scrolling strip would otherwise cut off */
  padding: ${space.xs}px;
`

const Tools = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px;
`

// Whose turn is told by the thick outline, not only by which colour it is
const SeatChip = styled.button<{ $turn: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  max-width: 160px;
  min-height: 36px;
  padding: 2px ${space.xs}px 2px 2px;

  @media (pointer: coarse) {
    min-height: 44px;
  }

  background: ${color.surface};
  color: ${color.text};
  border: 1px solid ${color.border};
  outline: ${(p) => (p.$turn ? `2px solid ${color.text}` : 'none')};
  outline-offset: -1px;
  border-radius: 18px;
  font-family: inherit;
  font-size: ${fontSize.sm}px;
  font-weight: ${(p) => (p.$turn ? 600 : 400)};
  cursor: pointer;
`

const ChipName = styled.span`
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
`


// The board's box: whatever height the stage has left. The details float over it
const BoardArea = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
`

// One finger scrolls a zoomed board, two are ours (useBoardZoom). Auto margins centre the board
// without cutting off the top or left of a zoomed one
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

// Beside the board in full screen, or under it on a screen standing upright: what wraps, wraps
const Rail = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  gap: ${space.md}px;
  min-width: 0;
  overflow-y: auto;
`

// Only on a phone held upright, where the board is at its smallest (e3-t10)
const Tip = styled.p`
  display: none;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;

  @media (max-width: 599px) and (orientation: portrait) {
    display: block;
  }
`




// The whole width of the dock or the rail, whatever it says: a panel as wide as its words would
// rearrange itself as they change
const TurnPanel = styled.div`
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px ${space.md}px;
`

// Wraps under the top in the narrow rail of full screen, rather than squeeze into a column. Every line
// has a fixed height and cuts what does not fit short, so that no roll, turn or name changes the dock's
// height: the board's room is what the dock leaves (useBoardFit), and a dock that grew by a line on
// one roll and shrank on the next refitted the board each time (the screen jumped on phones)
const TurnText = styled.div`
  flex: 1 1 140px;
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

const SmallText = styled.p`
  margin: 0;
  height: ${SMALL_LINE}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: ${SMALL_LINE}px;
  ${oneLine}
`

// The roll's sentence: up to two lines, an ellipsis after that, and the two lines kept while empty
const RollLine = styled(SmallText)`
  height: ${2 * SMALL_LINE}px;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  white-space: normal;
  overflow-wrap: anywhere;
`

// aria-disabled, not disabled: focus stays on the button through the other players' turns
const RollButton = styled(Button)<{ $waiting: boolean }>`
  flex: none;
  min-width: 88px;
  opacity: ${(p) => (p.$waiting ? 0.5 : 1)};
  cursor: ${(p) => (p.$waiting ? 'not-allowed' : 'pointer')};

  &:hover:not(:disabled) {
    opacity: ${(p) => (p.$waiting ? 0.5 : 0.85)};
  }
`

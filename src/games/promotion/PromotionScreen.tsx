import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { FACES, getCell } from '../../../shared/games/promotion/board.ts'
import type { LastRoll, PromotionView } from '../../../shared/games/promotion/types.ts'
import type { Standing } from '../../../shared/games/types.ts'
import type { RoomMember } from '../../../shared/protocol.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { Muted } from '../../components/roomParts.ts'
import type { Translate } from '../../i18n/t.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { initialOf } from '../../lib/avatar.ts'
import { playCue, setSoundOn, useSoundOn, useSoundUnlock } from '../../lib/sound.ts'
import { useCompact, useMediaQuery, useReducedMotion } from '../../lib/useMediaQuery.ts'
import { color, fontSize, radius, seatColor, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { BOARD_LAYOUTS } from './boardLayout.ts'
import { PromotionBoard, type BoardPiece, type PieceFlight } from './PromotionBoard.tsx'
import { RollDisplay } from './RollDisplay.tsx'
import { MIN_ZOOM, MAX_ZOOM, useBoardZoom } from './useBoardZoom.ts'
import { useRollPlayback } from './useRollPlayback.ts'

/** If the room never answers a roll, the button comes back after this */
const ROLL_ANSWER_MS = 4000

const cellText = (t: Translate, id: string) => t(`games.promotion.cell.${id}`)
/** "Juren (Provincial Graduate)" as "Juren", where a sentence has no room for the gloss */
const shortCellText = (t: Translate, id: string) => cellText(t, id).split(' (')[0]

/** The promotion game's screen (e3-t04, e3-t05). Rules stay on the server: this draws `view` */
export default function PromotionScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const language = useLanguage()
  const state = game.view as unknown as PromotionView
  const reducedMotion = useReducedMotion()
  const compact = useCompact()
  const portrait = useMediaQuery('(orientation: portrait)')
  const layout = BOARD_LAYOUTS[compact && portrait ? 'portrait' : 'landscape']
  const zoom = useBoardZoom()
  const { viewport, show, zoom: zoomLevel } = zoom
  const [selected, setSelected] = useState<string | null>(null)
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
    const box = layout.byId.get(landing)
    if (box) show((box.x + box.width / 2) / layout.width, (box.y + box.height / 2) / layout.height)
  }, [landing, zoomLevel, layout, show])

  const roll = () => {
    if (!canRoll) return
    setAsked(true)
    room.act({ type: 'roll' })
  }

  const moverCell =
    players.find((player) => player.seat === activeSeat)?.cell ?? last?.to ?? players[0]?.cell
  const detailCell = selected ?? moverCell

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

  return (
    <GameLayout
      room={room}
      turnSeat={activeSeat}
      seatDetail={seatDetail}
      seatTint
      resultHeadline={resultHeadline}
      resultDetail={resultDetail}
      resultHeld={playing}
      dock={
        <TurnPanel>
          <RollDisplay kind={state.dice} shown={rolling ? null : last} rolling={rolling} />
          <TurnText>
            <TurnLine
              state={state}
              over={game.over}
              yourTurn={yourTurn}
              nameOf={nameOf}
              rolling={rolling}
            />
            <SmallText role="status">
              {!rolling && last ? rollSentence(t, last, nameOf(last.seat)) : ''}
            </SmallText>
          </TurnText>
          {state.you !== null && !game.over && (
            <RollButton aria-disabled={!canRoll} $waiting={!canRoll} onClick={roll}>
              {t('games.promotion.ui.roll')}
            </RollButton>
          )}
        </TurnPanel>
      }
    >
      <Stage>
        <SeatStrip aria-label={t('games.promotion.ui.seats')}>
          {players.map((player) => (
            <SeatChip
              key={player.seat}
              type="button"
              $turn={player.seat === activeSeat}
              aria-pressed={selected === player.cell}
              onClick={() => setSelected(selected === player.cell ? null : player.cell)}
            >
              <Avatar name={nameOf(player.seat)} tint={seatColor(player.seat)} />
              <ChipName>{nameOf(player.seat)}</ChipName>
            </SeatChip>
          ))}
        </SeatStrip>

        <Viewport
          ref={viewport}
          $zoomed={zoom.zoom > MIN_ZOOM}
          $narrow={layout.shape === 'portrait'}
        >
          <PromotionBoard
            layout={layout}
            pieces={pieces}
            activeSeat={activeSeat}
            selected={detailCell ?? null}
            onSelect={(cell) => setSelected(selected === cell ? null : cell)}
            flight={flight}
            reducedMotion={reducedMotion}
            zoom={zoom.zoom}
          />
        </Viewport>

        <Toolbar>
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
          <Button
            $variant="secondary"
            $size="sm"
            disabled={zoom.zoom === MIN_ZOOM}
            onClick={zoom.reset}
          >
            {t('games.promotion.ui.zoomFit')}
          </Button>
          <SoundButton />
          <RoundText>
            {t('games.promotion.ui.round', { round: state.round, limit: state.turnLimit })}
          </RoundText>
        </Toolbar>

        {detailCell && <CellDetail id={detailCell} />}
        <Muted>{t('games.promotion.simplified')}</Muted>
      </Stage>
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

/** One cell in words: its full name, grade and where each result leads from it */
function CellDetail({ id }: { id: string }) {
  const t = useT()
  const cell = getCell(id)
  return (
    <Detail>
      <DetailTitle>
        {cellText(t, id)} · {t(`games.promotion.rank.${cell.rank}`)}
      </DetailTitle>
      <Moves>
        {FACES.map((face) => (
          <div key={face}>
            <dt>{t(`games.promotion.face.${face}`)}</dt>
            <dd>{shortCellText(t, cell.moves[face])}</dd>
          </div>
        ))}
      </Moves>
    </Detail>
  )
}

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.sm}px;
`

const SeatStrip = styled.div`
  display: flex;
  gap: ${space.xs}px;
  overflow-x: auto;
  padding: 2px;
`

// Whose turn is told by the thick outline, not only by which colour it is
const SeatChip = styled.button<{ $turn: boolean }>`
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  max-width: 140px;
  min-height: 36px;
  padding: 2px ${space.sm}px 2px 2px;
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

// One finger scrolls, two are ours (useBoardZoom). A tablet's portrait board stops growing at a size
// a person can still see all of
const Viewport = styled.div<{ $zoomed: boolean; $narrow: boolean }>`
  width: 100%;
  max-width: ${(p) => (p.$narrow ? '560px' : 'none')};
  max-height: ${(p) => (p.$zoomed ? '75dvh' : 'none')};
  justify-self: center;
  overflow: ${(p) => (p.$zoomed ? 'auto' : 'hidden')};
  touch-action: pan-x pan-y;
  background: ${color.bg};
  border-radius: ${radius.component}px;
`

const Toolbar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px;
`

const RoundText = styled.span`
  margin-left: auto;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Detail = styled.section`
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
  font-size: ${fontSize.sm}px;
`

const DetailTitle = styled.h3`
  margin: 0;
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

const Moves = styled.dl`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0 ${space.md}px;
  margin: 0;

  & > div {
    display: flex;
    gap: ${space.sm}px;
  }

  & dt {
    color: ${color.muted};
  }

  & dd {
    margin: 0;
  }
`

const TurnPanel = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
`

const TurnText = styled.div`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
`

const MainLine = styled.p`
  margin: 0;
  font-weight: 600;
`

const SmallText = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;

  &:empty {
    display: none;
  }
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

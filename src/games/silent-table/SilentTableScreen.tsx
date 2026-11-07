import { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import { silentTableScreenMessages } from '../../../shared/games/silent-table/i18n.screen.ts'
import { ROUNDS } from '../../../shared/games/silent-table/rules.ts'
import type {
  SilentTableAction,
  SilentTablePlayerView,
  SilentTableSkin,
  SilentTableView,
} from '../../../shared/games/silent-table/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { addGameMessages, type Translate } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { useReducedMotion } from '../../lib/useMediaQuery.ts'
import { color, fontSize, radius, seatColor, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { ChipMark, ChipRail } from './ChipRail.tsx'
import { tableNews, type TableNews } from './news.ts'
import { CardBack, CardFace, CardSlot } from './PlayingCard.tsx'
import { RevealPanel } from './RevealPanel.tsx'
import { useRevealPlayback } from './useRevealPlayback.ts'

addGameMessages(silentTableScreenMessages)

/** If the room never answers "ready", the button comes back after this */
const READY_ANSWER_MS = 4000
const SHARED_CARDS = 5

const FELT: Record<SilentTableSkin, string> = {
  plain: color.feltPlain,
  diving: color.feltDiving,
  climbing: color.feltClimbing,
}

/** The chips held so far this level, a seat's trail: "2 → 3" */
const trail = (t: Translate, history: readonly number[]) =>
  history.length > 0
    ? t('games.silent-table.ui.earlier', { chips: history.join(' → ') })
    : ''

/** Silent Table's screen (e4-t04, e4-t05, e4-t06). Rules stay on the server: this draws `view` */
export default function SilentTableScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const state = game.view as unknown as SilentTableView
  const legal = game.legal as unknown as SilentTableAction[]
  const reducedMotion = useReducedMotion()
  // A game from before skins were an option has none
  const skin: SilentTableSkin = state.skin ?? 'plain'
  const felt = FELT[skin] ?? FELT.plain

  const members = Object.values(room.view.members)
  const nameOf = (seat: number) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  const { reveal, phase, players, you } = state
  const { shown, playing } = useRevealPlayback(
    reveal ? String(state.level) : null,
    reveal?.seats.length ?? 0,
    reducedMotion,
  )

  const me = players.find((player) => player.seat === you) ?? null
  const others = players.filter((player) => player.seat !== you)
  const readyCount = players.filter((player) => player.ready).length

  // The button waits for the answer, so that a double tap is not refused with "already ready"
  const legalKey = JSON.stringify(game.legal)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === legalKey
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), READY_ANSWER_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const canReady = legal.some((action) => action.type === 'ready') && !asked && !playing
  const ready = () => {
    if (!canReady) return
    setAskedAt(legalKey)
    room.act({ type: 'ready' })
  }

  const previous = useRef(state)
  const [news, setNews] = useState<TableNews | null>(null)
  useEffect(() => {
    const happened = tableNews(previous.current, state)
    previous.current = state
    if (happened) setNews(happened)
  }, [state])

  const headline = t(
    state.ending === 'won' ? 'games.silent-table.ui.won' : 'games.silent-table.ui.lost',
  )

  return (
    <GameLayout
      room={room}
      seatTint
      resultHeadline={headline}
      resultUnranked
      resultHeld={playing}
      dock={
        <DockRow>
          <DockText>
            <MainLine>
              <Prompt state={state} me={me} over={game.over} headline={headline} playing={playing} />
            </MainLine>
            {you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
            <SmallLine>
              {!game.over &&
                t('games.silent-table.ui.readyCount', {
                  ready: readyCount,
                  total: players.length,
                })}
            </SmallLine>
          </DockText>
          {you !== null && !game.over && (
            <ReadyButton aria-disabled={!canReady} $waiting={!canReady} onClick={ready}>
              {t(
                phase === 'reveal'
                  ? 'games.silent-table.ui.nextLevel'
                  : 'games.silent-table.ui.ready',
              )}
            </ReadyButton>
          )}
        </DockRow>
      }
    >
      <Stage>
        <Felt data-skin={skin} style={{ background: felt }}>
          <Motif skin={skin} />
          <Progress state={state} />
          {/* While it counts, a phone has no line to spare for scenery */}
          {game.chatLocked ? (
            <Notice>{t('games.silent-table.ui.noTalking')}</Notice>
          ) : (
            <Tagline>{t(`games.silent-table.ui.skin.${skin}`)}</Tagline>
          )}

          <Shared role="group" aria-label={t('games.silent-table.ui.sharedCards')}>
            {Array.from({ length: SHARED_CARDS }, (_, index) => {
              const card = state.community[index]
              return card ? <CardFace key={card} card={card} /> : <CardSlot key={`slot-${index}`} />
            })}
          </Shared>

          {phase === 'round' && (
            <>
              {me && <YourSeat player={me} skin={skin} felt={felt} />}
              <ChipRail
                players={players}
                you={you}
                legal={legal}
                nameOf={nameOf}
                onAct={(action) => room.act(action)}
              />
            </>
          )}
        </Felt>

        {/* Said out loud and on screen: with no talking, this is how a move gets noticed */}
        <NewsLine role="status">
          {news && phase === 'round' && <NewsText news={news} you={you} nameOf={nameOf} />}
        </NewsLine>

        {reveal && (
          <RevealPanel
            reveal={reveal}
            players={players}
            shown={shown}
            skin={skin}
            felt={felt}
            nameOf={nameOf}
          />
        )}

        {phase === 'round' && (
          <SeatList aria-label={t('games.silent-table.ui.seats')}>
            {others.map((player) => (
              <SeatRow
                key={player.seat}
                player={player}
                name={nameOf(player.seat)}
                skin={skin}
                felt={felt}
              />
            ))}
          </SeatList>
        )}
      </Stage>
    </GameLayout>
  )
}

function Prompt({
  state,
  me,
  over,
  headline,
  playing,
}: {
  state: SilentTableView
  me: SilentTablePlayerView | null
  over: boolean
  headline: string
  playing: boolean
}) {
  const t = useT()
  if (state.phase === 'reveal' || over) {
    if (playing) return <>{t('games.silent-table.ui.revealHeading')}</>
    if (over) return <>{headline}</>
    return <>{t('games.silent-table.ui.promptReveal')}</>
  }
  if (!me) return <>{t('games.silent-table.ui.level', { level: state.level })}</>
  if (me.chip === null) return <>{t('games.silent-table.ui.promptTake')}</>
  if (!me.ready) return <>{t('games.silent-table.ui.promptReady')}</>
  return <>{t('games.silent-table.ui.promptWait')}</>
}

function NewsText({
  news,
  you,
  nameOf,
}: {
  news: TableNews
  you: number | null
  nameOf(seat: number): string
}) {
  const t = useT()
  if (news.kind === 'level') return <>{t('games.silent-table.ui.news.level', { level: news.level })}</>
  if (news.kind === 'round') return <>{t('games.silent-table.ui.news.round', { round: news.round })}</>
  const { seat, chip, from } = news
  const name = nameOf(seat)
  if (from === null) return <>{t('games.silent-table.ui.news.took', { name, chip })}</>
  if (from === you) return <>{t('games.silent-table.ui.news.tookYours', { name, chip })}</>
  return <>{t('games.silent-table.ui.news.tookFrom', { name, chip, from: nameOf(from) })}</>
}

/** Which level and round this is, and how far the table is from either end of the game */
function Progress({ state }: { state: SilentTableView }) {
  const t = useT()
  return (
    <ProgressBar>
      <strong>{t('games.silent-table.ui.level', { level: state.level })}</strong>
      {state.phase === 'round' && (
        <span>{t('games.silent-table.ui.round', { round: state.round, rounds: ROUNDS })}</span>
      )}
      <Pips
        label={t('games.silent-table.ui.streak', {
          streak: state.streak,
          levels: state.levelsToWin,
        })}
        filled={state.streak}
        total={state.levelsToWin}
      />
      <Pips
        label={t('games.silent-table.ui.failures', {
          failures: state.failures,
          limit: state.failureLimit,
        })}
        filled={state.failures}
        total={state.failureLimit}
        crossed
      />
    </ProgressBar>
  )
}

function Pips({
  label,
  filled,
  total,
  crossed,
}: {
  label: string
  filled: number
  total: number
  crossed?: boolean
}) {
  return (
    <PipGroup>
      <span>{label}</span>
      <svg width={total * 12} height="10" viewBox={`0 0 ${total * 12} 10`} aria-hidden="true">
        {Array.from({ length: total }, (_, index) => {
          const x = index * 12 + 5
          const on = index < filled
          return crossed && on ? (
            <path
              key={index}
              d={`M${x - 4} 1l8 8m0-8l-8 8`}
              stroke={color.onFelt}
              strokeWidth="2"
            />
          ) : (
            <circle
              key={index}
              cx={x}
              cy="5"
              r="4"
              fill={on ? color.onFelt : 'none'}
              stroke={color.onFelt}
            />
          )
        })}
      </svg>
    </PipGroup>
  )
}

/** A line of scenery along the bottom of the table, for the themed skins */
function Motif({ skin }: { skin: SilentTableSkin }) {
  if (skin === 'plain') return null
  const line =
    skin === 'diving'
      ? 'M0 30q25-20 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0'
      : 'M0 40 60 8l40 24 50-30 60 34 50-20 60 26 40-18 40 16'
  return (
    <MotifSvg viewBox="0 0 400 44" preserveAspectRatio="none" aria-hidden="true">
      <path d={line} fill="none" stroke={color.onFelt} strokeWidth="2" />
    </MotifSvg>
  )
}

function YourSeat({
  player,
  skin,
  felt,
}: {
  player: SilentTablePlayerView
  skin: SilentTableSkin
  felt: string
}) {
  const t = useT()
  const earlier = trail(t, player.history)
  return (
    <Yours>
      <Cards role="group" aria-label={t('games.silent-table.ui.yourCards')}>
        {player.hole
          ? player.hole.map((card) => <CardFace key={card} card={card} />)
          : [0, 1].map((index) => <CardBack key={index} skin={skin} felt={felt} />)}
      </Cards>
      <YourFacts>
        <strong>
          {player.chip !== null
            ? t('games.silent-table.ui.seatChip', { chip: player.chip })
            : t('games.silent-table.ui.seatNoChip')}
        </strong>
        <span>{t('games.silent-table.ui.movesLeft', { moves: player.movesLeft })}</span>
        {earlier && <span>{earlier}</span>}
      </YourFacts>
    </Yours>
  )
}

function SeatRow({
  player,
  name,
  skin,
  felt,
}: {
  player: SilentTablePlayerView
  name: string
  skin: SilentTableSkin
  felt: string
}) {
  const t = useT()
  const earlier = trail(t, player.history)
  const chipText =
    player.chip !== null
      ? t('games.silent-table.ui.seatChip', { chip: player.chip })
      : t('games.silent-table.ui.seatNoChip')
  const standing =
    player.chip === null
      ? ''
      : t(player.ready ? 'games.silent-table.ui.seatReady' : 'games.silent-table.ui.seatDeciding')
  return (
    <SeatItem $ready={player.ready}>
      <Avatar name={name} tint={seatColor(player.seat)} />
      <SeatWho>
        <SeatName>{name}</SeatName>
        <SeatFacts>{[chipText, standing, earlier].filter(Boolean).join(' · ')}</SeatFacts>
      </SeatWho>
      <Cards>
        {player.hole
          ? player.hole.map((card) => <CardFace key={card} card={card} size="small" />)
          : [0, 1].map((index) => <CardBack key={index} skin={skin} felt={felt} size="small" />)}
      </Cards>
      <ChipMark chip={player.chip} seat={player.seat} />
    </SeatItem>
  )
}

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.sm}px;
`

// The ring around whatever has the focus has to show on the felt too
const Felt = styled.div`
  --color-accent: ${color.onFelt};
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.sm}px;
  padding: ${space.md}px;
  color: ${color.onFelt};
  border-radius: ${radius.card}px;

  & > * {
    position: relative;
  }
`

const MotifSvg = styled.svg`
  && {
    position: absolute;
  }
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  height: 44px;
  opacity: 0.25;
  pointer-events: none;
`

const ProgressBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.md}px;
  font-size: ${fontSize.sm}px;
`

const PipGroup = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;

  /* The numbers say the same, and a phone has one line for all of this */
  @media (max-width: 899px) {
    & > svg {
      display: none;
    }
  }
`

const Tagline = styled.p`
  margin: 0;
  font-size: ${fontSize.sm}px;
  font-style: italic;
`

const Notice = styled.p`
  margin: 0;
  font-weight: 600;
`

const Shared = styled.div`
  display: flex;
  justify-content: center;
  gap: ${space.xs}px;
  padding: ${space.xs}px 0;
`

const Yours = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
`

const Cards = styled.div`
  flex: none;
  display: flex;
  gap: ${space.xs}px;
`

const YourFacts = styled.div`
  min-width: 0;
  display: grid;
  font-size: ${fontSize.sm}px;
  line-height: 1.4;
  overflow-wrap: anywhere;

  & > strong {
    font-size: ${fontSize.md}px;
  }
`

const NewsLine = styled.p`
  margin: 0;
  min-height: 1.5em;
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

const SeatList = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

// Ready is told by the word as well as by the outline
const SeatItem = styled.li<{ $ready: boolean }>`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.xs}px ${space.sm}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  outline: ${(p) => (p.$ready ? `2px solid ${color.success}` : 'none')};
  outline-offset: -1px;
  border-radius: ${radius.component}px;
`

const SeatWho = styled.div`
  flex: 1;
  min-width: 0;
`

const SeatName = styled.div`
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-weight: 600;
`

const SeatFacts = styled.div`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const DockRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
`

const DockText = styled.div`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
`

const MainLine = styled.p`
  margin: 0;
  font-weight: 600;
  line-height: 1.3;
`

const SmallLine = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;

  &:empty {
    display: none;
  }
`

// aria-disabled, not disabled: focus stays on the button while the round goes on
const ReadyButton = styled(Button)<{ $waiting: boolean }>`
  flex: none;
  min-width: 96px;
  opacity: ${(p) => (p.$waiting ? 0.5 : 1)};
  cursor: ${(p) => (p.$waiting ? 'not-allowed' : 'pointer')};

  &:hover:not(:disabled) {
    opacity: ${(p) => (p.$waiting ? 0.5 : 0.85)};
  }
`

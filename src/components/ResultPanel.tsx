import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import styled, { keyframes } from 'styled-components'
import type { GameResult, Standing } from '../../shared/games/types.ts'
import type { RoomView } from '../../shared/protocol.ts'
import type { TextKey } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { memberName } from '../lib/memberName.ts'
import { Link } from '../lib/router.tsx'
import { useReducedMotion } from '../lib/useMediaQuery.ts'
import { clippedFill, cornerClip, displayType, glass, slantClip } from '../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../styles/tokens.ts'
import { Avatar } from './Avatar.tsx'
import { HostEndedActions } from './HostControls.tsx'
import { List, Muted, seatedMembers } from './roomParts.ts'

export interface ResultPanelProps {
  view: RoomView
  you: string
  result: GameResult
  /** The game's own line on who came out on top: it alone knows how to say that */
  headline?: ReactNode
  /** What the game says of a seat's standing. Without it a game's score, if it keeps one, shows */
  detail?(standing: Standing): ReactNode
  /** Everyone shares the outcome, as in a co-operative game: "1st" for all of them would say nothing */
  unranked?: boolean
  /** What the game shows under the standings, such as each player's way through it */
  extra?: ReactNode
  onRematch(): void
  onReopen(): void
  onDissolve(): void
  /** The lobby link leaves the room on purpose (shared/protocol.ts 17.); absent in a replay */
  onLeave?(): void
}

/** How a game ended, for any game (e2-t06): standings, then what comes next */
export function ResultPanel({
  view,
  you,
  result,
  headline,
  detail,
  unranked,
  extra,
  onRematch,
  onReopen,
  onDissolve,
  onLeave,
}: ResultPanelProps) {
  const t = useT()
  const seated = seatedMembers(view)
  const isHost = view.members[you]?.host === true
  const reducedMotion = useReducedMotion()

  // On a phone the last roll was watched further down the page than this
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    // Its top, who won: `nearest` lines up the bottom of a panel taller than a phone's screen
    panel.current?.scrollIntoView?.({
      block: 'start',
      behavior: reducedMotion ? 'auto' : 'smooth',
    })
    // Once, when the result first shows
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Panel ref={panel} aria-label={t('room.result.heading')}>
      <Kicker>{t('room.result.final')}</Kicker>
      <Title>{t('room.result.heading')}</Title>
      {headline && <Headline>{headline}</Headline>}
      <Muted>{t(result.summary.key as TextKey, result.summary.params)}</Muted>

      <List as="ol">
        {result.standings.map((standing, order) => {
          const member = seated.find((candidate) => candidate.seat === standing.seat)
          // Whoever left since the game ended still has their place in it
          const name = member
            ? memberName(member, view.room.gameId)
            : t('room.waiting.seat', { seat: standing.seat + 1 })
          const delay = Math.min(order, 8) * 90
          // A game's own words for a standing, or its score counting up as the row slides in
          const extra =
            detail?.(standing) ??
            (standing.score !== null ? <CountUp score={standing.score} delay={delay} /> : null)
          return (
            <StandingRow
              key={standing.seat}
              $top={!unranked && standing.rank === 1}
              style={{ animationDelay: `${delay}ms` }}
            >
              {!unranked && (
                <Place $top={standing.rank === 1}>
                  {t('room.result.place', { rank: standing.rank })}
                </Place>
              )}
              <Avatar
                name={name}
                tint={seatColor(standing.seat)}
                size={!unranked && standing.rank === 1 ? 44 : 30}
              />
              <Who>
                <Name>
                  {name}
                  {member?.id === you && <YouMark> · {t('room.waiting.badge.you')}</YouMark>}
                  {!unranked && standing.rank === 1 && (
                    <WinnerTag>{t('room.result.winner')}</WinnerTag>
                  )}
                </Name>
                {extra && <Small>{extra}</Small>}
                <Small>{t(standing.note.key as TextKey, standing.note.params)}</Small>
              </Who>
            </StandingRow>
          )
        })}
      </List>

      {extra}

      <Next>
        <p role="status">{isHost ? t('room.ended.host') : t('room.ended.waitForHost')}</p>
        {isHost && (
          <HostEndedActions
            seated={seated.length}
            minPlayers={view.room.minPlayers}
            onRematch={onRematch}
            onReopen={onReopen}
            onDissolve={onDissolve}
          />
        )}
        {/* Not inside a replay, which is the only place nobody is `you` */}
        {you !== '' && (
          <BackLink to={`/r/${view.room.id}/replay`}>{t('room.result.replay')}</BackLink>
        )}
        <BackLink to="/" onClick={onLeave}>
          {t('room.backToLobby')}
        </BackLink>
      </Next>
    </Panel>
  )
}

/** How long a score takes to count up */
const COUNT_MS = 700

/**
 * A score that counts up from 0 as its row slides in (2026-11-23, NEXT §5 from #155), a broadcast's
 * scoreboard. Only where the browser says motion is welcome (not with reduced motion, nor in jsdom);
 * the page holds the final score before and after, so a screen reader and a test read that. React
 * does not own the text: the count writes it straight into the element, frame by frame.
 */
function CountUp({ score, delay }: { score: number; delay: number }) {
  const t = useT()
  const ref = useRef<HTMLSpanElement>(null)
  const text = t('room.result.score', { score })
  useLayoutEffect(() => {
    const node = ref.current
    if (node === null) return undefined
    node.textContent = text
    const moving =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: no-preference)').matches
    if (!moving || score === 0) return undefined
    let frame = 0
    let start: number | null = null
    const step = (now: number) => {
      start ??= now
      const done = Math.min(1, Math.max(0, (now - start - delay) / COUNT_MS))
      // Fast, then settling on the score
      const shown = Math.round(score * (1 - (1 - done) ** 3))
      node.textContent = done === 1 ? text : t('room.result.score', { score: shown })
      if (done < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = text
    }
  }, [text, score, delay, t])
  return <Count ref={ref} />
}

// Digits of one width, so the line does not shake while it counts
const Count = styled.span`
  font-variant-numeric: tabular-nums;
`

// Glass, with the game's hue down from the top edge
const Panel = styled.section`
  ${glass}
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
  padding: ${space.xl}px ${space.lg}px;
  scroll-margin: ${space.lg}px;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(
      180deg,
      ${color.accent} 0 3px,
      color-mix(in srgb, ${color.accent} 18%, transparent) 3px,
      transparent 50%
    );
    clip-path: ${cornerClip(16)};
    pointer-events: none;
  }

  & p {
    margin: 0;
  }
`

// A slanted magenta tag over the title, as a broadcast's lower third
const Kicker = styled.p`
  ${clippedFill(slantClip(10), color.magenta)}
  justify-self: start;
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.onAccent};
  ${displayType}
  font-size: ${fontSize.sm}px;
  text-transform: uppercase;
`

const Title = styled.h2`
  margin: 0;
  ${displayType}
  font-size: clamp(${fontSize.xxl}px, 5vw, 48px);
  text-shadow: 0 0 ${space.xl}px color-mix(in srgb, ${color.accent} 45%, transparent);
`

// The standings come in one after another, slid in from the side; still with reduced motion
const slideIn = keyframes`
  from {
    opacity: 0;
    translate: -${space.xl}px 0;
  }
`

const sheen = keyframes`
  0%, 55% {
    transform: translateX(-120%);
  }

  100% {
    transform: translateX(220%);
  }
`

const Headline = styled.p`
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  overflow-wrap: anywhere;
`

// The top place is told by the outline and the number, not only by how it looks
const StandingRow = styled.li<{ $top: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  min-height: ${(p) => (p.$top ? 64 : 44)}px;
  padding: ${space.xs}px ${space.md}px;
  overflow: hidden;
  background: ${(p) =>
    p.$top
      ? `linear-gradient(90deg, color-mix(in srgb, ${color.accent} 26%, ${color.surface}), ${color.surface})`
      : color.sunken};
  outline: ${(p) => (p.$top ? `2px solid ${color.accent}` : 'none')};
  outline-offset: -2px;
  box-shadow: ${(p) =>
    p.$top ? `0 0 ${space.xl}px color-mix(in srgb, ${color.accent} 35%, transparent)` : 'none'};
  animation: ${slideIn} 0.35s ease-out both;

  /* A light that sweeps over the winner now and then */
  &::after {
    content: '';
    display: ${(p) => (p.$top ? 'block' : 'none')};
    position: absolute;
    inset: 0;
    width: 30%;
    background: linear-gradient(
      100deg,
      transparent,
      color-mix(in srgb, ${color.text} 12%, transparent),
      transparent
    );
    pointer-events: none;
    animation: ${sheen} 4.5s ease-in-out 1s infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;

    &::after {
      display: none;
    }
  }
`

// The place on a slanted tag: the hue's for the winner, a quiet one for the rest
const Place = styled.span<{ $top: boolean }>`
  ${(p) => clippedFill(slantClip(8), p.$top ? color.accent : color.raised)}
  flex: none;
  min-width: 3.5em;
  padding: ${space.xs}px ${space.md}px;
  color: ${(p) => (p.$top ? color.onAccent : color.text)};
  text-align: center;
  ${displayType}
  font-size: ${(p) => (p.$top ? fontSize.xl : fontSize.lg)}px;
`

const WinnerTag = styled.span`
  display: inline-block;
  margin-left: ${space.sm}px;
  padding: 0 ${space.sm}px;
  color: ${color.accent};
  border: 1px solid currentColor;
  ${displayType}
  font-size: ${fontSize.sm}px;
  text-transform: uppercase;
  vertical-align: middle;
`

/** The host's next move and the way back, under the standings */
const Next = styled.div`
  display: grid;
  gap: ${space.sm}px;
  padding-top: ${space.md}px;
  border-top: 1px solid ${color.line};
`

const Who = styled.div`
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
`

const Name = styled.div`
  font-weight: 600;
`

const YouMark = styled.span`
  color: ${color.muted};
  font-weight: 400;
`

const Small = styled.div`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  justify-self: start;
  color: ${color.text};
`

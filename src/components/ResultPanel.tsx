import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import type { GameResult, Standing } from '../../shared/games/types.ts'
import type { RoomView } from '../../shared/protocol.ts'
import type { TextKey } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { useReducedMotion } from '../lib/useMediaQuery.ts'
import { cornerClip, displayType, glass } from '../styles/esports.ts'
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
  onRematch(): void
  onReopen(): void
  onDissolve(): void
}

/** How a game ended, for any game (e2-t06): standings, then what comes next */
export function ResultPanel({
  view,
  you,
  result,
  headline,
  detail,
  unranked,
  onRematch,
  onReopen,
  onDissolve,
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
      <Title>{t('room.result.heading')}</Title>
      {headline && <Headline>{headline}</Headline>}
      <Muted>{t(result.summary.key as TextKey, result.summary.params)}</Muted>

      <List as="ol">
        {result.standings.map((standing) => {
          const member = seated.find((candidate) => candidate.seat === standing.seat)
          // Whoever left since the game ended still has their place in it
          const name = member?.name ?? t('room.waiting.seat', { seat: standing.seat + 1 })
          const extra =
            detail?.(standing) ??
            (standing.score !== null ? t('room.result.score', { score: standing.score }) : null)
          return (
            <StandingRow key={standing.seat} $top={!unranked && standing.rank === 1}>
              {!unranked && <Place>{t('room.result.place', { rank: standing.rank })}</Place>}
              <Avatar name={name} tint={seatColor(standing.seat)} />
              <Who>
                <Name>
                  {name}
                  {member?.id === you && <YouMark> · {t('room.waiting.badge.you')}</YouMark>}
                </Name>
                {extra && <Small>{extra}</Small>}
                <Small>{t(standing.note.key as TextKey, standing.note.params)}</Small>
              </Who>
            </StandingRow>
          )
        })}
      </List>

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
        <BackLink to="/">{t('room.backToLobby')}</BackLink>
      </Next>
    </Panel>
  )
}

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

const Title = styled.h2`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.xxl}px;
`

const Headline = styled.p`
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  overflow-wrap: anywhere;
`

// The top place is told by the outline and the number, not only by how it looks
const StandingRow = styled.li<{ $top: boolean }>`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;
  padding: ${space.xs}px ${space.md}px;
  background: ${(p) =>
    p.$top ? `color-mix(in srgb, ${color.accent} 14%, ${color.surface})` : color.sunken};
  outline: ${(p) => (p.$top ? `2px solid ${color.accent}` : 'none')};
  outline-offset: -2px;
`

const Place = styled.span`
  flex: none;
  min-width: 3.5em;
  ${displayType}
  font-size: ${fontSize.lg}px;
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

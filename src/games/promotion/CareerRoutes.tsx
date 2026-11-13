import styled from 'styled-components'
import { seatColor, color, fontSize, radius, space } from '../../styles/tokens.ts'

/** One turn of a career, already in words: when, what the dice made, where it led, what else */
export type RouteLine = {
  round: string
  what: string
  /** Each cell landed on, in order; empty for a turn that stayed put */
  cells: string[]
  /** What else the turn did: an answer, silver */
  notes: string[]
}

export type CareerRoute = {
  seat: number
  name: string
  /** "Commoner → Grand Secretary · 24 rolls" */
  summary: string
  lines: RouteLine[]
}

/**
 * Every player's way up (or down) the ladder once a game is over (2026-11-13, 擁有者): one closed
 * block a player, so that a phone shows the whole table first, each opening to its turns in order.
 * Both editions use it; each puts its own turns into words (PromotionScreen, FullScreen).
 */
export function CareerRoutes({
  title,
  explain,
  routes,
}: {
  title: string
  explain: string
  routes: CareerRoute[]
}) {
  if (routes.length === 0) return null
  return (
    <Section aria-labelledby="career-routes-title" data-career-routes="">
      <Title id="career-routes-title">{title}</Title>
      <Explain>{explain}</Explain>
      {routes.map((route) => (
        <Seat key={route.seat} data-route-seat={route.seat}>
          <Summary>
            <Dot $seat={route.seat} aria-hidden="true" />
            <Name>{route.name}</Name>
            <Gist>{route.summary}</Gist>
          </Summary>
          <Turns>
            {route.lines.map((line, at) => (
              <li key={at}>
                <Round>{line.round}</Round>
                <Body>
                  <What>{line.what}</What>
                  {line.cells.length > 0 && <Cells>→ {line.cells.join(' → ')}</Cells>}
                  {line.notes.map((note, index) => (
                    <Note key={index}>{note}</Note>
                  ))}
                </Body>
              </li>
            ))}
          </Turns>
        </Seat>
      ))}
    </Section>
  )
}

const Section = styled.section`
  display: grid;
  gap: ${space.sm}px;
`

const Title = styled.h3`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const Explain = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Seat = styled.details`
  border: 1px solid ${color.border};
  border-radius: ${radius.card}px;
  background: ${color.surface};

  &[open] > summary {
    border-bottom: 1px solid ${color.border};
  }
`

const Summary = styled.summary`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${space.xs}px ${space.sm}px;
  padding: ${space.sm}px ${space.md}px;
  cursor: pointer;
`

const Dot = styled.span<{ $seat: number }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p) => seatColor(p.$seat)};
  align-self: center;
`

const Name = styled.span`
  font-weight: 700;
`

const Gist = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

// A long career scrolls inside its block, not the whole result
const Turns = styled.ol`
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  list-style: none;
  display: grid;
  gap: ${space.xs}px;
  max-height: 360px;
  overflow-y: auto;
  font-size: ${fontSize.sm}px;

  & > li {
    display: grid;
    grid-template-columns: 4.5em minmax(0, 1fr);
    gap: ${space.sm}px;
  }
`

const Round = styled.span`
  color: ${color.muted};
  font-variant-numeric: tabular-nums;
`

const Body = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 0 ${space.sm}px;
  overflow-wrap: anywhere;
`

const What = styled.span`
  font-weight: 600;
`

const Cells = styled.span``

const Note = styled.span`
  color: ${color.muted};
`

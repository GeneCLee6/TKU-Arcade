// 2026-11-18: the team race's HUD (shared/kart/team.ts). The team's gauge, blue, beside the kart's
// own, and what it does when full (the charges held turn blue: those are drawn on the kart's own
// panel, Hud.tsx, red and blue); the two teams' running score under the place; a blue edge on the
// screen while a blue boost burns; and, for someone watching, both teams' gauges. Its own file,
// apart from the race HUD (Hud.tsx), which every race shows. Colours come from the tokens.
import { memo } from 'react'
import styled, { keyframes } from 'styled-components'
import { TEAM_GAUGE, TEAM_NAMES, type TeamId } from '../../../shared/kart/team.ts'
import type { Translate } from '../../i18n/t.ts'
import { displayType, monoType, SLANT } from '../../styles/esports.ts'
import { broadcast } from '../ui/broadcast.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { teamColor } from '../team/teamColor.ts'

/** The team gauge is drawn as this many segments */
const SEGMENTS = 20

export interface TeamPanelProps {
  readonly t: Translate
  /** The team's gauge, 0 to 100, as the room tells it */
  readonly gauge: number
  readonly burning: boolean
}

/** The team's gauge, and what a full one does */
export const TeamPanel = memo(function TeamPanel({ t, gauge, burning }: TeamPanelProps) {
  const lit = Math.floor((gauge / TEAM_GAUGE.full) * SEGMENTS)
  return (
    <Panel data-testid="kart-team-panel" role="group" aria-label={t('games.kart.team.gauge')}>
      <LabelRow>
        <Label>{t('games.kart.team.gauge')}</Label>
        <Percent>{t('games.kart.team.percent', { value: gauge })}</Percent>
      </LabelRow>
      <Segments
        role="meter"
        aria-label={t('games.kart.team.gauge')}
        aria-valuemin={0}
        aria-valuemax={TEAM_GAUGE.full}
        aria-valuenow={gauge}
        data-testid="kart-team-gauge"
      >
        {Array.from({ length: SEGMENTS }, (_, index) => (
          <Segment key={index} $on={index < lit} />
        ))}
      </Segments>
      <LabelRow>
        {burning ? (
          <Burning data-testid="kart-team-burning">{t('games.kart.team.burning')}</Burning>
        ) : (
          <Label data-testid="kart-team-turns">{t('games.kart.team.turns')}</Label>
        )}
      </LabelRow>
    </Panel>
  )
})

export interface TeamGaugesProps {
  readonly t: Translate
  /** Both teams' gauges, 0 to 100 */
  readonly gauge: readonly [number, number]
}

/** Both teams' gauges, for someone watching (the spectator's view and a replay) */
export const TeamGauges = memo(function TeamGauges({ t, gauge }: TeamGaugesProps) {
  return (
    <Panel data-testid="kart-team-gauges" role="group" aria-label={t('games.kart.team.gauges')}>
      {([0, 1] as const).map((team) => {
        const name = t('games.kart.team.gaugeOf', { team: t(`games.kart.team.${TEAM_NAMES[team]}`) })
        const lit = Math.floor((gauge[team] / TEAM_GAUGE.full) * SEGMENTS)
        return (
          <LabelRow key={team} data-team={TEAM_NAMES[team]}>
            <Dot $team={team} aria-hidden="true" />
            <Segments
              role="meter"
              aria-label={name}
              aria-valuemin={0}
              aria-valuemax={TEAM_GAUGE.full}
              aria-valuenow={gauge[team]}
            >
              {Array.from({ length: SEGMENTS }, (_, index) => (
                <Segment key={index} $on={index < lit} />
              ))}
            </Segments>
          </LabelRow>
        )
      })}
    </Panel>
  )
})

export interface TeamScoreProps {
  readonly t: Translate
  readonly totals: readonly [number, number]
  /** This racer's team, marked; null for someone watching */
  readonly mine: TeamId | null
}

/** The two teams' score as the race stands */
export const TeamScore = memo(function TeamScore({ t, totals, mine }: TeamScoreProps) {
  return (
    <Score
      role="img"
      aria-label={t('games.kart.team.score', { red: totals[0], blue: totals[1] })}
      data-testid="kart-team-score"
    >
      {([0, 1] as const).map((team) => (
        <Side key={team} $team={team} $mine={mine === team} data-team={TEAM_NAMES[team]}>
          <SideName>{t(`games.kart.team.${TEAM_NAMES[team]}`)}</SideName>
          <SidePoints>{totals[team]}</SidePoints>
        </Side>
      ))}
    </Score>
  )
})

const Panel = styled.div`
  ${broadcast}
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.sm}px ${space.lg}px ${space.sm}px ${space.md}px;
  color: ${color.text};
  pointer-events: none;
`

const LabelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.md}px;
  min-height: 18px;
`

const Label = styled.span`
  ${monoType}
  white-space: nowrap;
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: ${color.muted};
`

const Percent = styled.span`
  ${monoType}
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Segments = styled.div`
  display: flex;
  gap: 3px;
  padding-inline: 3px;

  @media (max-height: 500px) {
    gap: 2px;
  }
`

const Segment = styled.i<{ $on: boolean }>`
  width: 8px;
  height: 14px;
  transform: skewX(${SLANT});
  background: ${({ $on }) => ($on ? color.teamBoost : color.raised)};
  box-shadow: ${({ $on }) =>
    $on ? `0 0 8px ${color.teamBoost}` : `inset 0 0 0 1px ${color.line}`};

  @media (max-height: 500px) {
    width: 5px;
    height: 10px;
  }
`

/** Whose gauge it is: the side's colour (the gauge itself is the blue boost's blue for both) */
const Dot = styled.i<{ $team: TeamId }>`
  flex: none;
  width: 10px;
  height: 14px;
  transform: skewX(${SLANT});
  background: ${({ $team }) => teamColor($team)};
`

const Burning = styled.span`
  ${displayType}
  padding: 0 ${space.sm}px;
  color: ${color.onSeat};
  background: ${color.teamBoost};
  font-size: ${fontSize.sm}px;
  white-space: nowrap;
`

const Score = styled.div`
  display: flex;
  gap: 2px;
  pointer-events: none;
`

const Side = styled.span<{ $team: TeamId; $mine: boolean }>`
  display: flex;
  align-items: baseline;
  gap: ${space.sm}px;
  padding: 2px ${space.sm}px;
  color: ${color.onSeat};
  background: ${({ $team }) => teamColor($team)};
  /* This racer's team stands out; the other is drawn back */
  opacity: ${({ $mine }) => ($mine ? 1 : 0.8)};
  box-shadow: ${({ $mine }) => ($mine ? `0 0 0 2px ${color.text}` : 'none')};
`

const SideName = styled.span`
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const SidePoints = styled.span`
  ${displayType}
  font-size: ${fontSize.lg}px;
  font-variant-numeric: tabular-nums;
`

const glow = keyframes`
  from { opacity: 0.55; }
  to { opacity: 0.9; }
`

/** A blue edge round the screen while a team boost burns, over the boost's own veil */
export const TeamVeil = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  box-shadow: inset 0 0 120px 10px ${color.teamBoost};
  opacity: 0.7;
  animation: ${glow} 0.5s ease-in-out infinite alternate;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

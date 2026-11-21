// 2026-11-21 (docs/ARCHITECTURE.md §4.60): a mission's goal and rules in words, and a track's name,
// for the challenge mode's pages (ChallengeView.tsx).
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { missionLimit } from './medals.ts'
import type { Mission } from './missions.ts'

export type KartT = (key: KartMessageKey, params?: MessageParams) => string

/** The name of any track a challenge runs on */
export function trackName(t: KartT, id: string): string {
  if (id.startsWith('ch-')) return t(`kart.challenge.track.${id}` as KartMessageKey)
  // The race tracks' names as a room shows them (shared/games/kart/i18n.ts, registered by the page)
  return t(`games.kart.track.${id}` as KartMessageKey)
}

/** A mission's goal, then its rules, one line each */
export function goalLines(t: KartT, mission: Mission): string[] {
  const bots = mission.bots?.count ?? 0
  const goal =
    mission.kind === 'place' && mission.target === 1
      ? t('kart.challenge.goal.place1', { bots })
      : t(`kart.challenge.goal.${mission.kind}`, { target: mission.target ?? 0, bots })
  const lines = [goal]
  const rules = mission.rules ?? {}
  if (rules.noCrash) lines.push(t('kart.challenge.rule.noCrash'))
  if (rules.noN2O) lines.push(t('kart.challenge.rule.noN2O'))
  if (rules.noReset) lines.push(t('kart.challenge.rule.noReset'))
  if (rules.boostStart) lines.push(t('kart.challenge.rule.boostStart'))
  const limit = missionLimit(mission)
  if (limit !== undefined) lines.push(t('kart.challenge.rule.limit', { limit: limit.toFixed(1) }))
  if (mission.fog) lines.push(t('kart.challenge.rule.fog'))
  if (mission.vehicle) {
    lines.push(t('kart.challenge.rule.vehicle', { vehicle: t(`kart.body.${mission.vehicle}`) }))
  }
  return lines
}

export const lapsText = (t: KartT, laps: number) =>
  laps === 1 ? t('kart.challenge.lap') : t('kart.challenge.laps', { laps })

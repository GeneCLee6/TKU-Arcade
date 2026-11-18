// 2026-11-18: the two sides of a team race, in the tokens' colours (shared/kart/team.ts)
import type { TeamId } from '../../../shared/kart/team.ts'
import { color } from '../../styles/tokens.ts'

export const teamColor = (team: TeamId): string => (team === 0 ? color.teamRed : color.teamBlue)

// The team race on the screen (2026-11-18): the waiting room's sides, the race's team gauge and
// score, and the standings with each kart's side and points.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { kartScreenMessages } from '../../shared/games/kart/i18n.screen.ts'
import { kartTeamMessages } from '../../shared/games/kart/i18n.team.ts'
import type { KartView } from '../../shared/games/kart/types.ts'
import type { RoomMember } from '../../shared/protocol.ts'
import { Standings } from '../../src/games/kart/Standings.tsx'
import { registerMessages, translate } from '../../src/i18n/t.ts'
import { TeamGauges, TeamPanel, TeamScore } from '../../src/kart/race/TeamHud.tsx'
import RoomTeams from '../../src/kart/team/RoomTeams.tsx'

registerMessages(kartScreenMessages)
registerMessages(kartTeamMessages)
const en = (key: string, params?: Record<string, string | number>) =>
  translate('en', key as `games.${string}`, params)
const zh = (key: string, params?: Record<string, string | number>) =>
  translate('zh-TW', key as `games.${string}`, params)

const member = (id: string, seat: number, more: Partial<RoomMember> = {}): RoomMember => ({
  id,
  name: id,
  seat,
  ready: false,
  host: false,
  online: true,
  absent: false,
  ...more,
})

describe('the sides in the waiting room', () => {
  const members = {
    ann: member('ann', 0, { host: true }),
    bob: member('bob', 1, { team: 0 }),
    cat: member('cat', 2),
    dan: member('dan', 3),
  }

  it('shows everyone on the side the race will put them on', () => {
    render(<RoomTeams members={members} you="bob" onSetTeam={() => {}} />)
    const rows = screen.getAllByRole('listitem')
    // Bob chose red; the others fill the smaller side in seat order: Ann blue, Cat red, Dan blue
    expect(rows.map((row) => row.dataset.team)).toEqual(['blue', 'red', 'red', 'blue'])
    expect(screen.getByTestId('kart-team-sizes')).toHaveTextContent('Sunset 2 v Estuary 2')
    // Someone who is not the host moves only themselves
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(screen.queryByTestId('kart-team-balance')).toBeNull()
  })

  it('sends a member their own choice, and the host anyone else by id', () => {
    const onSetTeam = vi.fn()
    const { unmount } = render(<RoomTeams members={members} you="bob" onSetTeam={onSetTeam} />)
    fireEvent.click(screen.getByRole('button', { name: 'Put bob on Estuary' }))
    expect(onSetTeam).toHaveBeenLastCalledWith(1, undefined)
    unmount()
    render(<RoomTeams members={members} you="ann" onSetTeam={onSetTeam} />)
    fireEvent.click(screen.getByRole('button', { name: 'Put cat on Sunset' }))
    expect(onSetTeam).toHaveBeenLastCalledWith(0, 'cat')
    fireEvent.click(screen.getByRole('button', { name: 'Put ann on Sunset' }))
    expect(onSetTeam).toHaveBeenLastCalledWith(0, undefined)
    // The host takes every choice back: only Bob has made one
    onSetTeam.mockClear()
    fireEvent.click(screen.getByTestId('kart-team-balance'))
    expect(onSetTeam.mock.calls).toEqual([[null, 'bob']])
  })
})

describe('the team HUD', () => {
  it('shows the team gauge as a meter, and what a full one does', () => {
    render(<TeamPanel t={en} gauge={48} burning={false} />)
    expect(screen.getByRole('meter', { name: 'Team gauge' })).toHaveAttribute('aria-valuenow', '48')
    expect(screen.getByText('48%')).toBeInTheDocument()
    expect(screen.getByTestId('kart-team-turns')).toHaveTextContent(
      'Full: the boosts you hold turn blue',
    )
    expect(screen.queryByTestId('kart-team-burning')).toBeNull()
  })

  it('says so while a blue boost burns, in either language', () => {
    const { unmount } = render(<TeamPanel t={en} gauge={0} burning />)
    expect(screen.getByTestId('kart-team-burning')).toHaveTextContent('High Tide')
    unmount()
    render(<TeamPanel t={zh} gauge={0} burning />)
    expect(screen.getByTestId('kart-team-burning')).toHaveTextContent('漲潮')
    expect(screen.getByRole('meter', { name: '同舟條' })).toBeInTheDocument()
  })

  it('shows someone watching both sides\u2019 gauges', () => {
    render(<TeamGauges t={en} gauge={[40, 96]} />)
    expect(screen.getByRole('meter', { name: 'Sunset team gauge' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    )
    expect(screen.getByRole('meter', { name: 'Estuary team gauge' })).toHaveAttribute(
      'aria-valuenow',
      '96',
    )
  })

  it('shows both sides and their score', () => {
    render(<TeamScore t={en} totals={[14, 10]} mine={1} />)
    const score = screen.getByRole('img', { name: 'Team score: Sunset 14, Estuary 10' })
    expect(within(score).getByText('14')).toBeInTheDocument()
    expect(within(score).getByText('10')).toBeInTheDocument()
  })
})

describe('the standings of a team race', () => {
  const racer = (seat: number, team: 0 | 1, finishMs: number | null) => ({
    seat,
    loaded: true,
    lapMs: finishMs === null ? [] : [finishMs],
    finishMs,
    out: false,
    item: null,
    shieldUntil: 0,
    team,
    teamBoosts: 0,
    teamUsed: 0,
    teamUntil: 0,
  })
  const view = {
    track: 'riverside',
    laps: 1,
    phase: 'racing',
    goAt: 1,
    racers: [racer(0, 0, 31_000), racer(1, 1, 30_000), racer(2, 0, null)],
    mode: 'race',
    seed: 1,
    boxes: [],
    draws: 0,
    events: [],
    used: 0,
    shots: [],
    teams: { gauge: [0, 0], fills: [0, 0] },
    you: 0,
  } as KartView

  it('marks each kart with its side, and its points once it has finished', () => {
    render(<Standings view={view} order={[1, 0, 2]} nameOf={(seat) => `kart ${seat}`} />)
    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.dataset.team)).toEqual(['blue', 'red', 'red'])
    expect(rows[0]).toHaveTextContent('10 pts')
    expect(rows[1]).toHaveTextContent('8 pts')
    expect(rows[2]).not.toHaveTextContent('pts')
    expect(within(rows[0]!).getByRole('img', { name: 'Estuary' })).toBeInTheDocument()
  })

  it('shows no side in a race of everyone for themselves', () => {
    const solo = { ...view, teams: undefined } as KartView
    render(<Standings view={solo} order={[1, 0, 2]} nameOf={(seat) => `kart ${seat}`} />)
    expect(screen.getAllByRole('listitem')[0]!.dataset.team).toBeUndefined()
    expect(screen.queryByText(/pts/)).toBeNull()
  })
})

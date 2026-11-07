import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameResult } from '../../shared/games/types.ts'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { ResultPanel, type ResultPanelProps } from '../../src/components/ResultPanel.tsx'
import { en } from '../../src/i18n/en.ts'
import { setLanguage } from '../../src/i18n/t.ts'
import { stubDialog } from '../lib/stubDialog.ts'

const member = (id: string, seat: number | null, host = false): RoomMember => ({
  id,
  name: id,
  seat,
  ready: false,
  host,
  online: true,
  absent: false,
})

const viewOf = (members: RoomMember[]): RoomView => ({
  room: {
    id: 'room',
    gameId: 'promotion',
    status: 'ended',
    options: {},
    minPlayers: 2,
    maxSeats: 6,
  },
  members: Object.fromEntries(members.map((one) => [one.id, one])),
  game: null,
  coverable: [],
})

const result: GameResult = {
  summary: { key: 'games.promotion.result.turnLimit', params: { rounds: 10 } },
  standings: [
    { seat: 1, rank: 1, score: 12, note: { key: 'games.promotion.note.official', params: { rolls: 9 } } },
    { seat: 0, rank: 2, score: 3, note: { key: 'games.promotion.note.student', params: { rolls: 9 } } },
    { seat: 2, rank: 2, score: 3, note: { key: 'games.promotion.note.student', params: { rolls: 8 } } },
  ],
}

function renderPanel(members: RoomMember[], you: string, props: Partial<ResultPanelProps> = {}) {
  const actions = { onRematch: vi.fn(), onReopen: vi.fn(), onDissolve: vi.fn() }
  render(
    <MemoryRouter>
      <ResultPanel view={viewOf(members)} you={you} result={result} {...actions} {...props} />
    </MemoryRouter>,
  )
  return actions
}

const everyone = [member('Al', 0, true), member('Bo', 1)]

beforeAll(() => stubDialog())
beforeEach(() => setLanguage('en'))

describe('the result panel', () => {
  it('lists every seat in order, with places shared on a tie and each one its sentence', () => {
    renderPanel(everyone, 'Al')
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveTextContent('#1')
    expect(rows[0]).toHaveTextContent('Bo')
    expect(rows[0]).toHaveTextContent('A respectable career, 9 rolls long.')
    expect(rows[1]).toHaveTextContent('#2')
    expect(rows[2]).toHaveTextContent('#2')
    expect(screen.getByText('The 10 rounds are up: seniority decides.')).toBeInTheDocument()
  })

  it('still places someone who has left, by their seat', () => {
    renderPanel(everyone, 'Al')
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows[2]).toHaveTextContent('Seat 3')
  })

  it('marks your own row only', () => {
    renderPanel(everyone, 'Bo')
    const rows = within(screen.getByRole('list')).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent(en['room.waiting.badge.you'])
    expect(rows[1]).not.toHaveTextContent(en['room.waiting.badge.you'])
  })

  it('shows the score only when the game has nothing better to say', () => {
    renderPanel(everyone, 'Al')
    expect(screen.getByText('Score: 12')).toBeInTheDocument()
  })

  it('lets the game replace the score and add a headline', () => {
    renderPanel(everyone, 'Al', { detail: () => 'An office', headline: 'Bo on top' })
    expect(screen.queryByText('Score: 12')).toBeNull()
    expect(screen.getAllByText('An office')).toHaveLength(3)
    expect(screen.getByText('Bo on top')).toBeInTheDocument()
  })

  it('gives the host the rematch and the way back', () => {
    const { onRematch, onReopen } = renderPanel(everyone, 'Al')
    expect(screen.getByRole('status')).toHaveTextContent(en['room.ended.host'])
    fireEvent.click(screen.getByRole('button', { name: en['room.host.rematch'] }))
    expect(onRematch).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en['room.host.reopen'] }))
    expect(onReopen).toHaveBeenCalledOnce()
  })

  it('holds the rematch back while too few are seated', () => {
    renderPanel([member('Al', 0, true), member('Bo', null)], 'Al')
    expect(screen.getByRole('button', { name: en['room.host.rematch'] })).toBeDisabled()
  })

  it('tells everyone else to wait, with only the way to the lobby', () => {
    renderPanel(everyone, 'Bo')
    expect(screen.getByRole('status')).toHaveTextContent(en['room.ended.waitForHost'])
    expect(screen.queryByRole('button', { name: en['room.host.rematch'] })).toBeNull()
    expect(screen.getByRole('link', { name: en['room.backToLobby'] })).toHaveAttribute('href', '/')
  })
})

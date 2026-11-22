// 2026-11-21: the race room's waiting room (src/kart/lobby/KartLobby.tsx): a card for each of the
// eight places, the ready button, and the host's start that waits on everyone being ready
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { kartMessages } from '../../shared/games/kart/i18n.ts'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { initLanguage, registerMessages } from '../../src/i18n/t.ts'
import KartLobby from '../../src/kart/lobby/KartLobby.tsx'
import { seatState, waitingOn } from '../../src/kart/lobby/readiness.ts'
import { stubDialog } from '../lib/stubDialog.ts'

const member = (id: string, over: Partial<RoomMember> = {}): RoomMember => ({
  id,
  name: id,
  seat: null,
  ready: false,
  host: false,
  online: true,
  absent: false,
  ...over,
})

const ann = (over: Partial<RoomMember> = {}) => member('Ann', { seat: 0, host: true, look: 'tide.spade', ...over })
const bob = (over: Partial<RoomMember> = {}) => member('Bob', { seat: 1, look: 'heron.club', ...over })
const cpu = member('cpu', { name: 'mochi', seat: 2, ready: true, look: 'ray.heart', bot: { level: 'hard', name: 'mochi' } })

function viewOf(members: RoomMember[], options: Record<string, string | number> = {}): RoomView {
  return {
    room: {
      id: 'abcdefghij',
      gameId: 'kart',
      status: 'waiting',
      options: { track: 'riverside', laps: 3, mode: 'items', teams: 'solo', ...options },
      minPlayers: 1,
      maxSeats: 8,
    },
    members: Object.fromEntries(members.map((one) => [one.id, one])),
    game: null,
    coverable: [],
  }
}

function renderLobby(view: RoomView, you: string) {
  const handlers = {
    onSit: vi.fn(),
    onReady: vi.fn(),
    onStart: vi.fn(),
    onKick: vi.fn(),
    onTransfer: vi.fn(),
    onSetLook: vi.fn(),
    onAddBot: vi.fn(),
    onSetTeam: vi.fn(),
  }
  render(
    <ToastProvider>
      <KartLobby view={view} you={you} side={null} {...handlers} />
    </ToastProvider>,
  )
  return handlers
}

const placeOf = (name: string) =>
  screen.getAllByTestId('kart-lobby-place').find((one) => within(one).queryByText(name)) as HTMLElement

beforeAll(stubDialog)
beforeEach(() => {
  localStorage.clear()
  initLanguage()
  registerMessages(kartMessages)
})

describe('who the start waits for', () => {
  it('is everyone seated but the host and the computer karts, until ready and online', () => {
    const members = Object.fromEntries(
      [ann(), bob(), cpu, member('Cy'), member('Di', { seat: 3, ready: true, online: false })].map((one) => [one.id, one]),
    )
    expect(waitingOn(members).map((one) => one.id)).toEqual(['Bob', 'Di'])
    expect(seatState(ann())).toBe('host')
    expect(seatState(cpu)).toBe('ready')
    expect(seatState(bob({ ready: true }))).toBe('ready')
    expect(seatState(bob({ ready: true, online: false }))).toBe('offline')
  })
})

describe('the race room’s waiting room (2026-11-21)', () => {
  it('shows eight places: each racer with their kart, tags and state; the rest open', () => {
    renderLobby(viewOf([ann(), bob(), cpu]), 'Ann')
    expect(screen.getAllByTestId('kart-lobby-place')).toHaveLength(3)
    expect(screen.getAllByTestId('kart-lobby-open')).toHaveLength(5)
    const bobs = placeOf('Bob')
    expect(bobs).toHaveTextContent('Egret')
    expect(bobs).toHaveTextContent('Clover')
    expect(bobs).toHaveAttribute('data-state', 'waiting')
    expect(within(placeOf('Ann')).getByTestId('kart-lobby-crown')).toBeInTheDocument()
    expect(within(placeOf('Mochi (CPU)')).getByTestId('kart-lobby-state')).toHaveTextContent('Ready')
    expect(within(placeOf('Mochi (CPU)')).getByText('CPU')).toBeInTheDocument()
    // The host adds a computer kart only on the first open place, where the room puts it
    expect(screen.getAllByTestId('kart-lobby-add-bot')).toHaveLength(1)
  })

  it('holds the host’s start until everyone is ready, and says for whom', () => {
    renderLobby(viewOf([ann(), bob(), cpu]), 'Ann')
    expect(screen.getByRole('button', { name: 'Start game' })).toBeDisabled()
    expect(screen.getByTestId('kart-lobby-waiting')).toHaveTextContent('Waiting for Bob to get ready')
    expect(screen.queryByTestId('kart-lobby-ready')).not.toBeInTheDocument()
  })

  it('lets the host start once everyone is', () => {
    const { onStart } = renderLobby(viewOf([ann(), bob({ ready: true }), cpu]), 'Ann')
    expect(screen.getByTestId('kart-lobby-waiting')).toHaveTextContent('Everyone is ready')
    fireEvent.click(screen.getByRole('button', { name: 'Start game' }))
    expect(onStart).toHaveBeenCalled()
  })

  it('gives everyone else Ready, and Cancel ready once pressed', () => {
    const first = renderLobby(viewOf([ann(), bob()]), 'Bob')
    fireEvent.click(screen.getByTestId('kart-lobby-ready'))
    expect(first.onReady).toHaveBeenCalledWith(true)
    expect(screen.queryByRole('button', { name: 'Start game' })).not.toBeInTheDocument()
  })

  it('takes a ready back', () => {
    const { onReady } = renderLobby(viewOf([ann(), bob({ ready: true })]), 'Bob')
    const button = screen.getByTestId('kart-lobby-ready')
    expect(button).toHaveTextContent('Cancel ready')
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(onReady).toHaveBeenCalledWith(false)
  })

  it('shows the track and that everyone starts on one line', () => {
    renderLobby(viewOf([ann()], { laps: 2, mode: 'race' }), 'Ann')
    const card = screen.getByTestId('kart-lobby-track')
    expect(card).toHaveTextContent('2 laps')
    expect(card).toHaveTextContent('side by side')
    expect(screen.getByTestId('kart-lobby-backdrop')).toHaveAttribute('data-theme', 'day')
  })
})

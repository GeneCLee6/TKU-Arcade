import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '../../shared/chat.ts'
import { RoomChatPanel, type RoomParts } from '../../src/components/GameLayout.tsx'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { en } from '../../src/i18n/en.ts'
import { setLanguage } from '../../src/i18n/t.ts'
import { ChatDraft, unreadCount } from '../../src/lib/chatState.ts'
import { stubDialog } from '../lib/stubDialog.ts'

const message = (id: number, from = 'm2'): ChatMessage => ({
  id,
  from,
  name: from,
  text: `text ${id}`,
  at: id,
})

const parts = (messages: ChatMessage[]): RoomParts => ({
  view: {
    room: {
      id: 'room',
      gameId: 'promotion',
      status: 'waiting',
      options: {},
      minPlayers: 2,
      maxSeats: 6,
    },
    members: {},
    game: null,
    coverable: [],
  },
  you: 'm1',
  timers: [],
  onSit: vi.fn(),
  onCover: vi.fn(),
  onKick: vi.fn(),
  onTransfer: vi.fn(),
  onDissolve: vi.fn(),
  onReopen: vi.fn(),
  onRematch: vi.fn(),
  act: vi.fn(),
  chat: { messages, locked: false, onSend: vi.fn(), draftStore: new ChatDraft() },
})

const panel = (messages: ChatMessage[]) => (
  <ToastProvider>
    <RoomChatPanel room={parts(messages)} />
  </ToastProvider>
)

function stubPhone(phone: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: phone,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

beforeAll(() => stubDialog())
beforeEach(() => setLanguage('en'))
afterEach(() => vi.unstubAllGlobals())

describe('the chat outside a game', () => {
  it('is on the page on a wide screen', () => {
    stubPhone(false)
    render(panel([]))
    expect(screen.getByRole('log')).toBeInTheDocument()
  })

  it('is behind a button on a phone, in a drawer with no tabs as it is all there is', () => {
    stubPhone(true)
    render(panel([message(1)]))
    expect(screen.queryByRole('log')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Chat/ }))
    const drawer = screen.getByRole('dialog', { name: en['chat.heading'] })
    expect(within(drawer).getByRole('log')).toHaveTextContent('text 1')
    expect(screen.queryByRole('tab')).toBeNull()
  })

  it('counts what arrives while it is closed, and forgets once it is read', () => {
    stubPhone(true)
    const { rerender } = render(panel([message(1)]))
    expect(screen.getByRole('button', { name: en['chat.heading'] })).toBeInTheDocument()

    rerender(panel([message(1), message(2), message(3)]))
    fireEvent.click(screen.getByRole('button', { name: 'Chat (2 new)' }))
    fireEvent.click(screen.getByRole('button', { name: en['common.close'] }))
    expect(screen.getByRole('button', { name: en['chat.heading'] })).toBeInTheDocument()
  })

  it('does not count what this person sent', () => {
    stubPhone(true)
    const { rerender } = render(panel([message(1)]))
    rerender(panel([message(1), message(2, 'm1')]))
    expect(screen.getByRole('button', { name: en['chat.heading'] })).toBeInTheDocument()
  })
})

describe('unreadCount', () => {
  const messages = [message(1), message(2), message(3, 'me'), message(4)]

  it('counts others after the last one seen', () => {
    expect(unreadCount(messages, 1, 'me')).toBe(2)
    expect(unreadCount(messages, 4, 'me')).toBe(0)
  })

  it('counts all of them when none was seen, or the seen one has scrolled out', () => {
    expect(unreadCount(messages, null, 'me')).toBe(3)
    expect(unreadCount(messages, 99, 'me')).toBe(3)
  })
})

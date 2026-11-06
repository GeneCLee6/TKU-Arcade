import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_HISTORY, type ChatMessage } from '../../shared/chat.ts'
import { CHAT_ACK_TIMEOUT_MS, ChatSends, mergeChat } from '../../src/lib/chatState.ts'

const message = (id: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  from: 'm2',
  name: 'Bo',
  text: `message ${id}`,
  at: 1000 + id,
  ...over,
})
const ids = (messages: readonly ChatMessage[]) => messages.map((one) => one.id)

describe('mergeChat', () => {
  it('appends without reset', () => {
    expect(ids(mergeChat([message(1)], [message(2), message(3)], false))).toEqual([1, 2, 3])
  })

  it('replaces with reset, even with nothing', () => {
    expect(ids(mergeChat([message(1)], [message(5)], true))).toEqual([5])
    expect(mergeChat([message(1)], [], true)).toEqual([])
  })

  it('skips what it already has, and repeats within a frame', () => {
    expect(ids(mergeChat([message(1), message(2)], [message(2), message(3)], false))).toEqual([
      1, 2, 3,
    ])
    expect(ids(mergeChat([], [message(1), message(1)], false))).toEqual([1])
    expect(ids(mergeChat([], [message(1), message(1)], true))).toEqual([1])
  })

  it('gives the same array back when nothing changed', () => {
    const current = [message(1)]
    expect(mergeChat(current, [message(1)], false)).toBe(current)
    expect(mergeChat(current, [], false)).toBe(current)
  })

  it(`keeps the latest ${CHAT_HISTORY}`, () => {
    const many = Array.from({ length: CHAT_HISTORY }, (_, index) => message(index))
    const after = mergeChat(many, [message(CHAT_HISTORY), message(CHAT_HISTORY + 1)], false)
    expect(after).toHaveLength(CHAT_HISTORY)
    expect(after[0].id).toBe(2)
    expect(after.at(-1)?.id).toBe(CHAT_HISTORY + 1)

    const reset = mergeChat([], [...many, message(CHAT_HISTORY)], true)
    expect(reset).toHaveLength(CHAT_HISTORY)
    expect(reset[0].id).toBe(1)
  })
})

describe('ChatSends', () => {
  const YOU = 'm1'
  const mine = (id: number, text: string) => message(id, { from: YOU, text })

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('is sent when the message comes back', async () => {
    const sends = new ChatSends()
    const answer = sends.add('hi')
    sends.heard([mine(1, 'hi')], YOU)
    await expect(answer).resolves.toBe('sent')
  })

  it('someone else saying the same is no answer', async () => {
    const sends = new ChatSends()
    const answer = sends.add('hi')
    sends.heard([message(1, { text: 'hi' })], YOU)
    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS)
    await expect(answer).resolves.toBe('failed')
  })

  it('the same words said earlier, found in the history, are no answer', async () => {
    const sends = new ChatSends()
    sends.heard([mine(1, 'hi')], YOU)
    const answer = sends.add('hi')
    sends.heard([mine(1, 'hi')], YOU)
    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS)
    await expect(answer).resolves.toBe('failed')
  })

  it('the same words said again answer one send each, oldest first', async () => {
    const sends = new ChatSends()
    const first = sends.add('hi')
    const second = sends.add('hi')
    sends.heard([mine(1, 'hi')], YOU)
    await expect(first).resolves.toBe('sent')
    sends.heard([mine(2, 'hi')], YOU)
    await expect(second).resolves.toBe('sent')
  })

  it('fails when nothing is heard in time', async () => {
    const sends = new ChatSends()
    const answer = sends.add('hi')
    vi.advanceTimersByTime(CHAT_ACK_TIMEOUT_MS)
    await expect(answer).resolves.toBe('failed')
  })

  it.each(['rate_limited', 'chat_locked'] as const)(
    '%s answers the oldest send and is handled',
    async (code) => {
      const sends = new ChatSends()
      const first = sends.add('one')
      const second = sends.add('two')
      expect(sends.refused(code)).toBe(true)
      await expect(first).resolves.toBe(code)
      sends.heard([mine(1, 'two')], YOU)
      await expect(second).resolves.toBe('sent')
    },
  )

  it('leaves a refusal alone when no send is waiting, or when it is about something else', async () => {
    const sends = new ChatSends()
    expect(sends.refused('rate_limited')).toBe(false)
    const answer = sends.add('hi')
    expect(sends.refused('seat_taken')).toBe(false)
    sends.heard([mine(1, 'hi')], YOU)
    await expect(answer).resolves.toBe('sent')
  })

  it('failAll answers every send at once, and the timer stays quiet', async () => {
    const sends = new ChatSends()
    const first = sends.add('one')
    const second = sends.add('two')
    sends.failAll()
    await expect(first).resolves.toBe('failed')
    await expect(second).resolves.toBe('failed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reset forgets the message ids: another room starts over', async () => {
    const sends = new ChatSends()
    sends.heard([mine(50, 'old')], YOU)
    sends.reset()
    const answer = sends.add('hi')
    sends.heard([mine(1, 'hi')], YOU)
    await expect(answer).resolves.toBe('sent')
  })
})

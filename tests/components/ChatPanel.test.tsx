import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHAT_RATE, MAX_CHAT_CHARS, type ChatMessage } from '../../shared/chat.ts'
import { ChatPanel, type ChatPanelProps } from '../../src/components/ChatPanel.tsx'
import { en } from '../../src/i18n/en.ts'
import { setLanguage } from '../../src/i18n/t.ts'
import { zhTW } from '../../src/i18n/zh-TW.ts'
import { ChatDraft } from '../../src/lib/chatState.ts'
import { COMPOSITION_GRACE_MS } from '../../src/lib/chatText.ts'

const YOU = 'm1'

const draftOf = (text: string) => {
  const draft = new ChatDraft()
  draft.write(text)
  return draft
}

const message = (id: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  from: 'm2',
  name: 'Bo',
  text: `message ${id}`,
  at: new Date(2026, 0, 2, 21, 4).getTime(),
  ...over,
})

function setup(over: Partial<ChatPanelProps> = {}) {
  const onSend = vi.fn<ChatPanelProps['onSend']>(() => Promise.resolve('sent'))
  const props: ChatPanelProps = {
    messages: [],
    you: YOU,
    locked: false,
    onSend,
    draftStore: new ChatDraft(),
    ...over,
  }
  const view = render(<ChatPanel {...props} />)
  return {
    ...view,
    onSend,
    props,
    update: (next: Partial<ChatPanelProps>) => view.rerender(<ChatPanel {...props} {...next} />),
  }
}

const box = () => screen.getByRole('textbox', { name: en['chat.inputLabel'] }) as HTMLTextAreaElement
const sendButton = () => screen.getByRole('button', { name: en['chat.send'] })
const log = () => screen.getByRole('log', { name: en['chat.messages'] })
const type = (text: string) => fireEvent.change(box(), { target: { value: text } })
/** Lets the promise onSend returned settle */
const settled = () => act(async () => {})

function clickSend() {
  fireEvent.click(sendButton())
}

beforeEach(() => {
  setLanguage('en')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the list', () => {
  it('says so when there is nothing yet', () => {
    setup()
    expect(within(log()).getByText(en['chat.empty'])).toBeInTheDocument()
  })

  it('shows sender, time and text', () => {
    setup({ messages: [message(1, { name: 'Bo', text: 'hello' })] })
    const item = within(log()).getByRole('listitem')
    expect(item).toHaveTextContent('Bo')
    expect(item).toHaveTextContent(/9:04\sPM/)
    expect(item).toHaveTextContent('hello')
  })

  it('shows the time in the app language', () => {
    setLanguage('zh-TW')
    setup({ messages: [message(1)] })
    expect(screen.getByRole('log')).toHaveTextContent('下午')
  })

  it('marks your own messages only', () => {
    setup({ messages: [message(1), message(2, { from: YOU, name: 'Al' })] })
    const [theirs, mine] = within(log()).getAllByRole('listitem')
    expect(mine).toHaveTextContent(en['chat.you'])
    expect(theirs).not.toHaveTextContent(en['chat.you'])
  })

  it('keeps the name a message was sent under, for someone no longer in the room', () => {
    setup({ messages: [message(1, { from: 'gone', name: 'Gone Guy' })] })
    expect(within(log()).getByText('Gone Guy')).toBeInTheDocument()
  })

  it('renders markup as text, never as HTML', () => {
    const attack = '<img src=x onerror=alert(1)><b>bold</b>'
    setup({ messages: [message(1, { text: attack })] })
    expect(within(log()).getByText(attack)).toBeInTheDocument()
    expect(log().querySelector('img, b')).toBeNull()
  })

  it('makes safe links that open in a new tab, and nothing else', () => {
    setup({
      messages: [message(1, { text: 'see https://a.example/x and javascript:alert(1) now' })],
    })
    const links = within(log()).getAllByRole('link')
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', 'https://a.example/x')
    expect(links[0]).toHaveAttribute('target', '_blank')
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer')
    expect(log()).toHaveTextContent('javascript:alert(1)')
  })

  it('keeps line breaks in the text', () => {
    setup({ messages: [message(1, { text: 'one\ntwo' })] })
    expect(within(log()).getByRole('listitem').textContent).toContain('one\ntwo')
  })
})

describe('following the list', () => {
  /** The list as the browser would lay it out, which jsdom does not */
  function layout(element: HTMLElement, sizes: { scrollHeight: number; clientHeight: number }) {
    Object.defineProperty(element, 'scrollHeight', {
      configurable: true,
      value: sizes.scrollHeight,
    })
    Object.defineProperty(element, 'clientHeight', {
      configurable: true,
      value: sizes.clientHeight,
    })
  }

  const scrollTo = (element: HTMLElement, top: number) => {
    element.scrollTop = top
    fireEvent.scroll(element)
  }

  it('follows a new message while at the bottom', () => {
    const { update } = setup({ messages: [message(1)] })
    layout(log(), { scrollHeight: 1000, clientHeight: 300 })
    scrollTo(log(), 700)
    layout(log(), { scrollHeight: 1100, clientHeight: 300 })

    update({ messages: [message(1), message(2)] })

    expect(log().scrollTop).toBe(1100)
  })

  it('leaves someone reading further up where they are', () => {
    const { update } = setup({ messages: [message(1)] })
    layout(log(), { scrollHeight: 1000, clientHeight: 300 })
    scrollTo(log(), 100)
    layout(log(), { scrollHeight: 1100, clientHeight: 300 })

    update({ messages: [message(1), message(2)] })

    expect(log().scrollTop).toBe(100)
  })

  it('goes back to following once they scroll down again', () => {
    const { update } = setup({ messages: [message(1)] })
    layout(log(), { scrollHeight: 1000, clientHeight: 300 })
    scrollTo(log(), 100)
    scrollTo(log(), 700)
    layout(log(), { scrollHeight: 1100, clientHeight: 300 })

    update({ messages: [message(1), message(2)] })

    expect(log().scrollTop).toBe(1100)
  })

  it('sending takes you to the bottom, to see what you said', async () => {
    setup({ messages: [message(1)] })
    layout(log(), { scrollHeight: 1000, clientHeight: 300 })
    scrollTo(log(), 100)

    type('hi')
    clickSend()
    await settled()

    expect(log().scrollTop).toBe(1000)
  })

  it('does not move for a reset that leaves the reader further up', () => {
    const { update } = setup({ messages: [message(1), message(2)] })
    layout(log(), { scrollHeight: 1000, clientHeight: 300 })
    scrollTo(log(), 100)

    update({ messages: [message(1), { ...message(2) }] })

    expect(log().scrollTop).toBe(100)
  })
})

describe('sending', () => {
  it('sends with the button, normalized, and empties the box', async () => {
    const { onSend, props } = setup()
    type('  hello \r\n there  ')
    clickSend()
    await settled()

    expect(onSend).toHaveBeenCalledExactlyOnceWith('hello \n there')
    expect(box().value).toBe('')
    expect(props.draftStore.read()).toBe('')
  })

  it('has nothing to send while the box is empty or only whitespace', () => {
    const { onSend } = setup()
    expect(sendButton()).toBeDisabled()
    type('   \n ')
    expect(sendButton()).toBeDisabled()
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('Enter sends, Shift+Enter does not', async () => {
    const { onSend } = setup()
    type('hi')
    fireEvent.keyDown(box(), { key: 'Enter', shiftKey: true })
    expect(onSend).not.toHaveBeenCalled()

    fireEvent.keyDown(box(), { key: 'Enter' })
    await settled()
    expect(onSend).toHaveBeenCalledExactlyOnceWith('hi')
  })

  it.each<[string, Parameters<typeof fireEvent.keyDown>[1]]>([
    ['isComposing', { key: 'Enter', isComposing: true }],
    ['keyCode 229', { key: 'Enter', keyCode: 229 }],
  ])('an Enter for an input method (%s) never sends', (_, init) => {
    const { onSend } = setup()
    type('hi')
    fireEvent.keyDown(box(), init)
    expect(onSend).not.toHaveBeenCalled()
    expect(box().value).toBe('hi')
  })

  it('Enter between compositionstart and compositionend never sends', () => {
    const { onSend } = setup()
    type('hi')
    fireEvent.compositionStart(box())
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })

  it('an Enter right after compositionend picked the candidate; a later one sends', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000)
    const { onSend } = setup()
    type('hi')
    fireEvent.compositionStart(box())
    fireEvent.compositionEnd(box())

    now.mockReturnValue(1000 + COMPOSITION_GRACE_MS - 1)
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()

    now.mockReturnValue(1000 + COMPOSITION_GRACE_MS)
    fireEvent.keyDown(box(), { key: 'Enter' })
    await settled()
    expect(onSend).toHaveBeenCalledOnce()
    now.mockRestore()
  })

  describe('on a touch screen', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', () => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    })

    it('Enter is a new line and only the button sends', async () => {
      const { onSend } = setup()
      expect(screen.getByText(en['chat.hintTouch'])).toBeInTheDocument()
      expect(box()).toHaveAttribute('enterkeyhint', 'enter')
      type('hi')

      const notPrevented = fireEvent.keyDown(box(), { key: 'Enter' })
      expect(notPrevented).toBe(true)
      expect(onSend).not.toHaveBeenCalled()

      clickSend()
      await settled()
      expect(onSend).toHaveBeenCalledOnce()
    })
  })
})

describe('when it cannot be sent', () => {
  it.each<['rate_limited' | 'chat_locked' | 'failed', keyof typeof en]>([
    ['rate_limited', 'room.error.rate_limited'],
    ['chat_locked', 'room.error.chat_locked'],
    ['failed', 'chat.sendFailed'],
  ])('%s puts the text back and says why', async (result, key) => {
    const { props } = setup({ onSend: () => Promise.resolve(result) })
    type('precious words')
    clickSend()
    await settled()

    expect(box().value).toBe('precious words')
    expect(props.draftStore.read()).toBe('precious words')
    expect(screen.getByRole('alert')).toHaveTextContent(en[key])
  })

  it('keeps what was typed since, after the text it follows', async () => {
    let answer: (result: 'failed') => void = () => {}
    setup({ onSend: () => new Promise((resolve) => (answer = resolve)) })
    type('first')
    clickSend()
    expect(box().value).toBe('')
    type('second')

    await act(async () => answer('failed'))

    expect(box().value).toBe('first\nsecond')
  })

  it('typing clears the problem', async () => {
    setup({ onSend: () => Promise.resolve('failed') })
    type('hi')
    clickSend()
    await settled()
    type('hi!')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('brings back what the store holds, after the panel was away', () => {
    setup({ draftStore: draftOf('half a thought') })
    expect(box().value).toBe('half a thought')
  })
})

describe('the rate limit', () => {
  it(`after ${CHAT_RATE.count} in the window says too fast and keeps the text`, async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    const { onSend } = setup()
    for (let i = 0; i < CHAT_RATE.count; i++) {
      type(`message ${i}`)
      clickSend()
      await settled()
    }
    expect(onSend).toHaveBeenCalledTimes(CHAT_RATE.count)

    type('one too many')
    clickSend()
    await settled()

    expect(onSend).toHaveBeenCalledTimes(CHAT_RATE.count)
    expect(box().value).toBe('one too many')
    expect(screen.getByRole('alert')).toHaveTextContent(en['room.error.rate_limited'])

    // Once the window has passed the same text goes
    now.mockReturnValue(1_000_000 + CHAT_RATE.windowMs)
    clickSend()
    await settled()
    expect(onSend).toHaveBeenLastCalledWith('one too many')
    expect(box().value).toBe('')
    expect(screen.queryByRole('alert')).toBeNull()
    now.mockRestore()
  })
})

describe('the character limit', () => {
  it('counts down near the limit, in code points', () => {
    setup()
    type('a'.repeat(MAX_CHAT_CHARS - 101))
    expect(screen.queryByText(/characters left/)).toBeNull()
    type('😀'.repeat(MAX_CHAT_CHARS - 100))
    expect(screen.getByText('100 characters left')).toBeInTheDocument()
    type('字'.repeat(MAX_CHAT_CHARS))
    expect(screen.getByText('0 characters left')).toBeInTheDocument()
    expect(sendButton()).toBeEnabled()
  })

  it('over the limit refuses to send, says so and keeps the text', () => {
    const { onSend } = setup()
    const long = '字'.repeat(MAX_CHAT_CHARS + 1)
    type(long)

    expect(sendButton()).toBeDisabled()
    expect(box()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent(
      en['chat.tooLong'].replace('{max}', String(MAX_CHAT_CHARS)),
    )
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
    expect(box().value).toBe(long)
  })
})

describe('when the game locks chat', () => {
  it('disables the box and the button, and says why', () => {
    setup({ locked: true })
    expect(box()).toBeDisabled()
    expect(sendButton()).toBeDisabled()
    expect(screen.getByText(en['chat.locked'])).toBeInTheDocument()
    expect(box()).toHaveAccessibleDescription(en['chat.locked'])
  })

  it('keeps the text through the lock, and the messages stay readable', () => {
    const { update } = setup({ messages: [message(1)] })
    type('wait for it')

    update({ locked: true, messages: [message(1)] })
    expect(box().value).toBe('wait for it')
    expect(within(log()).getByRole('listitem')).toHaveTextContent('message 1')

    update({ locked: false, messages: [message(1)] })
    expect(box()).toBeEnabled()
    expect(box().value).toBe('wait for it')
  })

  it('sends nothing, even if the form is submitted', () => {
    const { onSend } = setup({ locked: true, draftStore: draftOf('hi') })
    fireEvent.submit(box().closest('form') as HTMLFormElement)
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('words', () => {
  it('follows the language', () => {
    setLanguage('zh-TW')
    setup()
    expect(screen.getByRole('button', { name: zhTW['chat.send'] })).toBeInTheDocument()
    expect(screen.getByRole('log', { name: zhTW['chat.messages'] })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: zhTW['chat.inputLabel'] })).toBeInTheDocument()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Dialog } from '../../src/components/Dialog.tsx'
import { setLanguage } from '../../src/i18n/t.ts'

// jsdom has <dialog> but not its methods. Real-browser behaviour (focus trap, Esc) is not covered here.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open')
  }
})

function setup(open = true) {
  const onClose = vi.fn()
  const view = render(
    <Dialog open={open} onClose={onClose} title="Leave room" actions={<button>Leave</button>}>
      Body text
    </Dialog>,
  )
  return { onClose, ...view }
}

const dialog = () => screen.getByRole('dialog', { name: 'Leave room' })

describe('Dialog', () => {
  it('opens as a modal labelled by its title, with its content and actions', () => {
    setup()
    expect(dialog()).toHaveAttribute('open')
    expect(screen.getByText('Body text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Leave' })).toBeInTheDocument()
  })

  it('renders nothing visible while closed, and follows the open prop', () => {
    const onClose = vi.fn()
    const content = (open: boolean) => (
      <Dialog open={open} onClose={onClose} title="Leave room">
        Body text
      </Dialog>
    )
    const { rerender } = render(content(false))
    expect(screen.queryByText('Body text')).not.toBeInTheDocument()

    rerender(content(true))
    expect(dialog()).toHaveAttribute('open')
    expect(screen.getByText('Body text')).toBeInTheDocument()

    rerender(content(false))
    expect(screen.queryByText('Body text')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks to close from the close button', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('asks to close on Esc, keeping the dialog open until the parent decides', () => {
    const { onClose } = setup()
    const event = new Event('cancel', { cancelable: true })
    dialog().dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog()).toHaveAttribute('open')
  })

  it('tells the parent when the browser closes the dialog itself', () => {
    const { onClose } = setup()
    fireEvent(dialog(), new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('asks to close on a backdrop click, but not on a click inside', () => {
    const { onClose } = setup()
    fireEvent.click(screen.getByText('Body text'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(dialog())
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('translates its close button', () => {
    setLanguage('zh-TW')
    setup()
    expect(screen.getByRole('button', { name: '關閉' })).toBeInTheDocument()
    setLanguage('en')
  })
})

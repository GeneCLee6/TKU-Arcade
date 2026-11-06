import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../src/components/Toast.tsx'
import { useToast, type ShowToast } from '../../src/components/useToast.ts'

let show: ShowToast

function Grab() {
  const toast = useToast()
  useEffect(() => {
    show = toast
  }, [toast])
  return null
}

function setup() {
  render(
    <ToastProvider>
      <Grab />
    </ToastProvider>,
  )
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Toast', () => {
  it('shows a message inside a live region that was already in the page', () => {
    setup()
    const region = document.querySelector('[aria-live="polite"]')
    expect(region).toBeEmptyDOMElement()
    act(() => show('Room created'))
    expect(region).toHaveTextContent('Room created')
  })

  it('disappears by itself after its duration', () => {
    setup()
    act(() => show('Soon gone', { duration: 1000 }))
    act(() => vi.advanceTimersByTime(999))
    expect(screen.getByText('Soon gone')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Soon gone')).not.toBeInTheDocument()
  })

  it('can be closed by hand', () => {
    setup()
    act(() => show('Close me'))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('Close me')).not.toBeInTheDocument()
  })

  it('announces only danger as an alert', () => {
    setup()
    act(() => show('Fine', { tone: 'success' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    act(() => show('Broken', { tone: 'danger' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Broken')
  })

  it('keeps at most three, dropping the oldest', () => {
    setup()
    act(() => {
      for (const message of ['one', 'two', 'three', 'four']) show(message)
    })
    expect(screen.queryByText('one')).not.toBeInTheDocument()
    expect(screen.getByText('four')).toBeInTheDocument()
  })

  it('useToast outside the provider fails clearly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Grab />)).toThrow('useToast must be used inside <ToastProvider>')
    vi.restoreAllMocks()
  })
})

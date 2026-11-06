import { fireEvent, render, screen } from '@testing-library/react'
import { useLayoutEffect, useRef } from 'react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Drawer } from '../../src/components/Drawer.tsx'
import { en } from '../../src/i18n/en.ts'
import { stubDialog } from '../lib/stubDialog.ts'

beforeAll(() => stubDialog())

const dialog = () => document.querySelector('dialog') as HTMLDialogElement

describe('Drawer', () => {
  it('shows its title and content only while open', () => {
    const { rerender } = render(
      <Drawer open={false} onClose={() => {}} title="Room">
        <p>inside</p>
      </Drawer>,
    )
    expect(screen.queryByText('inside')).toBeNull()
    expect(dialog().open).toBe(false)

    rerender(
      <Drawer open onClose={() => {}} title="Room">
        <p>inside</p>
      </Drawer>,
    )
    expect(dialog().open).toBe(true)
    expect(screen.getByRole('dialog', { name: 'Room' })).toBeInTheDocument()
    expect(screen.getByText('inside')).toBeInTheDocument()

    rerender(
      <Drawer open={false} onClose={() => {}} title="Room">
        <p>inside</p>
      </Drawer>,
    )
    expect(dialog().open).toBe(false)
    expect(screen.queryByText('inside')).toBeNull()
  })

  it('mounts its content after the dialog is showing, so that it can measure itself', () => {
    let openWhenMounted: boolean | null = null
    function Measures() {
      const ref = useRef<HTMLParagraphElement>(null)
      useLayoutEffect(() => {
        openWhenMounted = ref.current?.closest('dialog')?.open ?? null
      }, [])
      return <p ref={ref}>inside</p>
    }
    render(
      <Drawer open onClose={() => {}} title="Room">
        <Measures />
      </Drawer>,
    )
    expect(openWhenMounted).toBe(true)
  })

  it('asks to close from its button, Esc and the backdrop, but not from a click inside', () => {
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} title="Room">
        <p>inside</p>
      </Drawer>,
    )
    fireEvent.click(screen.getByRole('button', { name: en['common.close'] }))
    expect(onClose).toHaveBeenCalledTimes(1)

    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog(), cancel)
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(cancel.defaultPrevented).toBe(true)

    fireEvent.click(dialog())
    expect(onClose).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByText('inside'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('stays in step when the browser closes it by itself', () => {
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} title="Room">
        <p>inside</p>
      </Drawer>,
    )
    fireEvent(dialog(), new Event('close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NicknameForm } from '../../src/components/NicknameForm.tsx'
import { initLanguage } from '../../src/i18n/t.ts'

const KEY = 'tku-arcade.nickname'

const field = () => screen.getByLabelText('Nickname')
const type = (value: string) => fireEvent.change(field(), { target: { value } })
const submit = () => fireEvent.submit(field().closest('form')!)

beforeEach(() => {
  localStorage.clear()
  initLanguage()
})

describe('NicknameForm', () => {
  it('has a visible label and takes the focus', () => {
    render(<NicknameForm onSubmit={vi.fn()} />)
    expect(screen.getByText('Nickname').tagName).toBe('LABEL')
    expect(field()).toHaveFocus()
  })

  it('marks the input for a modal, whose showModal() would otherwise focus its Close button', () => {
    render(<NicknameForm onSubmit={vi.fn()} />)
    expect(field()).toHaveAttribute('autofocus')
  })

  it('prefills from storage', () => {
    localStorage.setItem(KEY, 'Al')
    render(<NicknameForm onSubmit={vi.fn()} />)
    expect(field()).toHaveValue('Al')
  })

  it('stores and hands on the normalized name', () => {
    const onSubmit = vi.fn()
    render(<NicknameForm onSubmit={onSubmit} />)
    type('  Al   Lee ')
    submit()
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('Al Lee')
    expect(localStorage.getItem(KEY)).toBe('Al Lee')
  })

  it.each([
    ['empty', ''],
    ['blank', '   '],
    ['too long', 'x'.repeat(17)],
  ])('refuses %s with an inline error stating the limit', (_, value) => {
    const onSubmit = vi.fn()
    render(<NicknameForm onSubmit={onSubmit} />)
    type(value)
    submit()
    expect(screen.getByRole('alert')).toHaveTextContent('Use 1 to 16 characters.')
    expect(field()).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('counts characters, not UTF-16 units: 16 emoji pass', () => {
    const onSubmit = vi.fn()
    render(<NicknameForm onSubmit={onSubmit} />)
    type('😀'.repeat(16))
    submit()
    expect(onSubmit).toHaveBeenCalledWith('😀'.repeat(16))
  })

  it('clears the error on typing', () => {
    render(<NicknameForm onSubmit={vi.fn()} />)
    submit()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    type('A')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

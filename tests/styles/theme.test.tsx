import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeSwitch } from '../../src/components/ThemeSwitch.tsx'
import { initTheme, setThemePreference } from '../../src/styles/theme.ts'

const root = document.documentElement

beforeEach(() => {
  localStorage.clear()
  initTheme()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('theme preference', () => {
  it('is dark by default (E1): pinned on <html>, nothing stored', () => {
    expect(root.dataset.theme).toBe('dark')
    expect(localStorage.getItem('tku-arcade.theme')).toBeNull()
  })

  it('pins a choice on <html> and restores it on the next visit', () => {
    setThemePreference('dark')
    expect(root.dataset.theme).toBe('dark')

    root.removeAttribute('data-theme')
    initTheme()
    expect(root.dataset.theme).toBe('dark')
  })

  it('following the system removes the pin, and the next visit remembers that', () => {
    setThemePreference('light')
    setThemePreference('system')
    expect(root.dataset.theme).toBeUndefined()
    initTheme()
    expect(root.dataset.theme).toBeUndefined()
  })

  it('going back to dark forgets the stored value', () => {
    setThemePreference('light')
    setThemePreference('dark')
    expect(localStorage.getItem('tku-arcade.theme')).toBeNull()
    expect(root.dataset.theme).toBe('dark')
  })

  it('ignores an invalid stored value', () => {
    localStorage.setItem('tku-arcade.theme', 'neon')
    initTheme()
    expect(root.dataset.theme).toBe('dark')
  })

  it('still works when localStorage is unavailable', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => initTheme()).not.toThrow()
    expect(() => setThemePreference('dark')).not.toThrow()
    expect(root.dataset.theme).toBe('dark')
  })

  it('ThemeSwitch shows the current choice and changes it', () => {
    render(<ThemeSwitch />)
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'false')
    expect(root.dataset.theme).toBe('light')
  })
})

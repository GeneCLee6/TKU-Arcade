import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { APP_NAME } from '../../shared/app.ts'
import { App } from '../../src/App.tsx'
import { initLanguage } from '../../src/i18n/t.ts'

beforeEach(() => {
  localStorage.clear()
  initLanguage()
})

describe('App', () => {
  it('renders the home page with the product name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument()
  })

  it('switches the page language, and the product name stays the same', () => {
    render(<App />)
    expect(screen.getByText('Pick a game and play with friends.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '繁中' }))

    expect(screen.getByText('選一款遊戲，和朋友一起玩。')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument()
  })
})

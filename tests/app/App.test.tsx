import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { APP_NAME } from '../../shared/app.ts'
import { App } from '../../src/App.tsx'

describe('App', () => {
  it('renders the home page with the product name', () => {
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: APP_NAME })).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { CareerRoutes } from '../../../src/games/promotion/CareerRoutes.tsx'

// QA sweep 2026-11: a long career scrolls inside its block, so the block takes keyboard focus
// (axe's scrollable-region-focusable is serious)
it('lets a keyboard scroll each career', () => {
  const lines = Array.from({ length: 30 }, (_, at) => ({ round: `R${at + 1}`, what: 'rolled', cells: [], notes: [] }))
  render(<CareerRoutes title="Careers" explain="" routes={[{ seat: 0, name: 'Ann', summary: 'up', lines }]} />)
  expect(screen.getByRole('list', { name: 'Ann' })).toHaveAttribute('tabindex', '0')
})

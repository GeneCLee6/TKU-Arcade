import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { HowToPlay } from '../../src/components/HowToPlay.tsx'
import { setLanguage } from '../../src/i18n/t.ts'
import { RulesPage } from '../../src/pages/RulesPage.tsx'
import { stubDialog } from '../lib/stubDialog.ts'

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/games/:id/rules" element={<RulesPage />} />
      </Routes>
    </MemoryRouter>,
  )

beforeAll(() => stubDialog())
beforeEach(() => setLanguage('en'))

describe('the rules page', () => {
  it('shows a game its rules, under the page title', async () => {
    open('/games/promotion/rules')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('How to play Promotion')
    expect(
      await screen.findByRole('heading', { level: 2, name: 'What is Promotion?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('follows the language', async () => {
    open('/games/promotion/rules')
    await screen.findByRole('heading', { name: 'What is Promotion?' })
    act(() => setLanguage('zh-TW'))
    expect(await screen.findByRole('heading', { name: '什麼是升官圖？' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('升官圖怎麼玩')
  })

  it.each(['tictactoe', 'no-such-game'])('is not found for %s, which has none', (id) => {
    open(`/games/${id}/rules`)
    expect(screen.queryByRole('heading', { name: /how to play/i })).toBeNull()
  })
})

describe('how to play, in the room', () => {
  it('reads the same text, loaded when opened, a level down from the dialog', async () => {
    render(<HowToPlay gameId="promotion" />)
    expect(screen.queryByRole('heading', { name: 'What is Promotion?' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'How to play' }))
    expect(
      await screen.findByRole('heading', { level: 3, name: 'What is Promotion?' }),
    ).toBeInTheDocument()
  })

  it('is not offered for a game with no rules', () => {
    render(<HowToPlay gameId="tictactoe" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

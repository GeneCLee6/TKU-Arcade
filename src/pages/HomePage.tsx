import styled from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { color } from '../styles/tokens.ts'

// Placeholder home page (e12-t01). It shows only the product name: every other UI string waits
// for i18n t() (A2, CLAUDE.md rule 2).
export function HomePage() {
  return (
    <Main>
      <Title $size={2.5}>{APP_NAME}</Title>
    </Main>
  )
}

const Main = styled.main`
  min-height: 100vh;
  display: grid;
  place-items: center;
`

const Title = styled.h1<{ $size: number }>`
  margin: 0;
  font-size: ${(p) => p.$size}rem;
  color: ${color.fg};
`

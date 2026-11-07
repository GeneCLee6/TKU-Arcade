import { Link, useParams } from 'react-router-dom'
import styled from 'styled-components'
import { RulesText } from '../components/RulesText.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { hasRules } from '../lib/rulesDoc.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { NotFoundPage } from './NotFoundPage.tsx'

/** `/games/<id>/rules`: a game's rules, readable without a room */
export function RulesPage() {
  const t = useT()
  const { id = '' } = useParams()
  if (!hasRules(id)) return <NotFoundPage />
  return (
    <>
      <TopBar />
      <Main>
        <Title>{t('rules.pageTitle', { game: gameTitle(t, id) })}</Title>
        <RulesText gameId={id} />
        <BackLink to="/">{t('room.backToLobby')}</BackLink>
      </Main>
    </>
  )
}

const Main = styled.main`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.lg}px;
  width: min(720px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px;
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.xl}px;
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  justify-self: start;
  color: ${color.text};
`

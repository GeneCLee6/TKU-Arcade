import styled from 'styled-components'
import { RulesText } from '../components/RulesText.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { Link } from '../lib/router.tsx'
import { hasRules } from '../lib/rulesDoc.ts'
import { useParams } from '../lib/useRouter.ts'
import { displayType, glass } from '../styles/esports.ts'
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
      {/* The game's hue for the whole page (GlobalStyle) */}
      <Main data-game={id}>
        <Title>{t('rules.pageTitle', { game: gameTitle(t, id) })}</Title>
        <Doc>
          <RulesText gameId={id} />
        </Doc>
        <BackLink to="/">{t('room.backToLobby')}</BackLink>
      </Main>
    </>
  )
}

const Main = styled.main`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.xl}px;
  width: min(800px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px ${space.xxxl}px;
`

const Title = styled.h1`
  margin: 0;
  ${displayType}
  font-size: clamp(${fontSize.xl}px, 5vw, 48px);
  line-height: 1.05;
  overflow-wrap: anywhere;
`

// The rules on a glass panel, roomy as a page to read
const Doc = styled.article`
  ${glass}
  padding: ${space.xl}px clamp(${space.lg}px, 4vw, ${space.xxxl}px) ${space.xxl}px;
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  justify-self: start;
  color: ${color.text};
`

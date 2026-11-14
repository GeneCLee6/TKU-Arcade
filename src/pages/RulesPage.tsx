import styled from 'styled-components'
import { RulesText } from '../components/RulesText.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { Link } from '../lib/router.tsx'
import { hasRules, type RulesEdition } from '../lib/rulesList.ts'
import { useLocation, useParams } from '../lib/useRouter.ts'
import { displayType, glass } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { NotFoundPage } from './NotFoundPage.tsx'

/**
 * `/games/<id>/rules`: a game's rules, readable without a room. A game with a full edition as well
 * (promotion, C7) has a link to each, `?edition=full` for the full one
 */
export function RulesPage() {
  const t = useT()
  const { id = '' } = useParams()
  const { search } = useLocation()
  if (!hasRules(id)) return <NotFoundPage />
  const two = hasRules(id, 'full')
  const edition: RulesEdition = two && new URLSearchParams(search).get('edition') === 'full' ? 'full' : 'simple'
  return (
    <>
      <TopBar />
      {/* The game's hue for the whole page (GlobalStyle) */}
      <Main data-game={id}>
        <Title>{t('rules.pageTitle', { game: gameTitle(t, id) })}</Title>
        {two && (
          <Editions aria-label={t('rules.editions')}>
            {(['simple', 'full'] as const).map((each) => (
              <EditionLink
                key={each}
                to={each === 'full' ? `/games/${id}/rules?edition=full` : `/games/${id}/rules`}
                aria-current={each === edition ? 'page' : undefined}
                $current={each === edition}
              >
                {t(`rules.edition.${each}`)}
              </EditionLink>
            ))}
          </Editions>
        )}
        <Doc>
          <RulesText gameId={id} edition={edition} />
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

const Editions = styled.nav`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const EditionLink = styled(Link)<{ $current: boolean }>`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 ${space.lg}px;
  border: 1px solid ${(p) => (p.$current ? color.text : color.border)};
  border-radius: 4px;
  color: ${color.text};
  font-weight: ${(p) => (p.$current ? 700 : 400)};
  text-decoration: none;
  background: ${(p) => (p.$current ? color.surface : 'transparent')};
`

const BackLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  justify-self: start;
  color: ${color.text};
`

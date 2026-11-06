import styled from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { ThemeSwitch } from '../components/ThemeSwitch.tsx'
import { LanguageSwitch } from '../i18n/LanguageSwitch.tsx'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

// Placeholder home page until the lobby (e1): the product name, a tagline and the switches
export function HomePage() {
  const t = useT()
  return (
    <Page>
      <Header>
        <ThemeSwitch />
        <LanguageSwitch />
      </Header>
      <Main>
        <Title>{APP_NAME}</Title>
        <Tagline>{t('home.tagline')}</Tagline>
      </Main>
    </Page>
  )
}

const Page = styled.div`
  min-height: 100dvh;
  display: grid;
  grid-template-rows: auto 1fr;
`

const Header = styled.header`
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
`

const Main = styled.main`
  display: grid;
  place-content: center;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
  text-align: center;
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.xxl}px;
`

const Tagline = styled.p`
  margin: 0;
  color: ${color.muted};
`

import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { TopBar } from '../components/TopBar.tsx'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

/** Any path that is no page of ours (the Worker answers them all with the app) */
export function NotFoundPage() {
  const t = useT()
  return (
    <>
      <TopBar />
      <Main>
        <Title>{t('notFound.title')}</Title>
        <Hint>{t('notFound.hint')}</Hint>
        <Link to="/">{t('notFound.home')}</Link>
      </Main>
    </>
  )
}

const Main = styled.main`
  display: grid;
  gap: ${space.md}px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px;
`

const Title = styled.h1`
  margin: 0;
  font-size: ${fontSize.xl}px;
`

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
`

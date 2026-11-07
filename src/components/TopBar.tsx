import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { LanguageSwitch } from '../i18n/LanguageSwitch.tsx'
import { color, space } from '../styles/tokens.ts'
import { ThemeSwitch } from './ThemeSwitch.tsx'

export function TopBar() {
  return (
    <Bar>
      <Brand to="/">{APP_NAME}</Brand>
      <Switches>
        <ThemeSwitch />
        <LanguageSwitch />
      </Switches>
    </Bar>
  )
}

const Bar = styled.header`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
  padding: ${space.md}px ${space.lg}px;
  border-bottom: 1px solid ${color.border};

  /* The switches' taller touch targets are paid for here, so a phone's game keeps its height */
  @media (max-width: 480px) {
    padding: ${space.sm}px ${space.lg}px;
  }
`

const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  color: ${color.text};
  font-weight: 600;
  text-decoration: none;
`

const Switches = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;

  @media (max-width: 480px) {
    gap: ${space.xs}px;
  }
`

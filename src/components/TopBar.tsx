import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { LanguageSwitch } from '../i18n/LanguageSwitch.tsx'
import { color, font, fontSize, space } from '../styles/tokens.ts'
import { ThemeSwitch } from './ThemeSwitch.tsx'

export function TopBar() {
  return (
    <Bar>
      <Brand to="/">
        {/* The mark (public/favicon.svg, E3): a badge with its own night fill, so one file suits both
            themes. A file, not JSX, so that it costs the first load nothing but its URL */}
        <img src="/favicon.svg" alt="" width={32} height={32} />
        <BrandName>{APP_NAME}</BrandName>
      </Brand>
      <Switches>
        <ThemeSwitch />
        <LanguageSwitch />
      </Switches>
    </Bar>
  )
}

// Glass, stuck to the top. One row down to a 360 px phone (e2e/mobile.spec.ts)
const Bar = styled.header`
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
  padding: ${space.sm}px ${space.lg}px;
  background: ${color.panel};
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  box-shadow: 0 1px 0 ${color.line};

  @media (min-width: 900px) {
    padding: ${space.sm}px ${space.xxl}px;
  }
`

const Brand = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;
  color: ${color.text};
  font-family: ${font.display};
  font-size: ${fontSize.lg}px;
  font-style: italic;
  font-weight: 900;
  letter-spacing: 0.06em;
  text-decoration: none;
  white-space: nowrap;
`

// On the smallest phones the mark alone, so that the switches keep to the same row; the link is
// still named, as the name is only out of sight
const BrandName = styled.span`
  @media (max-width: 400px) {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
`

const Switches = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.md}px;

  @media (max-width: 480px) {
    gap: ${space.xs}px;
  }
`

import styled from 'styled-components'
import { APP_NAME } from '../../shared/app.ts'
import { LanguageSwitch } from '../i18n/LanguageSwitch.tsx'
import { Link } from '../lib/router.tsx'
import { color, font, fontSize, space } from '../styles/tokens.ts'
import { ThemeSwitch } from './ThemeSwitch.tsx'

export function TopBar() {
  return (
    <Bar>
      <Brand to="/">
        <Mark />
        <BrandName>{APP_NAME}</BrandName>
      </Brand>
      <Switches>
        <ThemeSwitch />
        <LanguageSwitch />
      </Switches>
    </Bar>
  )
}

/** Two slanted chevrons, cyan and magenta: the site's own mark, drawn here */
function Mark() {
  return (
    <MarkSvg viewBox="0 0 40 30" aria-hidden="true" focusable="false">
      <polygon className="cyan" points="8,0 22,0 14,15 22,30 8,30 16,15" />
      <polygon className="magenta" points="22,0 36,0 28,15 36,30 22,30 30,15" />
    </MarkSvg>
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

const MarkSvg = styled.svg`
  flex: none;
  width: 34px;
  height: 26px;

  .cyan {
    fill: ${color.brand};
  }

  .magenta {
    fill: ${color.magenta};
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

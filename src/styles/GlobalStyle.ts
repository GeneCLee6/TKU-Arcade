import { createGlobalStyle } from 'styled-components'
import { color, colorVariables, font, fontSize, lineHeight, palette } from './tokens.ts'

// Base page styles. The theme follows the system unless theme.ts pins one with <html data-theme>.
export const GlobalStyle = createGlobalStyle`
  :root {
    color-scheme: light;
    ${colorVariables(palette.light)}
  }

  @media (prefers-color-scheme: dark) {
    :root:not([data-theme='light']) {
      color-scheme: dark;
      ${colorVariables(palette.dark)}
    }
  }

  :root[data-theme='dark'] {
    color-scheme: dark;
    ${colorVariables(palette.dark)}
  }

  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: ${color.bg};
    color: ${color.text};
    font-family: ${font.sans};
    font-size: ${fontSize.md}px;
    line-height: ${lineHeight};
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  :focus-visible {
    outline: 2px solid ${color.accent};
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`

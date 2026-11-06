import { createGlobalStyle } from 'styled-components'
import { color, font } from './tokens.ts'

// Base page styles; colours only from tokens.ts
export const GlobalStyle = createGlobalStyle`
  *, *::before, *::after {
    box-sizing: border-box;
  }

  body {
    margin: 0;
    background: ${color.bg};
    color: ${color.fg};
    font-family: ${font.sans};
  }
`

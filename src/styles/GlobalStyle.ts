import { createGlobalStyle } from 'styled-components'
import { color, colorVariables, font, fontSize, gameHues, lineHeight, palette } from './tokens.ts'

// While a room of a game is open its hue is the page's accent: the top bar, the glow, the buttons
const gameHueRules = Object.entries(gameHues)
  .map(([id, name]) => `:root:has([data-game='${id}']) { --color-accent: var(--color-${name}); }`)
  .join('\n')

// Base page styles. Dark unless theme.ts pins light or system with <html data-theme>.
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

  ${gameHueRules}

  *, *::before, *::after {
    box-sizing: border-box;
  }

  /* On <html>, not <body>: the glow and the grid floor below sit between the two */
  html {
    background: ${color.bg};
  }

  body {
    margin: 0;
    color: ${color.text};
    font-family: ${font.sans};
    font-size: ${fontSize.md}px;
    line-height: ${lineHeight};
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  /* The night sky: the current hue's glow up at the right, magenta down at the left */
  body::before,
  body::after {
    content: '';
    position: fixed;
    z-index: -1;
    pointer-events: none;
  }

  body::before {
    inset: 0;
    background:
      radial-gradient(55% 45% at 80% 8%, color-mix(in srgb, ${color.accent} 18%, transparent), transparent 70%),
      radial-gradient(45% 40% at 4% 100%, color-mix(in srgb, ${color.magenta} 12%, transparent), transparent 70%);
  }

  /* A faint grid floor in perspective. Still on purpose: a moving one repaints the whole page */
  body::after {
    left: -60%;
    right: -60%;
    bottom: 0;
    height: 50%;
    background-image:
      linear-gradient(color-mix(in srgb, ${color.accent} 24%, transparent) 1px, transparent 1px),
      linear-gradient(90deg, color-mix(in srgb, ${color.accent} 24%, transparent) 1px, transparent 1px);
    background-size: 64px 64px;
    transform: perspective(520px) rotateX(64deg);
    transform-origin: bottom;
    -webkit-mask-image: linear-gradient(to top, ${color.text}, transparent 80%);
    mask-image: linear-gradient(to top, ${color.text}, transparent 80%);
  }

  /* :root so that it beats a component's own outline, such as the one marking whose turn it is */
  :root :focus-visible {
    outline: 2px solid ${color.accent};
    outline-offset: 3px;
  }

  /* What Tab lands on must not end up behind the phone layout's dock, stuck to the bottom */
  @media (max-width: 899px) {
    html {
      scroll-padding-bottom: 140px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`

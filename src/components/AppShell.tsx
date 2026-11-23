// The app shell (2026-11-23, docs/DESIGN.md §4.1): a room is one
// screen like a game's, not a page. Loaded with the room's chunk, never the lobby's.
import { useEffect } from 'react'
import { createGlobalStyle } from 'styled-components'

/**
 * 2026-11-23 (the owner: "like a game installed on the desktop, not a web page"): a room is one
 * screen. The page itself never scrolls, bounces or pinch-zooms; the game, its dock and the side
 * panels share the screen, and only a panel scrolls, inside itself. `data-app-shell` on <html> for as
 * long as a room is open; the rules are in AppShellStyle below (docs/DESIGN.md §4.1)
 */
function useAppShell() {
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-app-shell', '')
    return () => root.removeAttribute('data-app-shell')
  }, [])
}

// Not in the lobby's chunk: the lobby still scrolls as a page does. Under the body, the root is a column the height of the screen: the top bar, then the room (Main) taking the rest. A
// phone on its side has no height for the site's bar: the room's own bar has the way out
const AppShellStyle = createGlobalStyle`
  :root[data-app-shell] {
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;

    & body {
      position: fixed;
      inset: 0;
      overflow: hidden;
      overscroll-behavior: none;
      touch-action: pan-x pan-y;
    }

    & #root {
      display: flex;
      flex-direction: column;
      height: 100%;
    }

    @media (max-height: 560px) {
      & #root > header {
        display: none;
      }
    }
  }
`

/** Holds the page to one screen for as long as it is rendered */
export function AppShell() {
  useAppShell()
  return <AppShellStyle />
}

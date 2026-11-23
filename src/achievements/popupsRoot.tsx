// 2026-11-23 (e11-t06): the badges' own React root, put on the page with the first badge (popups.ts)
import { createRoot } from 'react-dom/client'
import { Popups } from './Popups.tsx'

/** Puts the badges on the page, once */
export function mountPopups(): void {
  if (document.getElementById('achievement-popups')) return
  const host = document.createElement('div')
  host.id = 'achievement-popups'
  // Full screen's fallback hides the page's chrome, not these (src/lib/fullscreen.ts)
  host.setAttribute('data-inert-keep', '')
  document.body.append(host)
  createRoot(host).render(<Popups />)
}

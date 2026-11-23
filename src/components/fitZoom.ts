// The game drawn to fit the stage's height (the app shell, docs/ARCHITECTURE.md §4.97). Loaded
// after the game's first paint, through GameLayout's useFitZoom: no room's first screen pays for it.

/**
 * The smallest the game is drawn to fit the screen: below it, its buttons get too small to click. A
 * phone held upright keeps its finger-sized buttons (44 px) and scrolls the stage instead; one on its
 * side has too little height for that, and gets the same as a mouse
 */
const MIN_ZOOM = 0.75
const minZoom = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse) and (min-height: 561px)').matches
    ? 1
    : MIN_ZOOM

/**
 * 2026-11-23 (app shell): the game drawn smaller where the screen is short, so that all of it is in
 * sight (as promotion's board fits itself, e3-t10, which keeps its own: `data-fit-screen`). CSS zoom,
 * not a transform: the game lays itself out again in the width it gets, and taps land where they
 * look. Never under MIN_ZOOM; what is still too tall scrolls inside the stage. Set on the element, not
 * through React, so that a new card or a longer line refits without a render. It only shrinks while
 * the screen keeps its size (a few tries: a wider layout is shorter), and starts over at full size
 * when the screen changes.
 * Outside the app shell (a replay) the stage is as tall as the game, which then never needs it
 */
export function fitZoom(stage: HTMLElement, box: HTMLElement, enabled: boolean): () => void {
  let zoom = 1
  let tries: number[] = []
  let later = 0
  let size = ''
  const fit = () => {
    // A stage that scrolls takes the focus, so that a keyboard can scroll it too (axe); one that
    // does not stays out of the way (promotion's focus mode keeps the Tab key inside its board)
    if (stage.scrollHeight > stage.clientHeight + 1) stage.tabIndex = 0
    else stage.removeAttribute('tabindex')
    if (!enabled || box.querySelector('[data-fit-screen]')) return
    // Bigger again only when the stage itself changes (the screen, the dock), never on the game's
    // own changes: a fit that grew again whenever the wider layout came out shorter would shrink
    // and grow by turns, and nothing under a finger (or a test's click) would hold still
    const now = `${stage.clientWidth}x${stage.clientHeight}`
    const resized = now !== size
    size = now
    const room = stage.clientHeight
    const tall = box.getBoundingClientRect().height
    if (room <= 0 || tall <= 0) return
    const want = Math.max(minZoom(), Math.min(1, Math.floor((zoom * room * 100) / tall) / 100))
    const shrink = tall > room + 1 && want < zoom
    const grow = resized && tall < room && want > zoom + 0.04
    if (!shrink && !grow) return
    const at = performance.now()
    tries = tries.filter((one) => at - one < 1000)
    if (tries.length >= 10) {
      // Settled or not, one more look once the second is over
      window.clearTimeout(later)
      later = window.setTimeout(fit, 1000)
      return
    }
    tries.push(at)
    zoom = want
    box.style.zoom = zoom === 1 ? '' : String(zoom)
    if (stage.scrollHeight <= stage.clientHeight + 1) stage.removeAttribute('tabindex')
  }
  const observer = new ResizeObserver(fit)
  observer.observe(stage)
  observer.observe(box)
  return () => {
    observer.disconnect()
    window.clearTimeout(later)
    box.style.zoom = ''
  }
}

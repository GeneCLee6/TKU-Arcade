import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

export interface BoardFitSpace {
  /** How tall the stage may be, or null to leave it alone */
  stage: number | null
  /** The board's box, for the board to fit into; null until measured */
  box: { width: number; height: number } | null
  /**
   * Refs for the stage and the board's box. Callbacks, not objects: the room's layout moves the game
   * to another place in the page when the window crosses a breakpoint, and the new elements must be
   * the ones observed
   */
  stageRef(element: HTMLElement | null): void
  boxRef(element: HTMLElement | null): void
}

/** The board never gets less than this, however much else the page has to show */
export const MIN_STAGE = 240
/** Between the stage and the dock under it, and under the dock */
export const BELOW = 20
/**
 * A screen this short or shorter (a phone on its side) is where the stage may take the whole screen:
 * the top bar is not stuck to the top there (TopBar.tsx), so nothing covers a stage scrolled up to it.
 * On a taller one a page scrolled down would leave the result, shown above the board, out of sight
 */
export const SHORT_SCREEN = 500

/**
 * The stage's height: the screen below where the stage starts, less the dock and the gap round it.
 * Where that is less than the board's least on a short screen (a phone on its side, 2026-11-23: the bar, the room's
 * heading and the dock left the board under a third of the screen, the foot of it out of sight), the
 * whole screen above the dock instead, and the page scrolls the stage up to the top (useBoardFit).
 * Pure, so that it is the same number for the same screen whatever the dock happens to say
 */
export const stageHeight = (screen: number, top: number, dock: number): number => {
  const below = Math.floor(screen - top - dock - BELOW)
  return below < MIN_STAGE && screen <= SHORT_SCREEN ? Math.max(MIN_STAGE, below + Math.floor(top)) : Math.max(MIN_STAGE, below)
}

/**
 * The space for the whole board (e3-t10). The stage, from where it starts on the page, takes what is
 * left of the screen above the dock, the bar the turn and the roll are in (the parent of `dock`), so
 * that all of it is on the screen at once; `fitStage` off (full screen) leaves its height to CSS.
 * Nothing is measured where nothing can be (tests): the board then fills the width it has.
 *
 * It follows the screen, not the game: the window's size and turning, full screen coming and going,
 * and the dock's own size, which holds still while playing (its lines have fixed heights). What the
 * dock or the page says on a roll never reaches it, so the board is not refitted, nor its zoom moved,
 * on every roll. Something new above the stage (a countdown, a seat to cover) moves the stage's top,
 * and the check after each render catches that; it sets the same number when nothing moved, which
 * React ignores.
 */
export function useBoardFit(dock: RefObject<HTMLElement | null>, fitStage: boolean): BoardFitSpace {
  const [height, setHeight] = useState<number | null>(null)
  const [box, setBox] = useState<BoardFitSpace['box']>(null)
  const [stage, stageRef] = useState<HTMLElement | null>(null)
  const [element, boxRef] = useState<HTMLElement | null>(null)
  const measureRef = useRef<(() => void) | null>(null)

  useLayoutEffect(() => {
    if (!stage || typeof ResizeObserver !== 'function') return undefined
    const bar = dock.current?.parentElement ?? null
    // A stage that takes the whole screen (see stageHeight) comes up to the top of it, once each time
    // it is fitted (the game opens, focus mode ends): from there the board and the dock are all on
    // the screen, the bar and the heading a scroll up (not stuck on so short a screen, TopBar.tsx)
    let brought = false
    const measure = () => {
      if (!fitStage) {
        setHeight(null)
        return
      }
      const top = stage.getBoundingClientRect().top + window.scrollY
      // Not innerHeight: a phone's address bar coming and going would resize the board on every scroll
      const screen = document.documentElement.clientHeight || window.innerHeight
      const below = bar?.offsetHeight ?? 0
      const height = stageHeight(screen, top, below)
      setHeight(height)
      if (!brought && screen <= SHORT_SCREEN && top + height + below + BELOW > screen + 1) {
        brought = true
        // Once the new height is on the page
        requestAnimationFrame(() => window.scrollTo(0, top))
      }
    }
    measureRef.current = measure
    measure()
    // The dock's box, not the page's: the page grows and shrinks with the board itself
    const dockSize = new ResizeObserver(measure)
    if (bar) dockSize.observe(bar)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    document.addEventListener('fullscreenchange', measure)
    return () => {
      measureRef.current = null
      dockSize.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      document.removeEventListener('fullscreenchange', measure)
    }
  }, [stage, dock, fitStage])

  // After every render: only a stage that starts somewhere else changes the number
  useLayoutEffect(() => {
    measureRef.current?.()
  })

  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver !== 'function') return undefined
    // The box only from its own observer: it reports every size the box settles at, where a reading
    // taken in the middle of a resize could be left standing
    const own = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: tall } = element
      setBox((last) =>
        last?.width === width && last.height === tall ? last : { width, height: tall },
      )
    })
    own.observe(element)
    return () => own.disconnect()
  }, [element])

  return { stage: height, box, stageRef, boxRef }
}

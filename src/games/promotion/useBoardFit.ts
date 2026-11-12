import { useLayoutEffect, useState, type RefObject } from 'react'

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
const MIN_STAGE = 240
/** Between the stage and the dock under it, and under the dock */
const BELOW = 20

/**
 * The space for the whole board (e3-t10). The stage, from where it starts on the page, takes what is
 * left of the screen above the dock, the bar the turn and the roll are in (the parent of `dock`), so
 * that all of it is on the screen at once; `fitStage` off (full screen) leaves its height to CSS.
 * Nothing is measured where nothing can be (tests): the board then fills the width it has.
 */
export function useBoardFit(
  dock: RefObject<HTMLElement | null>,
  fitStage: boolean,
): BoardFitSpace {
  const [height, setHeight] = useState<number | null>(null)
  const [box, setBox] = useState<BoardFitSpace['box']>(null)
  const [stage, stageRef] = useState<HTMLElement | null>(null)
  const [element, boxRef] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!stage || !element || typeof ResizeObserver !== 'function') return undefined
    const measure = () => {
      const top = stage.getBoundingClientRect().top + window.scrollY
      const below = (dock.current?.parentElement?.offsetHeight ?? 0) + BELOW
      // Not innerHeight: a phone's address bar coming and going would resize the board on every scroll
      const screen = document.documentElement.clientHeight || window.innerHeight
      setHeight(fitStage ? Math.max(MIN_STAGE, Math.floor(screen - top - below)) : null)
    }
    measure()
    const page = new ResizeObserver(measure)
    page.observe(document.body)
    // The box only from its own observer: it reports every size the box settles at, where a reading
    // taken in the middle of a resize could be left standing
    const own = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: tall } = element
      setBox((last) => (last?.width === width && last.height === tall ? last : { width, height: tall }))
    })
    own.observe(element)
    window.addEventListener('resize', measure)
    return () => {
      page.disconnect()
      own.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [stage, element, dock, fitStage])
  return { stage: height, box, stageRef, boxRef }
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4
const STEP = 1.5

export const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

/** A spot on the board and the spot of the viewport it should stay under after the zoom */
interface Anchor {
  /** Fractions of the board */
  boardX: number
  boardY: number
  /** Pixels from the viewport's corner */
  viewX: number
  viewY: number
}

const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

export interface BoardZoom {
  /** Give this to the scrolling box around the board */
  viewport: RefObject<HTMLDivElement | null>
  zoom: number
  zoomIn(): void
  zoomOut(): void
  reset(): void
  /** Scrolls a spot of the board, as fractions of it, to the middle of the viewport */
  show(x: number, y: number): void
}

/**
 * Zoom for a scrolling box around the board: the buttons, and two fingers. The browser's own pinch
 * would scale the whole page, dock and all; this scales the board inside its box, and one finger
 * still scrolls. Native touch listeners, as React's are passive and could not stop the page.
 */
export function useBoardZoom(): BoardZoom {
  const viewport = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const anchor = useRef<Anchor | null>(null)
  const pinch = useRef<{ spread: number; zoom: number } | null>(null)
  const zoomNow = useRef(zoom)

  const anchorAt = useCallback((viewX: number, viewY: number) => {
    const element = viewport.current
    if (!element || element.scrollWidth === 0) return
    anchor.current = {
      boardX: (element.scrollLeft + viewX) / element.scrollWidth,
      boardY: (element.scrollTop + viewY) / element.scrollHeight,
      viewX,
      viewY,
    }
  }, [])

  useLayoutEffect(() => {
    zoomNow.current = zoom
    const element = viewport.current
    const held = anchor.current
    if (!element || !held) return
    element.scrollLeft = held.boardX * element.scrollWidth - held.viewX
    element.scrollTop = held.boardY * element.scrollHeight - held.viewY
  }, [zoom])

  const zoomAroundMiddle = (next: number) => {
    const element = viewport.current
    if (element) anchorAt(element.clientWidth / 2, element.clientHeight / 2)
    setZoom(clampZoom(next))
  }

  useEffect(() => {
    const element = viewport.current
    if (!element) return undefined

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return
      pinch.current = {
        spread: distance(event.touches[0], event.touches[1]),
        zoom: zoomNow.current,
      }
    }
    const onTouchMove = (event: TouchEvent) => {
      const start = pinch.current
      if (event.touches.length !== 2 || !start || start.spread === 0) return
      event.preventDefault()
      const [a, b] = [event.touches[0], event.touches[1]]
      const box = element.getBoundingClientRect()
      anchorAt((a.clientX + b.clientX) / 2 - box.left, (a.clientY + b.clientY) / 2 - box.top)
      setZoom(clampZoom((start.zoom * distance(a, b)) / start.spread))
    }
    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch.current = null
    }

    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd, { passive: true })
    element.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
      element.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [anchorAt])

  const show = useCallback((x: number, y: number) => {
    const element = viewport.current
    if (!element) return
    element.scrollTo?.({
      left: x * element.scrollWidth - element.clientWidth / 2,
      top: y * element.scrollHeight - element.clientHeight / 2,
    })
  }, [])

  return {
    viewport,
    zoom,
    zoomIn: () => zoomAroundMiddle(zoom * STEP),
    zoomOut: () => zoomAroundMiddle(zoom / STEP),
    reset: () => zoomAroundMiddle(MIN_ZOOM),
    show,
  }
}

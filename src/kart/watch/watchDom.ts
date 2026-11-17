// e9-t10: the DOM side of watching a race, outside React's render: the keys, and the name tags
// moved over the karts every frame.
import { useEffect, useRef } from 'react'
import { keyCommand, type WatchCommand } from '../../../shared/kart/watch.ts'
import type { ScreenPoint } from '../Scene.ts'

/** Name tags float this high over a kart, metres */
export const TAG_HEIGHT = 2.4

/** Keys while watching, outside form fields and buttons (a button takes its own Space and Enter) */
export function useWatchKeys(onCommand: (command: WatchCommand) => void): void {
  const latest = useRef(onCommand)
  useEffect(() => {
    latest.current = onCommand
  })
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLButtonElement && (event.code === 'Space' || event.code === 'Enter'))
      ) {
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const command = keyCommand(event.code)
      if (!command) return
      event.preventDefault()
      latest.current(command)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}

/** Moves each name tag over its kart, outside React: called every frame */
export function placeTags(
  layer: HTMLDivElement | null,
  tags: readonly { seat: number; at: ScreenPoint }[],
): void {
  if (!layer) return
  const shown = new Set<number>()
  for (const tag of tags) {
    const element = layer.querySelector<HTMLElement>(`[data-tag="${tag.seat}"]`)
    if (!element || !tag.at) continue
    shown.add(tag.seat)
    element.style.display = ''
    element.style.transform = `translate(${Math.round(tag.at.x)}px, ${Math.round(tag.at.y)}px) translate(-50%, -100%)`
  }
  for (const element of layer.querySelectorAll<HTMLElement>('[data-tag]')) {
    if (!shown.has(Number(element.dataset.tag))) element.style.display = 'none'
  }
}

/**
 * #86: a browser lets a page make sound only after a gesture. Tries at once (a page already clicked
 * on may), then on every key and tap until it stops; returns the way to stop listening
 */
export function unlockOnGesture(player: { unlock(): void }): () => void {
  const unlock = () => player.unlock()
  unlock()
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  return () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
  }
}

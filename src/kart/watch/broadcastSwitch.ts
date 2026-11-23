// 2026-11-23 (the broadcast, docs/KART-NETCODE.md §11.6): what a watch page keeps of the broadcast
// before its chunk is here: whether it is on, whether the interface is hidden (a clean picture, to
// record or to project), and the chunk itself, fetched the first time it is wanted.
import { useEffect, useState } from 'react'

export type BroadcastKit = typeof import('./broadcast/kit.ts')

let pending: Promise<BroadcastKit> | null = null
let loaded: BroadcastKit | null = null

/** Fetches the broadcast's chunk once; a failed fetch is forgotten, so asking again tries again */
export function loadBroadcastKit(): Promise<BroadcastKit> {
  if (loaded) return Promise.resolve(loaded)
  pending ??= import('./broadcast/kit.ts').then(
    (kit) => {
      loaded = kit
      return kit
    },
    (error: unknown) => {
      pending = null
      throw error
    },
  )
  return pending
}

/** The broadcast's chunk once `wanted` (and from then on); null until it is here */
export function useBroadcastKit(wanted: boolean): BroadcastKit | null {
  const [kit, setKit] = useState<BroadcastKit | null>(loaded)
  useEffect(() => {
    if (!wanted || kit) return
    let live = true
    loadBroadcastKit().then(
      (done) => {
        if (live) setKit(done)
      },
      () => {},
    )
    return () => {
      live = false
    }
  }, [wanted, kit])
  return kit
}

/** Whether the viewer asked for less motion (the broadcast then keeps to the steady shots) */
export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

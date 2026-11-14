// The full board's data in the browser (C8): boardFull.ts, its 236 cells' names, moves and rules for
// both boards, loaded by a dynamic import after the full edition's screen has painted, so that the
// screen's first load is its own code alone (`npm run budget -- --chunks`). The screen draws its dock,
// seats and silver at once and the board when this arrives. The only import of boardFull.ts in the
// browser (tests/games/catalog.test.ts). Since C9 the code that lays the board out (the square board
// and the columns, fullSquare.ts) comes with it: nothing is laid out before there is a board.
import { useEffect, useSyncExternalStore } from 'react'
import type * as BoardData from '../../../../shared/games/promotion/boardFull.ts'
import type { DecisionPrompt } from './DecisionPrompt.tsx'
import type { FullCellDetail } from './FullCellDetail.tsx'
import type * as Layouts from './fullSquare.ts'
import type { Settlement } from './Settlement.tsx'

/**
 * The board, its layouts, and the cards that come up over it now and then (a decision, the
 * settlement, a cell's detail): they show only once there is a board, so they come with it (2026-11-14, to keep the
 * first screen within the budget as new games join the lobby)
 */
export type FullData = typeof BoardData & {
  layouts: typeof Layouts
  parts: { DecisionPrompt: typeof DecisionPrompt; Settlement: typeof Settlement; FullCellDetail: typeof FullCellDetail }
}

let loaded: FullData | null = null
let loading: Promise<FullData> | null = null
const listeners = new Set<() => void>()

/** Starts loading the board once; resolves with it */
export function loadFullData(): Promise<FullData> {
  loading ??= Promise.all([
    import('../../../../shared/games/promotion/boardFull.ts'),
    import('./fullSquare.ts'),
    import('./DecisionPrompt.tsx'),
    import('./Settlement.tsx'),
    import('./FullCellDetail.tsx'),
  ]).then(([board, layouts, decision, settlement, detail]) => {
    const parts = {
      DecisionPrompt: decision.DecisionPrompt,
      Settlement: settlement.Settlement,
      FullCellDetail: detail.FullCellDetail,
    }
    const data: FullData = { ...board, layouts, parts }
    loaded = data
    for (const listener of listeners) listener()
    return data
  })
  return loading
}

/** The board once loaded. Only for what is drawn after `useFullData` has answered */
export function fullData(): FullData {
  if (loaded === null) throw new Error('promotion: the full board is not loaded yet')
  return loaded
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const snapshot = () => loaded

/** The board, or null until it has loaded (and the screen re-renders when it does) */
export function useFullData(): FullData | null {
  const data = useSyncExternalStore(subscribe, snapshot, snapshot)
  useEffect(() => {
    void loadFullData()
  }, [])
  return data
}

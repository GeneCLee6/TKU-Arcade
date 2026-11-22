import { lateChunk } from '../../lib/lateChunk.ts'

// 2026-11-23: the board's drawing and a cell's details come right after the screen's first paint, as
// the full edition's board does (#142): the first screen was in the budget's warning band. Until
// then the board's place is kept at its size, so nothing moves when it arrives
export const boardChunk = lateChunk(() =>
  Promise.all([import('./PromotionBoard.tsx'), import('./CellDetail.tsx')]).then(
    ([board, detail]) => ({ PromotionBoard: board.PromotionBoard, CellDetail: detail.CellDetail }),
  ),
)

// The goods' colours, from tokens.ts: kept out of pieces.tsx so that it exports components only.
import { tradersPieces as piece } from '../../styles/tradersTokens.ts'

/** Fill and ink of each good, then gold */
export const FILL = [piece.tea, piece.camphor, piece.indigo, piece.sugar, piece.pepper, piece.gold] as const
export const INK = [piece.onTea, piece.onCamphor, piece.onIndigo, piece.onSugar, piece.onPepper, piece.onGold] as const

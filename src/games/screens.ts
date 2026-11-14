// Each game's screen, loaded only when a room gets that far (docs/ARCHITECTURE.md). A game with no
// entry here plays in the room's general layout, with nothing to show but the members.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameProjection } from '../../shared/games/types.ts'
import type { RoomParts } from '../components/GameLayout.tsx'

export interface GameScreenProps {
  /** The room around the game: a screen puts its board inside `GameLayout` and hands this on */
  room: RoomParts
  game: GameProjection
}

type GameScreen = LazyExoticComponent<ComponentType<GameScreenProps>>

const SCREENS: Partial<Record<string, GameScreen>> = {
  promotion: lazy(() => import('./promotion/PromotionScreen.tsx')),
  'silent-table': lazy(() => import('./silent-table/SilentTableScreen.tsx')),
  spectrum: lazy(() => import('./spectrum/SpectrumScreen.tsx')),
  bluff: lazy(() => import('./bluff/BluffScreen.tsx')),
  'odd-word': lazy(() => import('./odd-word/OddWordScreen.tsx')),
  lantern: lazy(() => import('./lantern/LanternScreen.tsx')),
  tiles: lazy(() => import('./tiles/TilesScreen.tsx')),
  kite: lazy(() => import('./kite/KiteScreen.tsx')),
}

// The full edition of promotion (C7) is a screen of its own: a simple game never loads its board
const PROMOTION_FULL: GameScreen = lazy(() => import('./promotion/full/FullScreen.tsx'))

/** The screen for a game, by its view where a game has more than one (promotion's `edition`) */
export const gameScreen = (gameId: string, view?: unknown): GameScreen | null =>
  gameId === 'promotion' && (view as { edition?: unknown } | undefined)?.edition === 'full'
    ? PROMOTION_FULL
    : (SCREENS[gameId] ?? null)

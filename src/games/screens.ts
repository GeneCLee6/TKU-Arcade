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
}

export const gameScreen = (gameId: string): GameScreen | null => SCREENS[gameId] ?? null

// Each game's screen, loaded only when a room gets that far (docs/ARCHITECTURE.md). A game with no
// entry here plays in the room's general layout, with nothing to show but the members.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameProjection } from '../../shared/games/types.ts'
import type { RoomParts } from '../components/GameLayout.tsx'
import { loadFullStrings } from './promotion/full/fullStrings.ts'
import { loadScreenStrings } from './screenStrings.ts'

export interface GameScreenProps {
  /** The room around the game: a screen puts its board inside `GameLayout` and hands this on */
  room: RoomParts
  game: GameProjection
}

type GameScreen = LazyExoticComponent<ComponentType<GameScreenProps>>

type ScreenModule = Promise<{ default: ComponentType<GameScreenProps> }>

// A screen and its words in the page's language, fetched side by side (screenStrings.ts): the screen
// shows with them, never before. Promotion's simple board and the kart register their own
const withStrings = (gameId: string, load: () => ScreenModule): GameScreen =>
  lazy(() => {
    const strings = loadScreenStrings(gameId)
    return load().then((module) => strings.then(() => module))
  })

const SCREENS: Partial<Record<string, GameScreen>> = {
  promotion: lazy(() => import('./promotion/PromotionScreen.tsx')),
  'silent-table': withStrings('silent-table', () => import('./silent-table/SilentTableScreen.tsx')),
  spectrum: withStrings('spectrum', () => import('./spectrum/SpectrumScreen.tsx')),
  bluff: withStrings('bluff', () => import('./bluff/BluffScreen.tsx')),
  'odd-word': withStrings('odd-word', () => import('./odd-word/OddWordScreen.tsx')),
  lantern: withStrings('lantern', () => import('./lantern/LanternScreen.tsx')),
  tiles: withStrings('tiles', () => import('./tiles/TilesScreen.tsx')),
  'word-bridge': withStrings('word-bridge', () => import('./word-bridge/WordBridgeScreen.tsx')),
  'clue-clash': withStrings('clue-clash', () => import('./clue-clash/ClueClashScreen.tsx')),
  kite: withStrings('kite', () => import('./kite/KiteScreen.tsx')),
  traders: withStrings('traders', () => import('./traders/TradersScreen.tsx')),
  'secret-scroll': withStrings('secret-scroll', () => import('./secret-scroll/SecretScrollScreen.tsx')),
  wasabi: withStrings('wasabi', () => import('./wasabi/WasabiScreen.tsx')),
  palace: withStrings('palace', () => import('./palace/PalaceScreen.tsx')),
  holdem: withStrings('holdem', () => import('./holdem/HoldemScreen.tsx')),
  misery: withStrings('misery', () => import('./misery/MiseryScreen.tsx')),
  kart: lazy(() => import('./kart/KartScreen.tsx')),
}

// The full edition of promotion (C7) is a screen of its own: a simple game never loads its board.
// Its words, in the page's language, load alongside it (fullStrings.ts)
const PROMOTION_FULL: GameScreen = lazy(() => {
  const strings = loadFullStrings()
  return import('./promotion/full/FullScreen.tsx').then((module) => strings.then(() => module))
})

/** The screen for a game, by its view where a game has more than one (promotion's `edition`) */
export const gameScreen = (gameId: string, view?: unknown): GameScreen | null =>
  gameId === 'promotion' && (view as { edition?: unknown } | undefined)?.edition === 'full'
    ? PROMOTION_FULL
    : (SCREENS[gameId] ?? null)

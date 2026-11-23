import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { resetAccountForTests } from '../src/lib/account.ts'

// What the site loads as chunks before it shows a page (src/i18n/t.ts, gameDetails.ts): here once
// up front, so that a test renders any page or screen at once and in either language. Only with a
// DOM: the Worker's and the scripts' tests run in node
if (typeof document !== 'undefined') {
  const [{ GAME_CARDS }, { loadFullStrings }, { loadScreenStrings }, { loadGameDetails }, { loadRoomStrings }, { preloadLanguage }] =
    await Promise.all([
      import('../shared/games/lobby.ts'),
      import('../src/games/promotion/full/fullStrings.ts'),
      import('../src/games/screenStrings.ts'),
      import('../src/i18n/gameDetails.ts'),
      import('../src/i18n/roomStrings.ts'),
      import('../src/i18n/t.ts'),
    ])
  // The parts of a screen that load after its first paint (src/lib/lateChunk.ts): here up front too.
  // Not through the screens themselves: a test that mocks a module they import must import it first
  const lateParts = await import('../src/lib/lateParts.ts')
  const { boardChunk } = await import('../src/games/promotion/boardChunk.ts')
  const { inertChunk } = await import('../src/games/promotion/useImmersive.ts')
  const { loadDetailStrings } = await import('../src/games/promotion/detailStrings.ts')
  await Promise.all([
    lateParts.resultPanelChunk.load(),
    lateParts.chatPanelChunk.load(),
    lateParts.drawerChunk.load(),
    lateParts.bannerChunk.load(),
    lateParts.turnRingChunk.load(),
    boardChunk.load(),
    inertChunk.load(),
    loadDetailStrings(),
    lateParts.captionChunk.load(),
    lateParts.coverChunk.load(),
  ])
  await Promise.all([loadRoomStrings(), loadFullStrings(), ...GAME_CARDS.map((game) => loadScreenStrings(game.id))])
  await Promise.all([
    preloadLanguage('en'),
    preloadLanguage('zh-TW'),
    ...GAME_CARDS.map((game) => loadGameDetails(game.id)),
  ])
}

// The default 1 s is too short for a lazy page's first import on a busy machine; below the 5 s of a
// test, so that a real miss still reports what it was looking for
configure({ asyncUtilTimeout: 4_000 })

// Pages render as for a guest on a site without sign-in, and never ask /api/me, unless a test
// (tests/lib/account.test.tsx) says otherwise
beforeEach(() => {
  resetAccountForTests({ configured: false, account: null })
})

afterEach(() => {
  cleanup()
})

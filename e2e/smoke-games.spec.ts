import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { GAME_META } from '../shared/games/lobby.ts'
import { roomEn } from '../src/i18n/room.en.ts'
import { roomZhTW } from '../src/i18n/room.zh-TW.ts'
import {
  checkAxe,
  checkLayout,
  gameOf,
  jsonEqual,
  playOn,
  SCREENS,
  seeded,
  table,
  type PlayLog,
  type Problems,
  type Seat,
} from './sweep.ts'

// The site QA sweep (docs/QA-SWEEP-2026-11.md): each board game, at its fewest players, from the
// waiting room through a whole game to the result and a rematch, on a desktop and two phones (the
// 390 one in Chinese). Moves are random legal ones (e2e/sweep.ts), so every game reaches its end
// without a driver of its own. One player reloads partway: they must come back to the same seat and
// the same game. Fails on console errors, uncaught exceptions, sideways scrolling, raw i18n keys,
// serious axe findings, a game that gets stuck, or a room that refuses a move it listed as legal.
// Softer findings (covered buttons, cut text, English on a Chinese page) are attached to the test.
//
//   SWEEP_GAMES=wasabi,kite SWEEP_SCREENS=desktop npx playwright test smoke-games --workers=1
//   SWEEP_SEED=123 replays a game's moves

const GAMES = Object.entries(GAME_META)
  .filter(([id, meta]) => id !== 'kart' && !('unlisted' in meta && meta.unlisted))
  .map(([id, meta]) => ({ id, players: meta.minPlayers as number }))

const pickedGames = process.env.SWEEP_GAMES?.split(',').filter(Boolean)
const pickedScreens = process.env.SWEEP_SCREENS?.split(',').filter(Boolean)
const seed = Number(process.env.SWEEP_SEED ?? 20261120)
/** Axe on every screen, or (the CI's light run) only on the desktop */
const axeEverywhere = process.env.SWEEP_AXE !== 'desktop'

/** Moves before one player reloads */
const RELOAD_AT = 1

for (const game of GAMES.filter((g) => !pickedGames || pickedGames.includes(g.id))) {
  for (const screen of SCREENS.filter((s) => !pickedScreens || pickedScreens.includes(s.name))) {
    test(`${game.id} on ${screen.name}: waiting room to result and rematch`, async ({ browser }) => {
      test.setTimeout(240_000)
      const words = screen.zh ? roomZhTW : roomEn
      const problems: Problems = { hard: [], soft: [] }
      const log: PlayLog = { actions: 0, refused: 0 }
      const seats: Seat[] = []
      try {
        seats.push(...(await table(browser, game.id, game.players, screen, problems)))
        const [host, guest] = seats
        const where = (what: string) => `${screen.name} ${what}`
        const checkAll = async (what: string) => {
          for (const seat of seats) await checkLayout(seat.page, where(`${what} (${seat.name})`), problems, screen.zh)
        }

        // The waiting room
        await checkAll('waiting room')
        if (axeEverywhere || screen.name === 'desktop') await checkAxe(host.page, where('waiting room'), problems)

        await host.page.getByRole('button', { name: words['room.waiting.start'] }).click()
        for (const seat of seats) {
          await expect.poll(() => seat.view?.room.status).toBe('playing')
          await expect(seat.page.getByRole('heading', { name: words['room.waiting.seats'] })).toHaveCount(0)
        }
        await checkAll('first turn')
        if (axeEverywhere || screen.name === 'desktop') {
          await checkAxe(host.page, where('first turn (host)'), problems)
          await checkAxe(guest.page, where('first turn (guest)'), problems)
        }

        const pick = seeded(seed + game.id.length * 7919 + screen.name.length)

        // Partway, a player reloads: same seat, same game, the game's screen again
        await playOn(seats, pick, log, (l) => l.actions >= RELOAD_AT)
        if (!host.view?.game?.over) await reloadCheck(guest, host, problems, where('reload'), words)

        // On to the end, looking at every screen now and then
        let nextLook = 25
        await playOn(seats, pick, log, (l) => l.actions >= nextLook)
        while (!host.view?.game?.over) {
          await checkAll(`after ${log.actions} moves`)
          nextLook += 40
          await playOn(seats, pick, log, (l) => l.actions >= nextLook)
        }
        if (axeEverywhere || screen.name === 'desktop') await checkAxe(guest.page, where('late game (guest)'), problems)

        // The result, on everyone's page
        for (const seat of seats) {
          await expect(seat.page.getByRole('region', { name: words['room.result.heading'], exact: true })).toBeVisible({ timeout: 15_000 })
        }
        await checkAll('result')
        if (axeEverywhere || screen.name === 'desktop') await checkAxe(host.page, where('result'), problems)

        // And again
        await host.page.getByRole('button', { name: words['room.host.rematch'], exact: true }).click()
        for (const seat of seats) {
          await expect.poll(() => seat.view?.room.status === 'playing' && seat.view.game?.over === false).toBe(true)
          await expect(seat.page.getByRole('region', { name: words['room.result.heading'], exact: true })).toHaveCount(0)
        }
        await checkAll('rematch')
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
        problems.hard.push(`failed after ${log.actions} moves: ${message}`)
        throw error
      } finally {
        if (log.refused > 0) problems.soft.push(`${log.refused} of ${log.actions} legal moves refused (stale or a bug)`)
        const report = JSON.stringify({ game: game.id, screen: screen.name, seed, actions: log.actions, ...problems }, null, 2)
        await test.info().attach('sweep', { contentType: 'application/json', body: report })
        // Every run's findings in one place, for docs/QA-SWEEP-*.md
        mkdirSync('tmp/sweep', { recursive: true })
        writeFileSync(`tmp/sweep/${game.id}-${screen.name}.json`, report)
        for (const seat of seats) await seat.page.context().close()
      }
      expect(problems.hard).toEqual([])
    })
  }
}

// 2026-11-20: one person and two computer players (GameModule.bot), for each game that has them:
// the host adds them in the waiting room, the room plays their turns, and the game reaches its end.
// Hold'em plays on among the computers once the person is out of chips, and a whole game is long, so
// there the person goes all in every hand and four hands dealt (or the person out) is the check.
// 2026-11-21, the four more: short games, or a set part of one (`enough`, on the person's view), to
// keep the CI's time down: the first round over and the next one started by the person (the
// computers leave that button to the people), or ten turns of tiles
type BotGame = { id: string; options?: Record<string, unknown>; enough?: (view: Record<string, unknown>) => boolean }
const BOT_GAMES: BotGame[] = [
  { id: 'promotion' },
  { id: 'traders' },
  { id: 'holdem', options: { stack: 100, blindUp: 15, timer: 30 }, enough: (view) => Number(view.hand ?? 0) >= 4 },
  { id: 'palace', options: { window: 10 } },
  { id: 'secret-scroll', options: { length: 'short' }, enough: (view) => Number(view.round ?? 1) >= 2 },
  { id: 'wasabi', options: { goal: 1 } },
  { id: 'tiles', options: { clock: 60 }, enough: (view) => Number(view.turnNo ?? 0) >= 10 },
]

for (const game of BOT_GAMES.filter((g) => !pickedGames || pickedGames.includes(g.id))) {
  for (const screen of SCREENS.filter((s) => s.name === 'desktop' && (!pickedScreens || pickedScreens.includes(s.name)))) {
    test(`${game.id} on ${screen.name}: one person and two computer players`, async ({ browser }) => {
      test.setTimeout(process.env.SWEEP_BOTS_FULL ? 1_500_000 : 420_000)
      const words = screen.zh ? roomZhTW : roomEn
      const problems: Problems = { hard: [], soft: [] }
      const log: PlayLog = { actions: 0, refused: 0 }
      const seats: Seat[] = []
      try {
        seats.push(...(await table(browser, game.id, 1, screen, problems, game.options)))
        const [host] = seats
        const page = host.page
        const add = page.getByRole('button', { name: words['room.bot.add'] })
        await page.getByTestId('table-bots-level').selectOption('easy')
        await add.click()
        await expect.poll(() => Object.values(host.view?.members ?? {}).filter((m) => m.bot).length).toBe(1)
        await page.getByTestId('table-bots-level').selectOption('normal')
        await add.click()
        await expect.poll(() => Object.values(host.view?.members ?? {}).filter((m) => m.bot).length).toBe(2)
        await expect(page.getByTestId('bot-member')).toHaveCount(2)
        await checkLayout(page, `${screen.name} waiting room with computers`, problems, screen.zh)
        await checkAxe(page, `${screen.name} waiting room with computers`, problems)

        await page.getByRole('button', { name: words['room.waiting.start'] }).click()
        await expect.poll(() => host.view?.room.status).toBe('playing')
        // Hold'em: all in whenever possible, so that the person's part is over in a few hands
        const allIn = (n: number) => (game.id === 'holdem' ? n - 1 : 0)
        const pick = game.id === 'holdem' ? allIn : seeded(seed + game.id.length)
        const youOut = () => {
          const view = host.view?.game?.view as { you?: number; players?: { seat: number; out?: boolean }[] } | undefined
          return view?.players?.find((p) => p.seat === view.you)?.out === true
        }
        const enough = () => {
          // SWEEP_BOTS_FULL=1: every game to its very end (for a check on a preview site, not the CI)
          if (process.env.SWEEP_BOTS_FULL) return false
          const view = host.view?.game?.view as Record<string, unknown> | undefined
          // Out of a secret-scroll round is not out of the game
          if (game.id !== 'secret-scroll' && youOut()) return true
          return view !== undefined && game.enough?.(view) === true
        }
        let nextLook = 20
        while (!host.view?.game?.over && !enough()) {
          await playOn(seats, pick, log, (l) => l.actions >= nextLook || enough())
          await checkLayout(page, `${screen.name} after ${log.actions} moves`, problems, screen.zh)
          nextLook += 20
        }
        // The computers moved: someone other than the person acted
        expect(host.view?.game).not.toBeNull()
        if (host.view?.game?.over) {
          await expect(page.getByRole('region', { name: words['room.result.heading'], exact: true })).toBeVisible({ timeout: 15_000 })
          await checkLayout(page, `${screen.name} result`, problems, screen.zh)
        }
      } catch (error) {
        const message = error instanceof Error ? error.message.split('\n')[0] : String(error)
        problems.hard.push(`failed after ${log.actions} moves: ${message}`)
        throw error
      } finally {
        const report = JSON.stringify({ game: game.id, screen: screen.name, bots: 2, actions: log.actions, ...problems }, null, 2)
        await test.info().attach('sweep', { contentType: 'application/json', body: report })
        mkdirSync('tmp/sweep', { recursive: true })
        writeFileSync(`tmp/sweep/${game.id}-bots-${screen.name}.json`, report)
        for (const seat of seats) await seat.page.context().close()
      }
      expect(problems.hard).toEqual([])
    })
  }
}

async function reloadCheck(
  guest: Seat,
  host: Seat,
  problems: Problems,
  where: string,
  words: Record<keyof typeof roomEn, string>,
): Promise<void> {
  // Settled: nobody's move is on its way
  await expect.poll(() => guest.rev === host.rev).toBe(true)
  const before = gameOf(guest)
  const seatBefore = guest.view?.members[Object.keys(guest.view.members).find((id) => guest.view?.members[id].name === guest.name) ?? '']?.seat
  const revBefore = host.rev
  const welcomes = guest.welcomes
  await guest.page.reload()
  await expect.poll(() => guest.welcomes).toBe(welcomes + 1)
  await expect(guest.page.getByRole('heading', { name: words['room.waiting.seats'] })).toHaveCount(0)
  const me = Object.values(guest.view?.members ?? {}).find((member) => member.name === guest.name)
  if (me?.seat !== seatBefore) problems.hard.push(`${where}: came back to seat ${me?.seat}, not ${seatBefore}`)
  // The same game, unless a countdown moved it on meanwhile
  if (host.rev === revBefore && !jsonEqual(gameOf(guest), before)) {
    problems.hard.push(`${where}: the game after a reload is not the game before it`)
  }
}

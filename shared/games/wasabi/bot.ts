// A computer player for 芥末餃子 (2026-11-21, docs/ARCHITECTURE.md "電腦玩家"). It sees what its seat's
// browser would: its own dumplings and steamer, how many everyone owns and has placed, what has been
// eaten, and who bid or passed. From those it guesses, for each other steamer, how likely it hides the
// wasabi: more likely for a seat that still owns one and passed, less for one that bid itself.
//
// Normal hides its wasabi now and then, never bids past the wasabi in its own steamer (it must eat
// its own first), raises only to a bid it can probably eat, and eats from the steamers it trusts
// most. Easy is reckless: it opens the bidding early, raises on thin odds and eats from anyone.
import { best } from '../tableBots.ts'
import type { Rng, SeatId } from '../types.ts'
import type { WasabiAction, WasabiPlayerView, WasabiView } from './types.ts'

type Level = { wasabiFirst: number; raiseAt: number; openAfter: number }

const LEVELS: Readonly<Record<string, Level>> = {
  // wasabiFirst: how often it hides its wasabi first; raiseAt: the odds of eating it all a bid needs;
  // openAfter: dumplings on the table (per player) before it starts the bidding
  normal: { wasabiFirst: 0.65, raiseAt: 0.55, openAfter: 1.8 },
  easy: { wasabiFirst: 0.5, raiseAt: 0.2, openAfter: 1 },
}

/** How likely `player`'s steamer hides a wasabi, from what everyone can see */
export function wasabiChance(view: WasabiView, player: WasabiPlayerView): number {
  const unseen = player.stack.length - player.eaten
  if (unseen <= 0) return 0
  // Lost dumplings may have been the wasabi: one gone in four is about a quarter
  const stillOwns = player.owned >= 4 ? 1 : player.owned / 4 + 0.15
  let chance = 0.55 * Math.min(1, stillOwns)
  if (player.seat === view.bidder) chance *= 0.35
  else if (player.passed && view.phase !== 'adding') chance = Math.min(0.85, chance * 1.5)
  return chance
}

/** The chance of eating the top `count` of `player`'s unseen dumplings without wasabi */
function cleanChance(view: WasabiView, player: WasabiPlayerView, count: number): number {
  const unseen = player.stack.length - player.eaten
  if (count <= 0) return 1
  if (count > unseen) return 0
  return 1 - (wasabiChance(view, player) * count) / unseen
}

/**
 * The chance of eating `bid` in all as this seat would: its own steamer first, then the others the
 * likeliest way; 0 when the bid would reach its own wasabi
 */
export function bidChance(view: WasabiView, me: WasabiPlayerView, bid: number): number {
  const mine = me.stack.length - me.eaten
  const wasabiAt = me.stack.lastIndexOf('wasabi')
  // Plain ones above its own wasabi, from the top
  const safeOwn = wasabiAt < 0 ? mine : me.stack.length - 1 - wasabiAt
  if (bid <= safeOwn) return 1
  if (safeOwn < mine) return 0
  let need = bid - mine
  let chance = 1
  const others = view.players.filter((player) => player.seat !== me.seat && player.stack.length > player.eaten)
  // Take from the steamers it trusts most, one at a time
  const taken = new Map<SeatId, number>()
  while (need > 0) {
    const pick = best(others, (player) => {
      const already = taken.get(player.seat) ?? 0
      if (already >= player.stack.length - player.eaten) return -1
      return cleanChance(view, player, already + 1) / cleanChance(view, player, already)
    })
    if (!pick) return 0
    const already = taken.get(pick.seat) ?? 0
    if (already >= pick.stack.length - pick.eaten) return 0
    taken.set(pick.seat, already + 1)
    need--
  }
  for (const player of others) chance *= cleanChance(view, player, taken.get(player.seat) ?? 0)
  return chance
}

export function wasabiBot(view: WasabiView, legal: readonly WasabiAction[], level: string, rng: Rng): WasabiAction | null {
  const me = view.players.find((player) => player.seat === view.you)
  if (!me || legal.length === 0) return null
  const tune = LEVELS[level] ?? LEVELS.normal
  const easy = level === 'easy'
  const has = (action: WasabiAction) => legal.some((one) => JSON.stringify(one) === JSON.stringify(action))
  const plainLeft = (me.plain ?? 0) - me.stack.filter((disc) => disc === 'plain').length
  const wasabiLeft = (me.wasabi ?? 0) - me.stack.filter((disc) => disc === 'wasabi').length
  const place = (disc: 'plain' | 'wasabi'): WasabiAction | null =>
    has({ type: 'place', disc }) ? { type: 'place', disc } : null

  switch (view.phase) {
    case 'opening': {
      if (wasabiLeft > 0 && rng.float() < tune.wasabiFirst) return place('wasabi') ?? place('plain')
      return place('plain') ?? place('wasabi')
    }
    case 'adding':
    case 'bidding': {
      const bids = legal.filter((one): one is Extract<WasabiAction, { type: 'bid' }> => one.type === 'bid')
      // The highest bid it would still back
      const backed = best(
        bids.filter((one) => bidChance(view, me, one.count) >= tune.raiseAt),
        (one) => one.count,
      )
      if (view.phase === 'adding') {
        const players = view.players.filter((player) => !player.out).length
        const canAdd = plainLeft + wasabiLeft > 0
        const ready = view.total >= tune.openAfter * players || !canAdd
        if (ready && bids.length > 0) {
          // Opens low enough that it can eat it: its own clean ones, or one more when reckless
          const opening = backed ?? (easy || !canAdd ? bids[0] : null)
          if (opening) return opening
        }
        // Another dumpling: plain on top of a wasabi keeps a bid on its own steamer safe for no one
        if (canAdd) {
          if (wasabiLeft > 0 && !me.stack.includes('wasabi') && rng.float() < tune.wasabiFirst * 0.6) {
            return place('wasabi') ?? place('plain')
          }
          return place('plain') ?? place('wasabi')
        }
        return bids[0] ?? null
      }
      // Bidding: raise by one to a bid it backs, else pass
      const next = bids.find((one) => one.count === view.bid + 1)
      if (next && bidChance(view, me, next.count) >= tune.raiseAt) return next
      if (easy && next && rng.float() < 0.25) return next
      return { type: 'pass' }
    }
    case 'eating': {
      const eats = legal.filter((one): one is Extract<WasabiAction, { type: 'eat' }> => one.type === 'eat')
      if (easy) return rng.pick(eats)
      return best(eats, (one) => {
        const player = view.players.find((p) => p.seat === one.seat) as WasabiPlayerView
        if (player.seat === me.seat) return 2
        return cleanChance(view, player, 1)
      })
    }
    case 'losing': {
      // Its own wasabi bitten: lose a plain one and keep the wasabi to hide another round
      if (has({ type: 'discard', disc: 'plain' })) return { type: 'discard', disc: 'plain' }
      return legal[0]
    }
    default:
      return null
  }
}

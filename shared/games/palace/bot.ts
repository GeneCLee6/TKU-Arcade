// A computer player for 朝堂暗鬥 (2026-11-21, docs/ARCHITECTURE.md "電腦玩家"). It sees what its seat's
// browser would: its own two backers, everyone's silver and face-up cards, and the public log of who
// claimed what. From those it reckons how likely a claim is to be true: the copies of a role it
// cannot see (three, less its own and the face-up ones) spread over the cards it cannot see (the
// deck and everyone else's backers), adjusted by what the log says the claimant has claimed before.
//
// Normal plays its own roles when it can, bluffs now and then (a role it has seen go face up less),
// challenges a claim that is probably false and worth stopping, blocks with a role it holds or, when
// the alternative is losing anyway, one it does not. Easy bluffs more often, challenges on a whim
// and misses half its blocks.
import { best, weighted } from '../tableBots.ts'
import type { Rng, SeatId } from '../types.ts'
import type { PalaceAct, PalaceAction, PalaceCard, PalaceLog, PalacePublicPlayer, PalaceRole, PalaceView } from './types.ts'

const COPIES = 3
const STORM_COST = 7

/** The role an action claims */
const ACT_ROLE: Readonly<Partial<Record<PalaceAct, PalaceRole>>> = {
  levy: 'treasurer',
  arrest: 'guard',
  extort: 'eunuch',
  scheme: 'strategist',
}

/** Which backers are worth keeping most: silver and the means to strike first */
const KEEP: Readonly<Record<PalaceRole, number>> = {
  treasurer: 5,
  guard: 4,
  dowager: 3,
  eunuch: 3,
  strategist: 2,
}

type Level = { bluff: number; challengeBelow: number; whim: number; blockMiss: number }

const LEVELS: Readonly<Record<string, Level>> = {
  // bluff: how often it claims a role it lacks when that would help; challengeBelow: it challenges
  // a claim it thinks this unlikely; whim: a challenge for no reason; blockMiss: a block it forgets
  normal: { bluff: 0.2, challengeBelow: 0.3, whim: 0, blockMiss: 0 },
  easy: { bluff: 0.45, challengeBelow: 0.08, whim: 0.18, blockMiss: 0.5 },
}

/** n choose k, small numbers only */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let out = 1
  for (let i = 0; i < k; i++) out = (out * (n - i)) / (i + 1)
  return out
}

/** Copies of `role` this seat cannot see: not in its hand, not face up anywhere */
function unseen(view: PalaceView, role: PalaceRole): number {
  const mine = view.hand.filter((card) => card.role === role).length
  const up = view.players.reduce((sum, player) => sum + player.lost.filter((one) => one === role).length, 0)
  return Math.max(0, COPIES - mine - up)
}

/** Cards this seat cannot see: the deck and everyone else's face-down backers */
function unknownCards(view: PalaceView): number {
  return view.deckSize + view.players.filter((p) => p.seat !== view.you).reduce((sum, p) => sum + p.hiddenCount, 0)
}

/**
 * What the log says of `seat` and `role` since the seat last changed its cards (a scheme, a proven
 * claim): how often it claimed the role, and how many different roles it has claimed in all
 */
function claimHistory(log: readonly PalaceLog[], seat: SeatId, role: PalaceRole): { same: number; roles: number } {
  const roles = new Set<PalaceRole>()
  let same = 0
  for (let index = log.length - 1; index >= 0; index--) {
    const line = log[index]
    if ((line.k === 'exchanged' || line.k === 'proved') && line.seat === seat) break
    let claimed: PalaceRole | undefined
    if (line.k === 'declare' && line.seat === seat) claimed = ACT_ROLE[line.act]
    if (line.k === 'block' && line.by === seat) claimed = line.role
    if (claimed === undefined) continue
    roles.add(claimed)
    if (claimed === role) same++
  }
  return { same, roles: roles.size }
}

/** How likely `seat` holds `role` among its face-down backers, from what this seat can see */
export function holdChance(view: PalaceView, seat: SeatId, role: PalaceRole): number {
  const player = view.players.find((one) => one.seat === seat)
  if (!player || player.hiddenCount === 0) return 0
  const copies = unseen(view, role)
  if (copies === 0) return 0
  const pool = Math.max(unknownCards(view), player.hiddenCount)
  let chance = 1 - choose(pool - copies, player.hiddenCount) / choose(pool, player.hiddenCount)
  // A seat that keeps claiming the same role probably has it; one that has claimed more roles than
  // it has backers is bluffing at least one of them
  const { same, roles } = claimHistory(view.log, seat, role)
  if (same > 1) chance = Math.min(0.95, chance + 0.12 * (same - 1))
  if (roles > player.hiddenCount) chance *= 0.6
  return chance
}

const has = (hand: readonly PalaceCard[], role: PalaceRole) => hand.some((card) => card.role === role)

/** How much of a threat a seat is: backers first, then silver */
const threat = (player: PalacePublicPlayer) => player.hiddenCount * 10 + player.silver

/** The action this seat would take on its turn */
function chooseAct(view: PalaceView, legal: readonly PalaceAction[], level: Level, rng: Rng): PalaceAction | null {
  const me = view.players.find((one) => one.seat === view.you) as PalacePublicPlayer
  const acts = legal.filter((one): one is Extract<PalaceAction, { type: 'act' }> => one.type === 'act')
  if (acts.length === 0) return null
  const others = view.players.filter((one) => one.seat !== view.you && !one.out)
  const target = (act: PalaceAct, score: (player: PalacePublicPlayer) => number) => {
    const options = acts.filter((one) => one.act === act)
    const chosen = best(options, (one) => score(others.find((p) => p.seat === one.target) as PalacePublicPlayer))
    return chosen
  }
  const lone = others.length === 1
  // Storm whenever it can: it cannot be stopped
  if (me.silver >= STORM_COST) return target('storm', threat)

  // Whether to claim `role`: held, or a bluff now and then on a role still out there
  const claim = (role: PalaceRole) => {
    if (has(view.hand, role)) return true
    if (unseen(view, role) === 0) return false
    return rng.float() < level.bluff
  }
  // Arrest someone who has not shown the Dowager lately
  if (me.silver >= 3 && claim('guard')) {
    const arrest = target('arrest', (p) => threat(p) - 20 * holdChance(view, p.seat, 'dowager'))
    if (arrest) return arrest
  }
  if (claim('treasurer')) {
    const levy = acts.find((one) => one.act === 'levy')
    if (levy) return levy
  }
  if (claim('eunuch')) {
    const rich = others.filter((p) => p.silver >= 2)
    if (rich.length > 0) {
      const extort = target('extort', (p) =>
        (p.silver >= 2 ? 10 : -100) + p.silver - 8 * (holdChance(view, p.seat, 'eunuch') + holdChance(view, p.seat, 'strategist')),
      )
      if (extort) return extort
    }
  }
  if (has(view.hand, 'strategist') && !has(view.hand, 'treasurer') && !has(view.hand, 'guard') && rng.float() < 0.5) {
    const scheme = acts.find((one) => one.act === 'scheme')
    if (scheme) return scheme
  }
  // A grant, unless someone is likely to block it with a Treasurer they have shown
  const treasurerShown = others.some((p) => claimHistory(view.log, p.seat, 'treasurer').same > 0)
  const grant = acts.find((one) => one.act === 'grant')
  if (grant && (!treasurerShown || lone || rng.float() < 0.3)) return grant
  return acts.find((one) => one.act === 'stipend') ?? acts[0]
}

/** Whether to challenge the claim the window is about */
function wantChallenge(view: PalaceView, level: Level, rng: Rng): boolean {
  const current = view.current
  if (!current || view.phase.kind !== 'respond') return false
  const me = view.players.find((one) => one.seat === view.you) as PalacePublicPlayer
  const onBlock = view.phase.window === 'challengeBlock'
  const claimant = onBlock ? current.block?.by : current.actor
  const role = onBlock ? current.block?.role : ACT_ROLE[current.act]
  if (claimant === undefined || role === undefined) return false
  if (rng.float() < level.whim) return true
  const chance = holdChance(view, claimant, role)
  if (chance === 0) return true
  // What is at stake for this seat: being struck, its own action stopped, or someone else's gain
  const struck = !onBlock && current.target === view.you && (current.act === 'arrest' || current.act === 'extort')
  const mine = onBlock && current.actor === view.you
  // Arrested with one backer left: losing a challenge costs no more than the arrest would
  if (struck && current.act === 'arrest' && me.hiddenCount === 1 && !has(view.hand, 'dowager')) return chance < 0.75
  const stake = struck || mine ? 1.4 : current.act === 'levy' || current.act === 'scheme' ? 0.6 : 0.4
  // With one backer left, a lost challenge is the end
  const care = me.hiddenCount === 1 ? 0.5 : 1
  return chance < level.challengeBelow * stake * care
}

/** Whether to block, and with which role, in a block window */
function chooseBlock(view: PalaceView, legal: readonly PalaceAction[], level: Level, rng: Rng): PalaceAction | null {
  const current = view.current
  if (!current) return null
  const me = view.players.find((one) => one.seat === view.you) as PalacePublicPlayer
  const blocks = legal.filter((one): one is Extract<PalaceAction, { type: 'block' }> => one.type === 'block')
  const held = blocks.find((one) => has(view.hand, one.role))
  if (current.act === 'grant') {
    // Only worth it against someone close to a storm
    const actor = view.players.find((one) => one.seat === current.actor)
    if (held && actor && actor.silver + 2 >= STORM_COST - 1 && rng.float() >= level.blockMiss) return held
    return null
  }
  if (held && rng.float() >= level.blockMiss) return held
  // A bluff: certain when the arrest would end this seat anyway, now and then otherwise
  const bluffable = blocks.filter((one) => unseen(view, one.role) > 0)
  if (bluffable.length === 0) return null
  const pick = best(bluffable, (one) => unseen(view, one.role))
  if (current.act === 'arrest' && me.hiddenCount === 1) return pick
  if (rng.float() < level.bluff * (current.act === 'arrest' ? 1.5 : 0.8)) return pick
  return null
}

/** The backers to keep: the most valuable, two of a kind only when nothing else is left */
function keepScore(cards: readonly PalaceCard[]): number {
  const roles = new Set(cards.map((card) => card.role))
  return cards.reduce((sum, card) => sum + KEEP[card.role], 0) + roles.size * 2
}

export function palaceBot(view: PalaceView, legal: readonly PalaceAction[], level: string, rng: Rng): PalaceAction | null {
  if (view.you === null || legal.length === 0) return null
  const tune = LEVELS[level] ?? LEVELS.normal
  const easy = level === 'easy'
  switch (view.phase.kind) {
    case 'choose':
      if (easy && rng.float() < 0.35) return weighted(legal, () => 1, rng)
      return chooseAct(view, legal, tune, rng)
    case 'respond': {
      const pass = legal.find((one) => one.type === 'pass') ?? null
      if (view.phase.window === 'block') return chooseBlock(view, legal, tune, rng) ?? pass
      const challenge = legal.find((one) => one.type === 'challenge')
      return challenge && wantChallenge(view, tune, rng) ? challenge : pass
    }
    case 'lose': {
      // Turn up the backer worth least
      const loses = legal.filter((one): one is Extract<PalaceAction, { type: 'lose' }> => one.type === 'lose')
      if (easy) return rng.pick(loses)
      return best(loses, (one) => -KEEP[(view.hand.find((card) => card.id === one.card) as PalaceCard).role])
    }
    case 'exchange': {
      const keeps = legal.filter((one): one is Extract<PalaceAction, { type: 'keep' }> => one.type === 'keep')
      if (easy) return rng.pick(keeps)
      const pool = [...view.hand, ...view.drawn]
      return best(keeps, (one) => keepScore(one.cards.map((id) => pool.find((card) => card.id === id) as PalaceCard)))
    }
    default:
      return null
  }
}

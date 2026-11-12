// `npm run play -- <game> [--seed <n>] [--seats <n>] [--option <key>=<value>]...`: plays one random
// game in the terminal through the test harness, as a smoke test. Prints the seed, so a failure can
// be played again. `--option` sets a rule option, hidden ones too, through the same check a room
// uses: `npm run play -- promotion --option edition=full` plays promotion's full edition.
import { parseArgs } from 'node:util'
import { GAME_IDS, GAME_MESSAGES, getGame } from '../shared/games/index.ts'
import { parseOptions } from '../shared/games/options.ts'
import { SCREEN_MESSAGES } from '../shared/games/screenMessages.ts'
import type { TextRef } from '../shared/games/types.ts'
import { HarnessError, playRandom } from '../tests/games/harness.ts'

const GAMES = GAME_IDS.join(', ')
const USAGE = `Usage: npm run play -- <game> [--seed <n>] [--seats <n>] [--option <key>=<value>]...\nGames: ${GAMES}`

function usage(problem: string): never {
  console.error(`${problem}\n${USAGE}`)
  process.exit(2)
}

function intArg(name: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) usage(`--${name} must be a non-negative integer`)
  return value
}

function text(ref: TextRef): string {
  const template = GAME_MESSAGES.en[ref.key] ?? SCREEN_MESSAGES.en[ref.key] ?? ref.key
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(ref.params?.[name] ?? ''))
}

function parse() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        seed: { type: 'string' },
        seats: { type: 'string' },
        option: { type: 'string', multiple: true },
      },
    })
  } catch (error) {
    return usage(error instanceof Error ? error.message : String(error))
  }
}

const parsed = parse()
const id = parsed.positionals[0]
if (id === undefined) usage('Which game?')
const game = getGame(id)
if (game === null) usage(`No game called "${id}"`)

const seed = intArg('seed', parsed.values.seed) ?? Math.floor(Math.random() * 2 ** 32)
const seats = intArg('seats', parsed.values.seats) ?? game.meta.minPlayers
if (seats < game.meta.minPlayers || seats > game.meta.maxPlayers) {
  usage(`${id} takes ${game.meta.minPlayers}-${game.meta.maxPlayers} seats`)
}

/** `key=value` pairs, numbers and booleans read as such; parseOptions drops what is not valid */
function optionsArg(pairs: string[] | undefined) {
  const raw: Record<string, unknown> = {}
  for (const pair of pairs ?? []) {
    const at = pair.indexOf('=')
    if (at < 1) usage(`--option wants <key>=<value>, not "${pair}"`)
    const text = pair.slice(at + 1)
    const number = Number(text)
    raw[pair.slice(0, at)] =
      text === 'true' ? true : text === 'false' ? false : text !== '' && Number.isFinite(number) ? number : text
  }
  return parseOptions(game!.options, raw)
}

const options = optionsArg(parsed.values.option)
console.log(`${id}: ${seats} seats, seed ${seed}, options ${JSON.stringify(options)}`)
try {
  const { steps, final, result } = playRandom(game, { seed, seats, options })
  steps.forEach((step, index) => {
    const actor = step.actor === 'system' ? 'system' : `seat ${step.actor}`
    console.log(`${String(index + 1).padStart(4)}  ${actor}  ${JSON.stringify(step.action)}`)
  })
  console.log(`spectator sees: ${JSON.stringify(game.view(final.state, 'spectator'))}`)
  console.log(text(result.summary))
  for (const line of result.standings) {
    const score = line.score === null ? '' : ` (${line.score})`
    console.log(`  #${line.rank}  seat ${line.seat}${score}  ${text(line.note)}`)
  }
  console.log(`ok: ${steps.length} actions, every check passed`)
} catch (error) {
  if (!(error instanceof HarnessError)) throw error
  console.error(`FAILED: ${error.message}`)
  process.exit(1)
}

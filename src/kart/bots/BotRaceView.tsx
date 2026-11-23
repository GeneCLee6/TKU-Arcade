// A race against the computer (owner 2026-11-17; docs/ARCHITECTURE.md §4.20): its own lazy chunk,
// loaded from /kart's menu. The race room's own rules run in this browser (localRoom.ts) and the
// bots drive in it (botRace.ts); the player races on the very screen of a room's race (RaceView),
// which cannot tell the difference. At the finish, the standings as the room judged them, and a
// way to race again or change the settings.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { kart } from '../../../shared/games/kart/rules.ts'
import type { KartAction } from '../../../shared/games/kart/types.ts'
import { KART_MESSAGES } from '../../../shared/kart/i18n.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import { Button } from '../../components/Button.tsx'
import '../../games/kart/messages.ts'
import { Standings } from '../../games/kart/Standings.tsx'
import { registerMessages, type TextKey } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { readNickname } from '../../lib/nickname.ts'
import { displayType } from '../../styles/esports.ts'
import { broadcast } from '../ui/broadcast.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import RaceView from '../race/RaceView.tsx'
import { useFinishHold } from '../race/useFinishHold.ts'
import { botSeats, createBotRace } from './botRace.ts'
import { createLocalRoom } from './localRoom.ts'
import { raceEpochNow } from '../race/raceClock.ts'
import { drawBots, type BotEntry } from './roster.ts'
import { botTrackId, type BotSetup } from './setup.ts'
import { useMenuMusic } from '../audio/useMenuMusic.ts'
import { useRaceRecorder } from '../../games/kart/useRaceRecorder.ts'
import type { Replay } from '../../../shared/kart/replay.ts'
import ReplayShare from '../watch/ReplayShare.tsx'
import { loadBody, loadDriver, loadOutfit } from '../bodies.ts'
import { formatTime } from '../../../shared/kart/timeTrial.ts'
import { podiumSeats, type PodiumEntry } from '../ceremony/podium.ts'
import { trackAchievement } from '../../achievements/track.ts'

// 2026-11-20 (docs/KART-NETCODE.md §11.4): the race again, as in a room
const ReplayView = lazy(() => import('../watch/ReplayView.tsx'))
// 2026-11-22 (§4.73): the top three on the podium before the results
const PodiumCeremony = lazy(() => import('../ceremony/PodiumCeremony.tsx'))

registerMessages(KART_MESSAGES)

/** How often the bots are run up to the clock, ms: they step at 60 Hz on their own count */
const RUN_EVERY_MS = 16

/**
 * A race of a Grand Prix (src/kart/cup/, docs/ARCHITECTURE.md §4.24): the cup's own opponents and
 * seed, and at the results the way on to the cup's standings instead of racing again
 */
export interface CupRace {
  readonly entries: readonly BotEntry[]
  readonly seed: number
  /** Every seat's rank in the race (1 is first), by seat */
  readonly onNext: (ranks: readonly number[]) => void
}

export interface BotRaceViewProps {
  readonly setup: BotSetup
  /** Back to /kart's menu (in a cup: back to the cup, the race to be run again) */
  readonly onMenu: () => void
  readonly cup?: CupRace
}

export default function BotRaceView({ setup, onMenu, cup }: BotRaceViewProps) {
  // 2026-11-20 (§4.46): the quiet song on the results; the race claims the music over it
  useMenuMusic()
  // A new round is a new room and new bots
  const [round, setRound] = useState(0)
  return (
    <BotRound
      key={round}
      setup={setup}
      cup={cup}
      onAgain={() => setRound((n) => n + 1)}
      onMenu={onMenu}
    />
  )
}

function BotRound({
  setup,
  cup,
  onAgain,
  onMenu,
}: BotRaceViewProps & { readonly onAgain: () => void }) {
  const t = useT()
  const [game] = useState(() => {
    const seed = cup?.seed ?? Math.floor(Math.random() * 2 ** 31)
    const entries = cup ? [...cup.entries] : drawBots(setup.bots, seed)
    // The player starts at the back of the grid, the bots ahead
    const playerSeat = entries.length
    const room = createLocalRoom({
      seats: entries.length + 1,
      options: {
        track: setup.track,
        custom: setup.custom,
        laps: setup.laps,
        mode: setup.mode,
        teams: setup.teams ?? 'solo',
      },
      // A team race: the player is red, and the computer karts are split so that the sides are even
      sides: Array.from({ length: entries.length + 1 }, (_, seat) =>
        seat === playerSeat ? 0 : undefined,
      ),
      seed,
      now: () => raceEpochNow(),
    })
    return { seed, entries, playerSeat, room, realtime: room.realtimeFor(playerSeat) }
  })
  const [view, setView] = useState(() => game.room.view(game.playerSeat))
  // 2026-11-20: recorded as a room's race is, for its replay and its file
  const recording = useRaceRecorder(view, game.realtime)
  const [replay, setReplay] = useState<Replay | null>(null)
  // 2026-11-23: the replay, or its highlights (the broadcast's)
  const [watching, setWatching] = useState<false | 'replay' | 'highlights'>(false)
  // 2026-11-22 (§4.73): the podium shown (or skipped) once the race is over
  const [podiumDone, setPodiumDone] = useState(false)

  useEffect(() => {
    const track = raceTrack(botTrackId(setup))
    if (!track) return
    // Watching first: the race screen's `loaded` (its effect runs before this one) and the bots'
    // put the race into its countdown at once, and the view must carry the start time
    const show = () => setView(game.room.view(game.playerSeat))
    const stopWatching = game.room.onChange(show)
    const race = createBotRace({
      room: game.room,
      track,
      laps: setup.laps,
      bots: botSeats(game.entries, 0, setup.difficulty),
      players: [game.playerSeat],
      seed: game.seed,
      now: raceEpochNow(),
    })
    show()
    const timer = window.setInterval(() => race.advance(raceEpochNow()), RUN_EVERY_MS)
    return () => {
      window.clearInterval(timer)
      stopWatching()
      race.stop()
    }
  }, [game, setup])

  const nameOf = useMemo(() => {
    const you = readNickname() ?? t('kart.bots.you')
    return (seat: number): string => {
      if (seat === game.playerSeat) return you
      const entry = game.entries[seat]
      return entry
        ? t('kart.bots.tag', { name: t(`kart.bots.name.${entry.name}`) })
        : t('kart.bots.you')
    }
  }, [game, t])

  const act = useMemo(
    () => (action: JsonValue) => game.room.act(action as KartAction, game.playerSeat),
    [game],
  )
  // §4.43: the finish's show plays out before the results
  const holding = useFinishHold(
    view.racers.find((racer) => racer.seat === game.playerSeat)?.finishMs != null,
  )

  // e11-t06 (§4.82): where the race ended for the player, to the achievements, once
  const over = view.phase === 'finished'
  useEffect(() => {
    if (!over) return
    const { standings, summary } = kart.result(game.room.state())
    const finished = view.racers.find((racer) => racer.seat === game.playerSeat)?.finishMs != null
    // The player is always on the red side of a team race
    const side = /\.result\.(red|blue)Won$/.exec(summary.key)?.[1]
    trackAchievement({
      type: 'kart.race',
      mode: cup ? 'cup' : 'bots',
      place: finished ? standings.findIndex((line) => line.seat === game.playerSeat) + 1 : null,
      racers: standings.length,
      level: setup.difficulty,
      team: view.teams ? (side === undefined ? 'draw' : side === 'red' ? 'won' : 'lost') : null,
      humans: 1,
    })
    // Once, as the race ends
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over])

  if (view.phase === 'finished' && !holding) {
    const result = kart.result(game.room.state())
    const { standings } = result
    const order = standings.map((line) => line.seat)
    const me = view.racers.find((racer) => racer.seat === game.playerSeat)
    const place = order.indexOf(game.playerSeat) + 1
    if (!replay && recording.recorder.hasFrames()) setReplay(recording.recorder.replay())
    const podium = podiumEntries(view.racers, standings, game, nameOf)
    if (!podiumDone && podium.length > 0) {
      return (
        <Suspense fallback={null}>
          <PodiumCeremony entries={podium} onDone={() => setPodiumDone(true)} />
        </Suspense>
      )
    }
    if (watching && replay) {
      return (
        <Suspense fallback={<p role="status">{t('kart.bots.loading')}</p>}>
          <ReplayView
            replay={replay}
            nameOf={nameOf}
            you={game.playerSeat}
            onClose={() => setWatching(false)}
            highlights={watching === 'highlights'}
          />
        </Suspense>
      )
    }
    return (
      <Results data-testid="kart-bots-results">
        <Card>
          <Heading>{t('kart.bots.results')}</Heading>
          <Place>
            {me?.finishMs != null
              ? t('kart.bots.place', { place, total: order.length })
              : t('kart.bots.notFinished')}
          </Place>
          {view.teams && (
            <TeamLine data-testid="kart-bots-team-result">
              {t(result.summary.key as TextKey, result.summary.params)}
            </TeamLine>
          )}
          <Standings view={view} order={order} nameOf={nameOf} />
          {replay && (
            <Actions>
              <Button
                type="button"
                $variant="secondary"
                onClick={() => setWatching('replay')}
                data-testid="kart-replay-open"
              >
                {t('games.kart.replay.watch')}
              </Button>
              <Button
                type="button"
                $variant="secondary"
                onClick={() => setWatching('highlights')}
                data-testid="kart-highlights-results"
              >
                {t('games.kart.highlights.watch')}
              </Button>
              <ReplayShare replay={replay} nameOf={nameOf} you={game.playerSeat} />
            </Actions>
          )}
          <Actions>
            {cup ? (
              <Button
                type="button"
                onClick={() => {
                  const ranks: number[] = []
                  for (const line of standings) ranks[line.seat] = line.rank
                  cup.onNext(ranks)
                }}
                data-testid="kart-cup-next"
              >
                {t('kart.cup.next')}
              </Button>
            ) : (
              <>
                <Button type="button" onClick={onAgain} data-testid="kart-bots-again">
                  {t('kart.bots.again')}
                </Button>
                <Button type="button" $variant="secondary" onClick={onMenu}>
                  {t('kart.bots.menu')}
                </Button>
              </>
            )}
          </Actions>
        </Card>
      </Results>
    )
  }

  const me = view.racers.find((racer) => racer.seat === game.playerSeat)
  return (
    <>
      <RaceView
        view={view}
        realtime={recording.realtime ?? game.realtime}
        act={act}
        nameOf={nameOf}
        lookOf={(seat) => game.entries[seat] ?? null}
        pause={{ canPause: true, onRestart: onAgain, onKartMenu: onMenu }}
      />
      {me?.finishMs != null && (
        <BottomCenter>
          <Button
            type="button"
            onClick={() => game.room.act({ t: 'close' }, 'system')}
            data-testid="kart-bots-show-results"
          >
            {t('kart.bots.showResults')}
          </Button>
        </BottomCenter>
      )}
    </>
  )
}

// Over the race screen (RaceView's page sits at z-index 20)
const BottomCenter = styled.div`
  position: fixed;
  bottom: 120px;
  left: 50%;
  z-index: 21;
  translate: -50% 0;
`

const Results = styled.main`
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: ${space.lg}px;
  overflow-y: auto;
  background: ${color.bg};
`

const Card = styled.section`
  ${broadcast}
  display: grid;
  gap: ${space.md}px;
  width: min(420px, 100%);
  padding: ${space.lg}px;
`

const Heading = styled.h1`
  ${displayType}
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
`

const TeamLine = styled.p`
  margin: 0;
  font-weight: 700;
`

const Place = styled.p`
  margin: 0;
  color: ${color.success};
  font-size: ${fontSize.lg}px;
  font-weight: 700;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

/**
 * 2026-11-22 (§4.73): the podium's three from the room's standings: those who finished, each with
 * the kart they drove (the player's own, the computer's from its entry) and their time
 */
function podiumEntries(
  racers: readonly { seat: number; finishMs: number | null }[],
  standings: readonly { seat: number; rank: number }[],
  game: { readonly playerSeat: number; readonly entries: readonly BotEntry[] },
  nameOf: (seat: number) => string,
): PodiumEntry[] {
  const finishOf = (seat: number) => racers.find((racer) => racer.seat === seat)?.finishMs ?? null
  return podiumSeats(
    standings.map((line) => ({ ...line, out: finishOf(line.seat) === null })),
  ).map(({ seat, place }) => {
    const entry = game.entries[seat]
    const you = seat === game.playerSeat
    return {
      seat,
      place,
      name: nameOf(seat),
      kart: you || !entry ? loadBody() : entry.kart,
      driver: you || !entry ? loadDriver() : entry.driver,
      // 2026-11-23 (shared/kart/outfits.ts): what you wear; the computer's drivers in the race suit
      ...(you || !entry ? { outfit: loadOutfit(loadDriver()) } : {}),
      line: formatTime((finishOf(seat) ?? 0) / 1000),
      you,
    }
  })
}

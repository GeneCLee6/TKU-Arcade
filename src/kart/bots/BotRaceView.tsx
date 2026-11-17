// A race against the computer (owner 2026-11-17; docs/ARCHITECTURE.md §4.20): its own lazy chunk,
// loaded from /kart's menu. The race room's own rules run in this browser (localRoom.ts) and the
// bots drive in it (botRace.ts); the player races on the very screen of a room's race (RaceView),
// which cannot tell the difference. At the finish, the standings as the room judged them, and a
// way to race again or change the settings.
import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { kart } from '../../../shared/games/kart/rules.ts'
import type { KartAction } from '../../../shared/games/kart/types.ts'
import { KART_MESSAGES } from '../../../shared/kart/i18n.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import { Button } from '../../components/Button.tsx'
import '../../games/kart/messages.ts'
import { Standings } from '../../games/kart/Standings.tsx'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { readNickname } from '../../lib/nickname.ts'
import { displayType, glass } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import RaceView from '../race/RaceView.tsx'
import { botSeats, createBotRace } from './botRace.ts'
import { createLocalRoom } from './localRoom.ts'
import { drawBots, type BotEntry } from './roster.ts'
import { botTrackId, type BotSetup } from './setup.ts'

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
      options: { track: setup.track, custom: setup.custom, laps: setup.laps, mode: setup.mode },
      seed,
      now: () => Date.now(),
    })
    return { seed, entries, playerSeat, room, realtime: room.realtimeFor(playerSeat) }
  })
  const [view, setView] = useState(() => game.room.view(game.playerSeat))

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
      now: Date.now(),
    })
    show()
    const timer = window.setInterval(() => race.advance(Date.now()), RUN_EVERY_MS)
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

  if (view.phase === 'finished') {
    const standings = kart.result(game.room.state()).standings
    const order = standings.map((line) => line.seat)
    const me = view.racers.find((racer) => racer.seat === game.playerSeat)
    const place = order.indexOf(game.playerSeat) + 1
    return (
      <Results data-testid="kart-bots-results">
        <Card>
          <Heading>{t('kart.bots.results')}</Heading>
          <Place>
            {me?.finishMs != null
              ? t('kart.bots.place', { place, total: order.length })
              : t('kart.bots.notFinished')}
          </Place>
          <Standings view={view} order={order} nameOf={nameOf} />
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
      <RaceView view={view} realtime={game.realtime} act={act} nameOf={nameOf} />
      <TopCenter>
        <Button type="button" $variant="secondary" $size="sm" onClick={onMenu}>
          {t('kart.bots.quit')}
        </Button>
      </TopCenter>
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
const TopCenter = styled.div`
  position: fixed;
  top: ${space.sm}px;
  left: 50%;
  z-index: 21;
  translate: -50% 0;
`

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
  ${glass}
  display: grid;
  gap: ${space.md}px;
  width: min(420px, 100%);
  padding: ${space.lg}px;
`

const Heading = styled.h1`
  ${displayType}
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.xl}px;
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

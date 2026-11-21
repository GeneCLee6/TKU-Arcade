// The Grand Prix (owner 2026-11-17; docs/ARCHITECTURE.md §4.24): its own lazy chunk, opened from
// /kart's menu or straight away when a reload finds a cup under way. Between races, the cup's card:
// the next race, the standings so far and the field; each race is a race against the computer
// (BotRaceView) with the cup's own opponents; after the last, the podium. Every step is kept in this
// browser (store.ts) before it shows.
import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import { Button } from '../../components/Button.tsx'
import { useT } from '../../i18n/useT.ts'
import { readNickname } from '../../lib/nickname.ts'
import { displayType } from '../../styles/esports.ts'
import { broadcast } from '../ui/broadcast.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import BotRaceView from '../bots/BotRaceView.tsx'
import {
  beginRace,
  currentTrack,
  finishRace,
  leaveCup,
  outcomeOf,
  playerSeat,
  quitRace,
  raceCount,
  raceSeed,
  seatCount,
  standingsOf,
  type CupRun,
} from './cupRun.ts'
import type { CupLine } from './points.ts'
import { clearCupRun, keepCupBest, saveCupRun } from './store.ts'
import { cupOf } from './cups.ts'
import { Trophy } from './Trophy.tsx'
import { useMenuMusic } from '../audio/useMenuMusic.ts'
import { isKartId } from '../../../shared/kart/karts.ts'
import { loadBody, loadDriver } from '../bodies.ts'
import { prefetchKart, RACE_ENGINE } from '../load/kartLoad.ts'

// 2026-11-20 (§4.47): the player's own driver on the podium, celebrating (three.js, fetched then)
const KartPreview = lazy(() => import('../roster/KartPreview.tsx'))

export interface CupViewProps {
  readonly run: CupRun
  /** Back to /kart's menu */
  readonly onMenu: () => void
}

export default function CupView({ run: first, onMenu }: CupViewProps) {
  const t = useT()
  // 2026-11-20 (§4.46): the quiet song on the cup's card and podium
  useMenuMusic()
  const [run, setRunState] = useState(first)
  const [newBest, setNewBest] = useState(false)
  const [abandoning, setAbandoning] = useState(false)
  const setRun = (next: CupRun) => {
    saveCupRun(next)
    setRunState(next)
  }
  const cupName = t(`kart.cup.name.${run.setup.cup}`)
  const races = raceCount(run)
  const you = playerSeat(run)

  const nameOf = useMemo(() => {
    const me = readNickname() ?? t('kart.bots.you')
    return (seat: number): string => {
      const entry = run.entries[seat]
      return seat === you || !entry
        ? me
        : t('kart.bots.tag', { name: t(`kart.bots.name.${entry.name}`) })
    }
  }, [run.entries, you, t])

  const track = currentTrack(run)
  // 2026-11-21 (docs/ARCHITECTURE.md §4.52): the race to come, fetched while this card is up (and the
  // one after it, during a race), so that its loading screen is gone at once
  const upcoming = run.phase === 'racing' ? cupOf(run.setup.cup).tracks[run.results.length + 1] : track
  const grid = run.entries.map((entry) => entry.kart).join()
  useEffect(() => {
    if (!upcoming) return
    const bodies = [loadBody(), ...(grid.split(',').filter(isKartId))]
    prefetchKart({ engine: RACE_ENGINE, track: { id: upcoming }, bodies, music: true })
  }, [upcoming, grid])
  if (run.phase === 'racing' && track) {
    return (
      <BotRaceView
        key={run.results.length}
        setup={{
          track,
          bots: run.entries.length,
          difficulty: run.setup.difficulty,
          mode: run.setup.mode,
          laps: run.setup.laps,
          teams: run.setup.teams ?? 'solo',
        }}
        cup={{
          entries: run.entries,
          seed: raceSeed(run),
          onNext: (ranks) => {
            const next = finishRace(run, ranks)
            if (next.phase === 'podium') setNewBest(keepCupBest(run.setup.cup, outcomeOf(next)))
            setRun(next)
          },
        }}
        onMenu={() => setRun(quitRace(run))}
      />
    )
  }

  const table = standingsOf(run)
  if (run.phase === 'podium') {
    const outcome = outcomeOf(run)
    const done = () => {
      clearCupRun()
      onMenu()
    }
    return (
      <Screen data-testid="kart-cup-podium">
        <Card>
          <Heading>{t('kart.cup.podium', { cup: cupName })}</Heading>
          <Podium lines={table} nameOf={nameOf} you={you} />
          <Suspense fallback={null}>
            <KartPreview
              kart={loadBody()}
              driver={loadDriver()}
              label={t(outcome.place <= 3 ? 'kart.cup.podiumDriver' : 'kart.cup.offPodiumDriver')}
              hint=""
              morphLabel=""
              pose={outcome.place <= 3 ? 'podium' : 'idle'}
            />
          </Suspense>
          <TrophyRow>
            <Trophy
              cup={run.setup.cup}
              races={races}
              label={t('kart.cup.trophy', { cup: cupName })}
            />
          </TrophyRow>
          <Place data-testid="kart-cup-outcome">
            {t('kart.cup.finalPlace', {
              place: outcome.place,
              total: seatCount(run),
              points: outcome.points,
            })}
          </Place>
          {newBest && <News role="status">{t('kart.cup.newBest')}</News>}
          <Table lines={table} races={run.results.length} nameOf={nameOf} you={you} />
          <Button type="button" onClick={done} data-testid="kart-cup-done">
            {t('kart.cup.done')}
          </Button>
        </Card>
      </Screen>
    )
  }

  const race = run.results.length + 1
  const toMenu = () => {
    saveCupRun(leaveCup(run))
    onMenu()
  }
  const abandon = () => {
    clearCupRun()
    onMenu()
  }
  return (
    <Screen data-testid="kart-cup-ready">
      <Card>
        <Heading>{cupName}</Heading>
        <Next data-testid="kart-cup-race">
          {t('kart.cup.raceOf', {
            race,
            races,
            track: track ? t(`kart.course.${track}`) : '',
          })}
        </Next>
        {run.results.length > 0 ? (
          <>
            <SubHeading>
              {t('kart.cup.standingsAfter', { race: run.results.length, races })}
            </SubHeading>
            <Table lines={table} races={run.results.length} nameOf={nameOf} you={you} />
          </>
        ) : (
          <>
            <SubHeading>{t('kart.cup.field')}</SubHeading>
            <Field>
              {run.entries.map((entry, seat) => (
                <li key={entry.name}>
                  <strong>{nameOf(seat)}</strong>
                  <span>
                    {t('kart.cup.rides', {
                      kart: t(`kart.body.${entry.kart}`),
                      driver: t(`kart.driver.${entry.driver}`),
                    })}
                  </span>
                </li>
              ))}
            </Field>
          </>
        )}
        <Actions>
          <Button
            type="button"
            onClick={() => setRun(beginRace(run))}
            data-testid="kart-cup-start-race"
          >
            {t('kart.cup.startRace', { race })}
          </Button>
          <Button type="button" $variant="secondary" onClick={toMenu} data-testid="kart-cup-menu">
            {t('kart.cup.toMenu')}
          </Button>
        </Actions>
        {abandoning ? (
          <Actions role="group" aria-label={t('kart.cup.abandon')}>
            <Muted>{t('kart.cup.abandonSure')}</Muted>
            <Button
              type="button"
              $variant="secondary"
              $size="sm"
              onClick={abandon}
              data-testid="kart-cup-abandon-yes"
            >
              {t('kart.cup.abandonYes')}
            </Button>
            <Button type="button" $size="sm" onClick={() => setAbandoning(false)}>
              {t('kart.cup.abandonNo')}
            </Button>
          </Actions>
        ) : (
          <Actions>
            <Button
              type="button"
              $variant="secondary"
              $size="sm"
              onClick={() => setAbandoning(true)}
              data-testid="kart-cup-abandon"
            >
              {t('kart.cup.abandon')}
            </Button>
          </Actions>
        )}
      </Card>
    </Screen>
  )
}

/** The cup's table: place, racer, each race's points, the total */
function Table({
  lines,
  races,
  nameOf,
  you,
}: {
  lines: readonly CupLine[]
  races: number
  nameOf: (seat: number) => string
  you: number
}) {
  const t = useT()
  return (
    <Grid data-testid="kart-cup-standings">
      <caption>{t('kart.cup.standings')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('kart.cup.col.place')}</th>
          <th scope="col">{t('kart.cup.col.racer')}</th>
          {Array.from({ length: races }, (_, index) => (
            <th scope="col" key={index}>
              {t('kart.cup.col.race', { race: index + 1 })}
            </th>
          ))}
          <th scope="col">{t('kart.cup.col.points')}</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line, index) => (
          <Line key={line.seat} $you={line.seat === you} data-seat={line.seat}>
            <td>{index + 1}</td>
            <th scope="row">{nameOf(line.seat)}</th>
            {line.races.map((points, race) => (
              <td key={race}>{points}</td>
            ))}
            <td>
              <strong>{line.points}</strong>
            </td>
          </Line>
        ))}
      </tbody>
    </Grid>
  )
}

/** The first three on steps, the winner in the middle and highest */
function Podium({
  lines,
  nameOf,
  you,
}: {
  lines: readonly CupLine[]
  nameOf: (seat: number) => string
  you: number
}) {
  const t = useT()
  // Second, first, third, left to right (only as many as raced)
  const order = [1, 0, 2].filter((index) => lines[index])
  return (
    <Steps>
      {order.map((index) => {
        const line = lines[index]!
        return (
          <Step key={line.seat} $place={index + 1} data-place={index + 1}>
            <StepName $you={line.seat === you}>{nameOf(line.seat)}</StepName>
            <Block $place={index + 1}>
              <BlockPlace>{index + 1}</BlockPlace>
              <span>{t('kart.cup.points', { points: line.points })}</span>
            </Block>
          </Step>
        )
      })}
    </Steps>
  )
}

const Screen = styled.main`
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
  width: min(560px, 100%);
  padding: ${space.lg}px;
  color: ${color.text};
`

const Heading = styled.h1`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.xl}px;
`

const SubHeading = styled.h2`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const Next = styled.p`
  margin: 0;
  color: ${color.brand};
  font-size: ${fontSize.lg}px;
  font-weight: 700;
`

const Place = styled.p`
  margin: 0;
  color: ${color.success};
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  text-align: center;
`

const News = styled.p`
  margin: 0;
  color: ${color.magenta};
  font-weight: 700;
  text-align: center;
`

const Muted = styled.span`
  color: ${color.muted};
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
`

const Field = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;

  & > li {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: ${space.sm}px;
  }

  & span {
    color: ${color.muted};
  }
`

const Grid = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${fontSize.sm}px;
  font-variant-numeric: tabular-nums;

  & caption {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  & th,
  & td {
    padding: ${space.xs}px;
    text-align: right;
  }

  & th[scope='row'],
  & thead th:nth-child(2) {
    text-align: left;
  }

  & thead th {
    color: ${color.muted};
    font-weight: 400;
    border-bottom: 1px solid ${color.border};
  }
`

const Line = styled.tr<{ $you: boolean }>`
  background: ${({ $you }) => ($you ? color.raised : 'transparent')};
  font-weight: ${({ $you }) => ($you ? 700 : 400)};
`

const TrophyRow = styled.div`
  display: flex;
  justify-content: center;
`

const rise = keyframes`
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
`

const Steps = styled.div`
  display: flex;
  justify-content: center;
  align-items: flex-end;
  gap: ${space.sm}px;
  min-height: 200px;
`

const Step = styled.div<{ $place: number }>`
  display: grid;
  justify-items: center;
  gap: ${space.xs}px;
  width: min(30%, 150px);
`

const StepName = styled.span<{ $you: boolean }>`
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ $you }) => ($you ? color.brand : color.text)};
  font-weight: 700;
`

const STEP_HEIGHTS = [0, 150, 110, 80]

const Block = styled.div<{ $place: number }>`
  display: grid;
  align-content: start;
  justify-items: center;
  width: 100%;
  height: ${({ $place }) => STEP_HEIGHTS[$place]}px;
  padding-top: ${space.sm}px;
  border-top: 4px solid
    ${({ $place }) => ($place === 1 ? color.chipFace : $place === 2 ? color.brand : color.magenta)};
  background: ${color.raised};
  color: ${color.text};
  transform-origin: bottom;
  animation: ${rise} 0.6s ease-out both;
  animation-delay: ${({ $place }) => (3 - $place) * 0.25}s;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const BlockPlace = styled.span`
  ${displayType}
  font-size: ${fontSize.xxl}px;
`

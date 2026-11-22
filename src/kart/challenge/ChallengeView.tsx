// 2026-11-21 (owner: "design more challenging levels"; docs/ARCHITECTURE.md §4.60, docs/KART-FEEL.md
// §19): the challenge mode, its own lazy chunk, opened from /kart's menu (or /kart?challenge,
// ?challenge=<mission>). Two halves:
//
// - missions (missions.ts): one track and one condition each, in four chapters that open one after
//   the other. A mission driven alone runs in the time trial's own loop (spikeLoop.ts) and is judged
//   step by step (judge.ts); one against the computer runs the race against the computer (the race
//   room's rules in this browser, the bots, RaceView) and is judged from the room's laps;
// - the medal wall (medals.ts): a three-lap time trial on every track for bronze, silver, gold and,
//   once gold is won, platinum, beside the ghost of the target if wanted.
//
// What is won is kept in this browser (store.ts). `?autopilot` drives with the master's hands (the
// browser tests, and to watch a mission done).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import styled, { css } from 'styled-components'
import { kartMessages } from '../../../shared/games/kart/i18n.ts'
import type { KartAction } from '../../../shared/games/kart/types.ts'
import type { Ghost } from '../../../shared/kart/ghost.ts'
import { KART_MESSAGES, type KartMessageKey } from '../../../shared/kart/i18n.ts'
import { KART_CHALLENGE_MESSAGES } from '../../../shared/kart/i18n.challenge.ts'
import { applyKart } from '../../../shared/kart/karts.ts'
import {
  DEFAULT_RULES,
  KART_TUNING,
  STEP_SECONDS,
  type KartInput,
} from '../../../shared/kart/physics.ts'
import { formatTime, type Trial } from '../../../shared/kart/timeTrial.ts'
import type { Track } from '../../../shared/kart/track.ts'
import { RACE_TRACK_IDS } from '../../../shared/kart/tracks/list.ts'
import type { JsonValue } from '../../../shared/patch.ts'
import { Button } from '../../components/Button.tsx'
import { registerMessages } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { readNickname } from '../../lib/nickname.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { useMenuMusic } from '../audio/useMenuMusic.ts'
import { loadBody, loadDriver } from '../bodies.ts'
import { botSeats, createBotRace } from '../bots/botRace.ts'
import { createDriver, DRIVERS } from '../bots/drivers.ts'
import { createLocalRoom } from '../bots/localRoom.ts'
import { drawBots } from '../bots/roster.ts'
import type { Callout } from '../callouts.ts'
import { loadBindings } from '../devices.ts'
import { BoostVeil, CalloutText, Hud } from '../Hud.tsx'
import { KART_COMPACT } from '../layout.ts'
import { RACE_ENGINE } from '../load/kartLoad.ts'
import { KartLoading } from '../load/KartLoading.tsx'
import { useKartLoad } from '../load/useKartLoad.ts'
import { loadQuality } from '../quality.ts'
import RaceView from '../race/RaceView.tsx'
import { PauseLayer } from '../ui/PauseLayer.tsx'
import { raceEpochNow } from '../race/raceClock.ts'
import { RaceCenter, RaceClock, type RaceClockHandle } from '../RaceOverlay.tsx'
import type { SpikeHud, SpikeStep, SpikeTrial } from '../spikeLoop.ts'
import { TouchControls } from '../touch/TouchControls.tsx'
import { touchBottom, touchSpace } from '../touch/touchLayout.ts'
import { useTouchControls } from '../touch/useTouchControls.ts'
import { broadcast, broadcastSolid, slam, ticker } from '../ui/broadcast.ts'
import { supportsWebGL2 } from '../webgl.ts'
import {
  forkFinder,
  platformFinder,
  missionContext,
  missionTrack,
  targetGhost,
} from './headless.ts'
import {
  judgeRace,
  judgeStep,
  ruleBroken,
  sampleOf,
  startJudge,
  targetOf,
  type FailReason,
  type Judge,
  type RaceVerdict,
} from './judge.ts'
import {
  betterMedal,
  MEDAL_IDS,
  medalFor,
  medalTimes,
  missionStars,
  nextMedal,
  starsFor,
  type MedalId,
} from './medals.ts'
import {
  CHAPTER_IDS,
  isMissionId,
  isRaceMission,
  MISSIONS,
  missionOf,
  missionsOf,
  nextMission,
  UNLOCK_PASSES,
  type ChapterId,
  type Mission,
} from './missions.ts'
import { goalLines, lapsText, trackName, type KartT } from './goals.ts'
import {
  chapterOpen,
  loadProgress,
  passesIn,
  saveRun,
  saveStars,
  totalStars,
  type ChallengeProgress,
} from './store.ts'

registerMessages(KART_MESSAGES)
// This screen's own strings, in its own chunk: the menu and a race never load them (2026-11-22)
registerMessages(KART_CHALLENGE_MESSAGES)
// The tracks' names as a room shows them (`games.kart.track.<id>`, goals.ts)
registerMessages(kartMessages)

const EMPTY_HUD: SpikeHud = { speed: 0, gauge: 0, storedBoosts: 0, boosting: false, chain: 0, hits: 0 }
const CALLOUT_MS = 900
/** How often the bots are run up to the clock, ms (as BotRaceView.tsx) */
const RUN_EVERY_MS = 16
/** The tracks of the medal wall: every built-in race track */
const MEDAL_TRACKS = RACE_TRACK_IDS

/** What the address asks for: ?challenge=<mission> or ?challenge=medal-<track> */
type Screen =
  | { readonly kind: 'home'; readonly tab: 'missions' | 'medals' }
  | { readonly kind: 'mission'; readonly id: string }
  | { readonly kind: 'medal'; readonly track: string }

function askedScreen(): Screen {
  const asked = new URLSearchParams(window.location.search).get('challenge') ?? ''
  if (isMissionId(asked)) return { kind: 'mission', id: asked }
  const track = asked.startsWith('medal-') ? asked.slice('medal-'.length) : ''
  if ((MEDAL_TRACKS as readonly string[]).includes(track)) return { kind: 'medal', track }
  return { kind: 'home', tab: asked === 'medals' ? 'medals' : 'missions' }
}

const screenParam = (screen: Screen): string =>
  screen.kind === 'mission'
    ? screen.id
    : screen.kind === 'medal'
      ? `medal-${screen.track}`
      : screen.tab === 'medals'
        ? 'medals'
        : ''

export interface ChallengeViewProps {
  /** Back to /kart's menu */
  readonly onExit: () => void
}

export default function ChallengeView({ onExit }: ChallengeViewProps) {
  const [screen, setScreen] = useState<Screen>(askedScreen)
  const [progress, setProgress] = useState<ChallengeProgress>(loadProgress)
  // A run started again is a new run of it
  const [round, setRound] = useState(0)
  const open = (next: Screen) => {
    const url = new URL(window.location.href)
    url.searchParams.set('challenge', screenParam(next))
    window.history.replaceState(null, '', url)
    setRound((n) => n + 1)
    setScreen(next)
  }
  const home = (tab: 'missions' | 'medals') => open({ kind: 'home', tab })
  if (screen.kind === 'home') {
    return (
      <ChallengeHome
        tab={screen.tab}
        progress={progress}
        onTab={home}
        onMission={(id) => open({ kind: 'mission', id })}
        onMedal={(track) => open({ kind: 'medal', track })}
        onExit={onExit}
      />
    )
  }
  if (screen.kind === 'medal') {
    return (
      <MedalScreen
        key={`${screen.track}-${round}`}
        track={screen.track}
        progress={progress}
        onResult={(seconds, medal) => setProgress(saveRun(screen.track, seconds, medal))}
        onAgain={() => open(screen)}
        onList={() => home('medals')}
      />
    )
  }
  const mission = missionOf(screen.id)
  const next = nextMission(mission.id)
  const props: RunProps = {
    mission,
    onResult: (stars) => setProgress(saveStars(mission.id, stars)),
    onAgain: () => open(screen),
    onNext:
      next && chapterOpen(progress, next.chapter) ? () => open({ kind: 'mission', id: next.id }) : null,
    onList: () => home('missions'),
  }
  return isRaceMission(mission) ? (
    <MissionRace key={`${mission.id}-${round}`} {...props} />
  ) : (
    <MissionRun key={`${mission.id}-${round}`} {...props} />
  )
}

// ── The home: missions by chapter, and the medal wall ──────────────────────────────────────────

function StarRow({ t, stars }: { t: KartT; stars: number }) {
  return (
    <Stars role="img" aria-label={t('kart.challenge.stars', { stars })} data-stars={stars}>
      {[1, 2, 3].map((n) => (
        <Star key={n} $on={n <= stars} aria-hidden="true">
          ★
        </Star>
      ))}
    </Stars>
  )
}

function ChallengeHome({
  tab,
  progress,
  onTab,
  onMission,
  onMedal,
  onExit,
}: {
  tab: 'missions' | 'medals'
  progress: ChallengeProgress
  onTab: (tab: 'missions' | 'medals') => void
  onMission: (id: string) => void
  onMedal: (track: string) => void
  onExit: () => void
}) {
  const t: KartT = useT()
  useMenuMusic()
  return (
    <MenuPage data-testid="kart-challenge">
      <MenuCard>
        <Title>{t('kart.challenge.title')}</Title>
        <Intro>{t('kart.challenge.intro')}</Intro>
        <Tabs role="tablist">
          {(['missions', 'medals'] as const).map((one) => (
            <Button
              key={one}
              type="button"
              role="tab"
              $size="sm"
              $variant={one === tab ? 'primary' : 'secondary'}
              aria-selected={one === tab}
              onClick={() => onTab(one)}
              data-testid={`kart-challenge-tab-${one}`}
            >
              {t(`kart.challenge.tab.${one}`)}
            </Button>
          ))}
        </Tabs>
        {tab === 'missions' ? (
          <MissionList t={t} progress={progress} onMission={onMission} />
        ) : (
          <MedalWall t={t} progress={progress} onMedal={onMedal} />
        )}
        <Button type="button" $variant="secondary" onClick={onExit} data-testid="kart-challenge-exit">
          {t('kart.challenge.back')}
        </Button>
      </MenuCard>
    </MenuPage>
  )
}

function MissionList({
  t,
  progress,
  onMission,
}: {
  t: KartT
  progress: ChallengeProgress
  onMission: (id: string) => void
}) {
  return (
    <>
      <Total data-testid="kart-challenge-total">
        {t('kart.challenge.total', { stars: totalStars(progress), most: MISSIONS.length * 3 })}
      </Total>
      {CHAPTER_IDS.map((chapter, at) => {
        const missions = missionsOf(chapter)
        const open = chapterOpen(progress, chapter)
        const before: ChapterId | undefined = CHAPTER_IDS[at - 1]
        return (
          <Chapter
            key={chapter}
            aria-labelledby={`kart-challenge-chapter-${chapter}`}
            data-testid={`kart-challenge-chapter-${chapter}`}
            data-open={open || undefined}
          >
            <ChapterHead>
              <ChapterName id={`kart-challenge-chapter-${chapter}`}>
                {t(`kart.challenge.chapter.${chapter}`)}
              </ChapterName>
              <ChapterNote>
                {open
                  ? t('kart.challenge.chapterPasses', {
                      passed: passesIn(progress, chapter),
                      total: missions.length,
                    })
                  : t('kart.challenge.locked', {
                      need: UNLOCK_PASSES,
                      chapter: before ? t(`kart.challenge.chapter.${before}`) : '',
                    })}
              </ChapterNote>
            </ChapterHead>
            <List>
              {missions.map((mission) => {
                const number = MISSIONS.indexOf(mission) + 1
                const lines = goalLines(t, mission)
                const name = t(`kart.challenge.mission.${mission.id}` as KartMessageKey)
                return (
                  <Row key={mission.id} $locked={!open} data-testid={`kart-challenge-mission-${mission.id}`}>
                    <Number>{number}</Number>
                    <RowText>
                      <RowName>{name}</RowName>
                      <RowGoal>{lines.join(' · ')}</RowGoal>
                      <RowMeta>
                        {trackName(t, mission.track)} · {lapsText(t, mission.laps)}
                      </RowMeta>
                    </RowText>
                    <StarRow t={t} stars={progress.stars[mission.id] ?? 0} />
                    <Button
                      type="button"
                      $size="sm"
                      $variant="secondary"
                      disabled={!open}
                      onClick={() => onMission(mission.id)}
                      aria-label={`${t('kart.challenge.start')}: ${name}`}
                      data-testid={`kart-challenge-start-${mission.id}`}
                    >
                      {t('kart.challenge.start')}
                    </Button>
                  </Row>
                )
              })}
            </List>
          </Chapter>
        )
      })}
    </>
  )
}

function MedalBadge({ t, medal }: { t: KartT; medal: MedalId | undefined }) {
  return (
    <Badge $medal={medal ?? null} data-medal={medal ?? 'none'}>
      {medal ? t(`kart.challenge.medal.${medal}`) : '—'}
    </Badge>
  )
}

function MedalWall({
  t,
  progress,
  onMedal,
}: {
  t: KartT
  progress: ChallengeProgress
  onMedal: (track: string) => void
}) {
  const won = MEDAL_TRACKS.filter((id) => progress.medals[id]).length
  return (
    <>
      <Intro>{t('kart.challenge.medals.intro')}</Intro>
      <Total data-testid="kart-challenge-medal-count">
        {t('kart.challenge.medals.count', { count: won, total: MEDAL_TRACKS.length })}
      </Total>
      <Wall data-testid="kart-challenge-medals">
        {MEDAL_TRACKS.map((id) => {
          const times = medalTimes(id)
          const had = progress.medals[id]
          const best = progress.best[id]
          return (
            <Plaque key={id} data-testid={`kart-challenge-medal-${id}`}>
              <PlaqueHead>
                <RowName>{trackName(t, id)}</RowName>
                <MedalBadge t={t} medal={had} />
              </PlaqueHead>
              <RowGoal>
                {best !== undefined
                  ? t('kart.challenge.medals.best', { time: formatTime(best) })
                  : t('kart.challenge.medals.none')}
              </RowGoal>
              {times && (
                <Targets>
                  {MEDAL_IDS.map((medal) => {
                    const hidden = medal === 'platinum' && had !== 'gold' && had !== 'platinum'
                    return (
                      <Target key={medal} $medal={medal}>
                        <span>{t(hidden ? 'kart.challenge.medal.hidden' : `kart.challenge.medal.${medal}`)}</span>
                        <span>{hidden ? '—' : formatTime(times[medal])}</span>
                      </Target>
                    )
                  })}
                </Targets>
              )}
              <Button
                type="button"
                $size="sm"
                $variant="secondary"
                onClick={() => onMedal(id)}
                aria-label={`${t('kart.challenge.medals.go')}: ${trackName(t, id)}`}
                data-testid={`kart-challenge-medal-go-${id}`}
              >
                {t('kart.challenge.medals.go')}
              </Button>
            </Plaque>
          )
        })}
      </Wall>
    </>
  )
}

// ── A run alone: a mission, or a time trial for a medal ───────────────────────────────────────

interface RunProps {
  readonly mission: Mission
  readonly onResult: (stars: 1 | 2 | 3) => void
  readonly onAgain: () => void
  readonly onNext: (() => void) | null
  readonly onList: () => void
}

/** The kart, the controls and the quality, read once for a run */
function useRunSetup(vehicle: Mission['vehicle']) {
  const [setup] = useState(() => {
    const body = vehicle ?? loadBody()
    // Driven with the standard tuning, whatever the tuning panel was set to: the medals and the
    // stars were measured with it
    return {
      body,
      driver: loadDriver(),
      quality: loadQuality(),
      controls: {
        bindings: loadBindings(),
        rules: DEFAULT_RULES,
        tuning: applyKart(KART_TUNING, body),
        enabled: true,
      },
    }
  })
  return setup
}

const autopilotAsked = () => new URLSearchParams(window.location.search).has('autopilot')

/** What the page shows of the judge: redrawn only when one of these changes */
interface Shown {
  readonly count: number
  readonly done: boolean
  readonly failed: boolean
  readonly why: FailReason | null
  readonly seconds: number
}

const shownOf = (judge: Judge): Shown => ({
  count: judge.count,
  done: judge.done,
  failed: judge.failed,
  why: judge.why,
  seconds: (judge.doneAt ?? 0) * STEP_SECONDS,
})

const sameShown = (a: Shown, b: Shown) =>
  a.count === b.count && a.done === b.done && a.failed === b.failed && a.why === b.why

function MissionRun({ mission, onResult, onAgain, onNext, onList }: RunProps) {
  const t: KartT = useT()
  const stage = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState(() => !supportsWebGL2())
  const [hud, setHud] = useState<SpikeHud>(EMPTY_HUD)
  const [trial, setTrial] = useState<SpikeTrial>()
  const [callout, setCallout] = useState<{ callout: Callout; id: number }>()
  const clock = useRef<RaceClockHandle>(null)
  const touch = useTouchControls()
  const touchSource = touch.source
  const setup = useRunSetup(mission.vehicle)
  const track = useMemo(() => missionTrack(mission.track), [mission.track])
  const context = useMemo(
    () => missionContext(mission, track, setup.controls.tuning),
    [mission, track, setup.controls.tuning],
  )
  const target = targetOf(mission, context)
  const stars = useMemo(() => missionStars(mission), [mission])
  const [autopiloted] = useState(autopilotAsked)
  const judge = useRef<Judge>(startJudge())
  const [shown, setShown] = useState<Shown>(() => shownOf(startJudge()))
  const reported = useRef(false)
  const load = useKartLoad(
    { engine: RACE_ENGINE, track, bodies: [setup.body], music: true },
    `${track.id}|${setup.body}`,
  )
  const engine = load.engine

  useEffect(() => {
    if (!stage.current || failure || !engine) return
    const findFork = forkFinder(track)
    const findPlatform = platformFinder(track)
    const pilot: ((trial: Trial) => KartInput) | null = autopiloted
      ? createDriver(DRIVERS.master, track, setup.controls.tuning, 7)
      : null
    const noN2O = mission.rules?.noN2O ?? false
    let stop: (() => void) | undefined
    try {
      stop = engine.startSpikeLoop(stage.current, {
        controls: () => setup.controls,
        onStats: () => {},
        onHud: setHud,
        onCallout: (next) => setCallout((last) => ({ callout: next, id: (last?.id ?? 0) + 1 })),
        onContextLost: () => setFailure(true),
        track,
        quality: setup.quality,
        body: setup.body,
        driver: setup.driver,
        ghost: null,
        laps: mission.laps,
        // A mission's own laps, vehicle or handicap make no record of the track
        keepRecords: false,
        onTrial: setTrial,
        onClock: (total, lap) => clock.current?.set(total, lap),
        touch: touchSource,
        ...(autopiloted
          ? {
              autopilot: (trial: Trial) => {
                const input = pilot!(trial)
                return noN2O ? { ...input, boost: false } : input
              },
            }
          : {}),
        onStep: (step: SpikeStep) => {
          const sample = sampleOf(step, findFork, findPlatform)
          if (!sample) return
          judge.current = judgeStep(mission, judge.current, sample, context)
          const next = shownOf(judge.current)
          setShown((last) => (sameShown(last, next) ? last : next))
        },
      })
    } catch {
      queueMicrotask(() => setFailure(true))
    }
    return () => stop?.()
  }, [failure, track, mission, context, setup, touchSource, autopiloted, engine])

  const earned = shown.done ? starsFor(stars, shown.seconds) : 0
  useEffect(() => {
    if (!shown.done || reported.current || earned === 0) return
    reported.current = true
    onResult(earned)
  }, [shown.done, earned, onResult])

  useEffect(() => {
    if (!callout) return
    const timer = window.setTimeout(() => setCallout(undefined), CALLOUT_MS)
    return () => window.clearTimeout(timer)
  }, [callout])

  const name = t(`kart.challenge.mission.${mission.id}` as KartMessageKey)
  if (failure) return <NoWebgl t={t} onList={onList} />
  const counter =
    mission.kind === 'cover'
      ? t('kart.challenge.percent', { count: shown.count, target })
      : t('kart.challenge.progress', { count: shown.count, target })
  return (
    <Page
      style={touch.shown ? touchSpace(touch.settings) : undefined}
      data-testid="kart-challenge-run"
      data-mission={mission.id}
      data-done={shown.done || undefined}
    >
      <Stage ref={stage} role="img" aria-label={t('kart.spike.canvas')} />
      <PauseLayer t={t} canPause button={false} enabled={!shown.done && !shown.failed} onRestart={onAgain} onKartMenu={onList} />
      {mission.fog && <FogCover aria-hidden="true" data-testid="kart-challenge-fog" />}
      {!engine && (
        <KartLoading
          t={t}
          track={name}
          progress={load.progress}
          failed={load.failed}
          onRetry={load.retry}
          bindings={setup.controls.bindings}
          touch={touch.shown}
        />
      )}
      <GoalPanel t={t} mission={mission} name={name} stars={stars}>
        <Count data-testid="kart-challenge-count">{counter}</Count>
      </GoalPanel>
      <Actions>
        <Button type="button" $size="sm" $variant="secondary" onClick={onAgain} data-testid="kart-challenge-restart">
          {t('kart.challenge.restart')}
        </Button>
        <Button type="button" $size="sm" $variant="secondary" onClick={onList} data-testid="kart-challenge-list">
          {t('kart.challenge.toList')}
        </Button>
      </Actions>
      {trial && (
        <ClockCorner $touch={touch.shown}>
          <RaceClock ref={clock} t={t} trial={trial} />
        </ClockCorner>
      )}
      {hud.boosting && <BoostVeil aria-hidden="true" />}
      {callout && <CalloutText key={`callout-${callout.id}`} t={t} callout={callout.callout} />}
      {trial && trial.phase !== 'finished' && !shown.done && !shown.failed && (
        <RaceCenter t={t} trial={trial} onRestart={onAgain} />
      )}
      <TouchControls t={t} touch={touch} hud={hud} maxStored={setup.controls.tuning.maxStoredBoosts} />
      <Bottom $touch={touch.shown}>
        <Hud t={t} hud={hud} maxStored={setup.controls.tuning.maxStoredBoosts} dense={touch.shown} />
      </Bottom>
      {(shown.done || shown.failed) && (
        <ResultCard
          t={t}
          name={name}
          passed={shown.done}
          stars={earned}
          lines={[
            shown.done
              ? t('kart.challenge.time', { seconds: shown.seconds.toFixed(1) })
              : t(`kart.challenge.why.${shown.why ?? 'short'}`),
          ]}
          onAgain={onAgain}
          onNext={onNext}
          onList={onList}
        />
      )}
    </Page>
  )
}

/** The mission's name, goal and rules, and how its stars are given, over the race */
function GoalPanel({
  t,
  mission,
  name,
  stars,
  children,
}: {
  t: KartT
  mission: Mission
  name: string
  stars: { three: number; two: number }
  children?: ReactNode
}) {
  const [goal, ...rules] = goalLines(t, mission)
  return (
    <Panel aria-labelledby="kart-challenge-name">
      <Tag>
        {t(`kart.challenge.chapter.${mission.chapter}`)} · {trackName(t, mission.track)} ·{' '}
        {lapsText(t, mission.laps)}
      </Tag>
      <PanelName id="kart-challenge-name">{name}</PanelName>
      <Goal>{goal}</Goal>
      {rules.length > 0 && (
        <Rules>
          {rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </Rules>
      )}
      {children}
      <StarsBy>{t('kart.challenge.starsBy', { three: stars.three, two: stars.two })}</StarsBy>
    </Panel>
  )
}

function ResultCard({
  t,
  name,
  passed,
  stars,
  lines,
  onAgain,
  onNext,
  onList,
}: {
  t: KartT
  name: string
  passed: boolean
  stars: number
  lines: readonly string[]
  onAgain: () => void
  onNext: (() => void) | null
  onList: () => void
}) {
  return (
    <Result role="dialog" aria-labelledby="kart-challenge-result" data-testid="kart-challenge-result" data-passed={passed}>
      <ResultTitle id="kart-challenge-result" $passed={passed}>
        {t(passed ? 'kart.challenge.passed' : 'kart.challenge.failed')}
      </ResultTitle>
      <ResultName>{name}</ResultName>
      {passed && (
        <BigStars>
          <StarRow t={t} stars={stars} />
        </BigStars>
      )}
      {lines.map((line) => (
        <ResultLine key={line} data-testid="kart-challenge-result-line">
          {line}
        </ResultLine>
      ))}
      <ResultActions>
        {passed && onNext && (
          <Button type="button" autoFocus onClick={onNext} data-testid="kart-challenge-next">
            {t('kart.challenge.next')}
          </Button>
        )}
        <Button
          type="button"
          autoFocus={!passed || !onNext}
          $variant={passed && onNext ? 'secondary' : 'primary'}
          onClick={onAgain}
          data-testid="kart-challenge-again"
        >
          {t('kart.challenge.again')}
        </Button>
        <Button type="button" $variant="secondary" onClick={onList} data-testid="kart-challenge-to-list">
          {t('kart.challenge.toList')}
        </Button>
      </ResultActions>
    </Result>
  )
}

function NoWebgl({ t, onList }: { t: KartT; onList: () => void }) {
  return (
    <MenuPage>
      <MenuCard>
        <Title>{t('kart.challenge.title')}</Title>
        <p role="alert">{t('kart.spike.noWebgl')}</p>
        <Button type="button" onClick={onList}>
          {t('kart.challenge.toList')}
        </Button>
      </MenuCard>
    </MenuPage>
  )
}

// ── A mission against the computer ────────────────────────────────────────────────────────────

function MissionRace({ mission, onResult, onAgain, onNext, onList }: RunProps) {
  const t: KartT = useT()
  const stars = useMemo(() => missionStars(mission), [mission])
  const [game] = useState(() => {
    const seed = Math.floor(Math.random() * 2 ** 31)
    const entries = drawBots(mission.bots?.count ?? 1, seed)
    // The player starts at the back of the grid, the bots ahead
    const playerSeat = entries.length
    const room = createLocalRoom({
      seats: entries.length + 1,
      options: { track: mission.track, laps: mission.laps, mode: 'race', teams: 'solo' },
      seed,
      now: () => raceEpochNow(),
    })
    return { seed, entries, playerSeat, room, realtime: room.realtimeFor(playerSeat) }
  })
  const [view, setView] = useState(() => game.room.view(game.playerSeat))
  const [verdict, setVerdict] = useState<RaceVerdict>(() =>
    judgeRace(mission, game.room.state().racers, game.playerSeat),
  )
  const [broken, setBroken] = useState<FailReason | null>(null)
  const resets = useRef(0)
  const tuning = useMemo(() => applyKart(KART_TUNING, loadBody()), [])
  const reported = useRef(false)

  useEffect(() => {
    const track: Track = missionTrack(mission.track)
    const show = () => {
      setView(game.room.view(game.playerSeat))
      const next = judgeRace(mission, game.room.state().racers, game.playerSeat)
      setVerdict((last) =>
        last.done === next.done &&
        last.failed === next.failed &&
        last.out.join() === next.out.join() &&
        last.place === next.place
          ? last
          : next,
      )
    }
    const stopWatching = game.room.onChange(show)
    const race = createBotRace({
      room: game.room,
      track,
      laps: mission.laps,
      bots: botSeats(game.entries, 0, mission.bots?.difficulty ?? 'normal'),
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
  }, [game, mission])

  const onStep = useMemo(
    () => (step: SpikeStep) => {
      if (!step.trial) return
      const why = ruleBroken(
        mission,
        {
          before: step.before,
          after: step.after,
          hit: step.hit,
          hitBefore: step.hitBefore,
          resets: step.trial.run.resets,
          phase: step.trial.phase,
        },
        resets.current,
        tuning,
      )
      resets.current = step.trial.run.resets
      if (why) setBroken((last) => last ?? why)
    },
    [mission, tuning],
  )

  const nameOf = useMemo(() => {
    const you = readNickname() ?? t('kart.bots.you')
    return (seat: number): string => {
      if (seat === game.playerSeat) return you
      const entry = game.entries[seat]
      return entry ? t('kart.bots.tag', { name: t(`kart.bots.name.${entry.name}`) }) : you
    }
  }, [game, t])
  const act = useMemo(
    () => (action: JsonValue) => game.room.act(action as KartAction, game.playerSeat),
    [game],
  )

  const failedWhy: FailReason | null = broken ?? (verdict.failed ? verdict.why : null)
  const passed = !failedWhy && verdict.done
  const seconds = verdict.seconds ?? 0
  const earned = passed ? starsFor(stars, seconds) : 0
  useEffect(() => {
    if (!passed || reported.current || earned === 0) return
    reported.current = true
    onResult(earned)
  }, [passed, earned, onResult])

  const name = t(`kart.challenge.mission.${mission.id}` as KartMessageKey)
  const lines = passed
    ? [
        t('kart.challenge.place', { place: verdict.place ?? 1 }),
        formatTime(seconds),
      ]
    : failedWhy
      ? [t(`kart.challenge.why.${failedWhy}`)]
      : []
  return (
    <>
      <RaceView
        view={view}
        realtime={game.realtime}
        act={act}
        nameOf={nameOf}
        lookOf={(seat) => game.entries[seat] ?? null}
        onStep={onStep}
        pause={{ canPause: true, onRestart: onAgain, onKartMenu: onList }}
      />
      <RaceGoal data-testid="kart-challenge-race" data-mission={mission.id}>
        <GoalPanel t={t} mission={mission} name={name} stars={stars}>
          {mission.kind === 'elimination' && (
            <OutLine data-testid="kart-challenge-out">
              {verdict.out.length > 0
                ? t('kart.challenge.out', { names: verdict.out.map(nameOf).join(', ') })
                : t('kart.challenge.outNone')}
            </OutLine>
          )}
        </GoalPanel>
      </RaceGoal>
      {(passed || failedWhy) && (
        <ResultLayer>
          <ResultCard
            t={t}
            name={name}
            passed={passed}
            stars={earned}
            lines={lines}
            onAgain={onAgain}
            onNext={onNext}
            onList={onList}
          />
        </ResultLayer>
      )}
    </>
  )
}

// ── The time trial for a medal ────────────────────────────────────────────────────────────────

function MedalScreen({
  track: trackId,
  progress,
  onResult,
  onAgain,
  onList,
}: {
  track: string
  progress: ChallengeProgress
  onResult: (seconds: number, medal: MedalId | null) => void
  onAgain: () => void
  onList: () => void
}) {
  const t: KartT = useT()
  const stage = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState(() => !supportsWebGL2())
  const [hud, setHud] = useState<SpikeHud>(EMPTY_HUD)
  const [trial, setTrial] = useState<SpikeTrial>()
  const [callout, setCallout] = useState<{ callout: Callout; id: number }>()
  const clock = useRef<RaceClockHandle>(null)
  const touch = useTouchControls()
  const touchSource = touch.source
  const setup = useRunSetup(undefined)
  const track = useMemo(() => missionTrack(trackId), [trackId])
  const times = medalTimes(trackId)
  const had = progress.medals[trackId]
  // The medal to race beside: the next one to win, by default
  const [aim, setAim] = useState<MedalId | null>(() => nextMedal(had) ?? 'platinum')
  const [started, setStarted] = useState(false)
  const [ghost, setGhost] = useState<Ghost | null | undefined>(undefined)
  const [autopiloted] = useState(autopilotAsked)
  const reported = useRef(false)
  const [result, setResult] = useState<{ seconds: number; medal: MedalId | null } | null>(null)
  const load = useKartLoad(
    started ? { engine: RACE_ENGINE, track, bodies: [setup.body], music: true } : null,
    `${track.id}|${setup.body}|${started}`,
  )
  const engine = load.engine
  const name = trackName(t, trackId)

  // The target's ghost, worked out once the race is asked for: the master's line at the medal's pace
  useEffect(() => {
    if (!started || ghost !== undefined) return
    const timer = window.setTimeout(() => {
      if (!aim || !times) {
        setGhost(null)
        return
      }
      setGhost(
        targetGhost(track, times[aim], (one, tuning) => createDriver(DRIVERS.master, one, tuning, 7)),
      )
    }, 0)
    return () => window.clearTimeout(timer)
  }, [started, ghost, aim, times, track])

  useEffect(() => {
    if (!started || ghost === undefined || !stage.current || failure || !engine) return
    let stop: (() => void) | undefined
    try {
      stop = engine.startSpikeLoop(stage.current, {
        controls: () => setup.controls,
        onStats: () => {},
        onHud: setHud,
        onCallout: (next) => setCallout((last) => ({ callout: next, id: (last?.id ?? 0) + 1 })),
        onContextLost: () => setFailure(true),
        track,
        quality: setup.quality,
        body: setup.body,
        driver: setup.driver,
        ghost,
        onTrial: setTrial,
        onClock: (total, lap) => clock.current?.set(total, lap),
        touch: touchSource,
        ...(autopiloted
          ? { autopilot: createDriver(DRIVERS.master, track, setup.controls.tuning, 7) }
          : {}),
      })
    } catch {
      queueMicrotask(() => setFailure(true))
    }
    return () => stop?.()
  }, [started, ghost, failure, track, setup, touchSource, autopiloted, engine])

  const total = trial?.phase === 'finished' ? trial.total : null
  useEffect(() => {
    if (total === null || reported.current || !times) return
    reported.current = true
    const medal = medalFor(times, total)
    setResult({ seconds: total, medal })
    onResult(total, medal)
  }, [total, times, onResult])

  useEffect(() => {
    if (!callout) return
    const timer = window.setTimeout(() => setCallout(undefined), CALLOUT_MS)
    return () => window.clearTimeout(timer)
  }, [callout])

  if (failure) return <NoWebgl t={t} onList={onList} />
  if (!started || !times) {
    const goldWon = had === 'gold' || had === 'platinum'
    const choices = MEDAL_IDS.filter((medal) => medal !== 'platinum' || goldWon)
    return (
      <MenuPage data-testid="kart-challenge-medal-setup">
        <MenuCard>
          <Title>{name}</Title>
          <MedalBadge t={t} medal={had} />
          <Intro>{t('kart.challenge.medals.intro')}</Intro>
          {times && (
            <Targets>
              {MEDAL_IDS.map((medal) => {
                const hidden = medal === 'platinum' && !goldWon
                return (
                  <Target key={medal} $medal={medal}>
                    <span>{t(hidden ? 'kart.challenge.medal.hidden' : `kart.challenge.medal.${medal}`)}</span>
                    <span>{hidden ? '—' : formatTime(times[medal])}</span>
                  </Target>
                )
              })}
            </Targets>
          )}
          <Field>
            <span>{t('kart.challenge.medals.ghost')}</span>
            <select
              value={aim ?? 'off'}
              onChange={(event) =>
                setAim(event.target.value === 'off' ? null : (event.target.value as MedalId))
              }
              data-testid="kart-challenge-ghost"
            >
              <option value="off">{t('kart.challenge.medals.ghostOff')}</option>
              {choices.map((medal) => (
                <option key={medal} value={medal}>
                  {t('kart.challenge.medals.ghostOf', { medal: t(`kart.challenge.medal.${medal}`) })}
                </option>
              ))}
            </select>
          </Field>
          <ResultActions>
            <Button type="button" onClick={() => setStarted(true)} data-testid="kart-challenge-medal-start">
              {t('kart.challenge.medals.go')}
            </Button>
            <Button type="button" $variant="secondary" onClick={onList}>
              {t('kart.challenge.toList')}
            </Button>
          </ResultActions>
        </MenuCard>
      </MenuPage>
    )
  }
  const after = result ? nextMedal(betterMedal(had, result.medal)) : null
  return (
    <Page
      style={touch.shown ? touchSpace(touch.settings) : undefined}
      data-testid="kart-challenge-medal-run"
      data-track={trackId}
    >
      <Stage ref={stage} role="img" aria-label={t('kart.spike.canvas')} />
      <PauseLayer t={t} canPause button={false} enabled={!result} onRestart={onAgain} onKartMenu={onList} />
      {(!engine || ghost === undefined) && (
        <KartLoading
          t={t}
          track={name}
          progress={load.progress}
          failed={load.failed}
          onRetry={load.retry}
          bindings={setup.controls.bindings}
          touch={touch.shown}
          {...(ghost === undefined ? { note: t('kart.challenge.medals.preparing') } : {})}
        />
      )}
      <Panel>
        <Tag>{t('kart.challenge.tab.medals')}</Tag>
        <PanelName>{name}</PanelName>
        <Targets>
          {MEDAL_IDS.filter((medal) => medal !== 'platinum' || had === 'gold' || had === 'platinum').map(
            (medal) => (
              <Target key={medal} $medal={medal}>
                <span>{t(`kart.challenge.medal.${medal}`)}</span>
                <span>{formatTime(times[medal])}</span>
              </Target>
            ),
          )}
        </Targets>
      </Panel>
      <Actions>
        <Button type="button" $size="sm" $variant="secondary" onClick={onAgain}>
          {t('kart.challenge.restart')}
        </Button>
        <Button type="button" $size="sm" $variant="secondary" onClick={onList}>
          {t('kart.challenge.toList')}
        </Button>
      </Actions>
      {trial && (
        <ClockCorner $touch={touch.shown}>
          <RaceClock ref={clock} t={t} trial={trial} />
        </ClockCorner>
      )}
      {hud.boosting && <BoostVeil aria-hidden="true" />}
      {callout && <CalloutText key={`callout-${callout.id}`} t={t} callout={callout.callout} />}
      {trial && trial.phase !== 'finished' && <RaceCenter t={t} trial={trial} onRestart={onAgain} />}
      <TouchControls t={t} touch={touch} hud={hud} maxStored={setup.controls.tuning.maxStoredBoosts} />
      <Bottom $touch={touch.shown}>
        <Hud t={t} hud={hud} maxStored={setup.controls.tuning.maxStoredBoosts} dense={touch.shown} />
      </Bottom>
      {result && (
        <Result role="dialog" aria-labelledby="kart-challenge-medal-result" data-testid="kart-challenge-medal-result">
          <ResultTitle id="kart-challenge-medal-result" $passed={result.medal !== null}>
            {result.medal
              ? t('kart.challenge.medals.won', { medal: t(`kart.challenge.medal.${result.medal}`) })
              : t('kart.challenge.medals.missed')}
          </ResultTitle>
          <ResultName>{name}</ResultName>
          <ResultLine>{formatTime(result.seconds)}</ResultLine>
          <ResultLine>
            {after
              ? t('kart.challenge.medals.next', {
                  medal: t(`kart.challenge.medal.${after}`),
                  time: formatTime(times[after]),
                })
              : t('kart.challenge.medals.allWon')}
          </ResultLine>
          <ResultActions>
            <Button type="button" autoFocus onClick={onAgain}>
              {t('kart.challenge.again')}
            </Button>
            <Button type="button" $variant="secondary" onClick={onList}>
              {t('kart.challenge.toList')}
            </Button>
          </ResultActions>
        </Result>
      )}
    </Page>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────────────────

const medalColor = (medal: MedalId | null) =>
  medal === 'gold'
    ? color.warning
    : medal === 'platinum'
      ? color.accent
      : medal === 'silver'
        ? color.text
        : medal === 'bronze'
          ? color.danger
          : color.muted

const MenuPage = styled.main`
  position: fixed;
  inset: 0;
  display: grid;
  place-items: start center;
  padding: ${space.lg}px ${space.md}px;
  overflow-y: auto;
  background: ${color.bg};
`

const MenuCard = styled.section`
  ${broadcast}
  display: grid;
  gap: ${space.md}px;
  justify-items: start;
  width: min(760px, 100%);
  padding: ${space.lg}px;
  color: ${color.text};
`

const Title = styled.h1`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
`

const Intro = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Tabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Total = styled.p`
  ${ticker(color.accent)}
  margin: 0;
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  font-weight: 700;
`

const Chapter = styled.section`
  display: grid;
  gap: ${space.xs}px;
  width: 100%;
`

const ChapterHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${space.sm}px;
`

const ChapterName = styled.h2`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const ChapterNote = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const List = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Row = styled.li<{ $locked: boolean }>`
  display: grid;
  grid-template-columns: 2em minmax(0, 1fr) auto auto;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.xs}px ${space.sm}px;
  background: ${color.raised};
  opacity: ${({ $locked }) => ($locked ? 0.55 : 1)};

  @media (max-width: 520px) {
    grid-template-columns: 2em minmax(0, 1fr) auto;

    & > button {
      grid-column: 2 / -1;
      justify-self: start;
    }
  }
`

const Number = styled.span`
  ${displayType}
  color: ${color.muted};
  font-size: ${fontSize.lg}px;
`

const RowText = styled.span`
  display: grid;
  min-width: 0;
`

const RowName = styled.span`
  font-weight: 700;
`

const RowGoal = styled.span`
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

const RowMeta = styled.span`
  color: ${color.muted};
  font-size: 12px;
`

const Stars = styled.span`
  display: inline-flex;
  gap: 2px;
  white-space: nowrap;
`

const Star = styled.span<{ $on: boolean }>`
  color: ${({ $on }) => ($on ? color.warning : color.border)};
  font-size: ${fontSize.lg}px;
  line-height: 1;
`

const Wall = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: ${space.sm}px;
  width: 100%;
`

const Plaque = styled.article`
  display: grid;
  gap: ${space.xs}px;
  align-content: start;
  justify-items: start;
  padding: ${space.sm}px;
  background: ${color.raised};
`

const PlaqueHead = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${space.xs}px;
  width: 100%;
`

const Badge = styled.span<{ $medal: MedalId | null }>`
  ${displayType}
  padding: 0 ${space.xs}px;
  border: 2px solid ${({ $medal }) => medalColor($medal)};
  color: ${({ $medal }) => medalColor($medal)};
  font-size: 12px;
  text-transform: uppercase;
  white-space: nowrap;
`

const Targets = styled.ul`
  display: grid;
  gap: 2px;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: ${fontSize.sm}px;
`

const Target = styled.li<{ $medal: MedalId }>`
  display: flex;
  justify-content: space-between;
  gap: ${space.sm}px;
  border-left: 3px solid ${({ $medal }) => medalColor($medal)};
  padding-left: ${space.xs}px;
  font-variant-numeric: tabular-nums;
`

const Field = styled.label`
  display: grid;
  gap: ${space.xs}px;
  font-weight: 700;

  select {
    min-height: 40px;
    padding: 0 ${space.sm}px;
    border: 1px solid ${color.border};
    background: ${color.surface};
    color: ${color.text};
    font: inherit;
  }
`

const Page = styled.main`
  position: fixed;
  inset: 0;
  overflow: hidden;
`

const Stage = styled.div`
  position: absolute;
  inset: 0;
  touch-action: none;
`

// Steady sea fog over the whole race: only a small window ahead of the kart stays clear
const FogCover = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(
    ellipse 34% 26% at 50% 66%,
    color-mix(in srgb, ${color.surface} 10%, transparent) 0%,
    color-mix(in srgb, ${color.surface} 70%, transparent) 62%,
    color-mix(in srgb, ${color.surface} 92%, transparent) 100%
  );
  backdrop-filter: blur(1.5px);
`

const Panel = styled.section`
  ${broadcast}
  position: absolute;
  z-index: 1;
  top: ${space.sm}px;
  left: ${space.sm}px;
  display: grid;
  gap: 2px;
  width: min(360px, calc(100% - 240px));
  max-height: calc(100dvh - 200px);
  overflow-y: auto;
  padding: ${space.sm}px ${space.md}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;

  @media ${KART_COMPACT} {
    width: min(300px, calc(100% - 140px));
  }
`

// The race against the computer's screen has the place top left: the goal goes under it
const RaceGoal = styled.div`
  position: fixed;
  z-index: 21;
  top: 64px;
  left: 0;
  pointer-events: none;

  & > section {
    pointer-events: auto;
    position: relative;
    width: min(320px, calc(100vw - 32px));
  }
`

const Tag = styled.span`
  color: ${color.muted};
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
`

const PanelName = styled.h1`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const Goal = styled.p`
  margin: 0;
  font-weight: 700;
`

const Rules = styled.ul`
  margin: 0;
  padding-left: 1.2em;
`

const Count = styled.p`
  ${displayType}
  margin: 0;
  color: ${color.accent};
  font-size: ${fontSize.xl}px;
`

const OutLine = styled.p`
  margin: 0;
  color: ${color.warning};
  font-weight: 700;
`

const StarsBy = styled.span`
  display: block;
  margin-top: ${space.xs}px;
  color: ${color.muted};
  font-size: 12px;
`

const Actions = styled.div`
  position: absolute;
  z-index: 1;
  top: ${space.sm}px;
  right: ${space.sm}px;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: ${space.xs}px;
  max-width: 220px;

  @media ${KART_COMPACT} {
    flex-wrap: nowrap;
    max-width: none;
  }
`

const ClockCorner = styled.div<{ $touch: boolean }>`
  position: absolute;
  top: 120px;
  right: ${space.sm}px;
  pointer-events: none;

  ${({ $touch }) =>
    $touch &&
    css`
      @media (max-height: 500px) {
        top: ${space.sm}px;
        right: auto;
        left: 50%;
        translate: -50% 0;
      }
    `}
`

const Bottom = styled.div<{ $touch: boolean }>`
  position: absolute;
  bottom: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;

  ${({ $touch }) => $touch && touchBottom}
`

const ResultLayer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 22;
`

const Result = styled.section`
  ${broadcastSolid}
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  display: grid;
  gap: ${space.sm}px;
  justify-items: center;
  width: min(420px, calc(100% - ${2 * space.lg}px));
  max-height: calc(100dvh - ${2 * space.lg}px);
  overflow-y: auto;
  padding: ${space.lg}px;
  color: ${color.text};
  text-align: center;
`

const ResultTitle = styled.h2<{ $passed: boolean }>`
  ${displayType}
  ${slam()}
  margin: 0;
  color: ${({ $passed }) => ($passed ? color.success : color.warning)};
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
`

const ResultName = styled.p`
  margin: 0;
  color: ${color.muted};
  font-weight: 700;
`

const BigStars = styled.div`
  span {
    font-size: 40px;
  }
`

const ResultLine = styled.p`
  margin: 0;
`

const ResultActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${space.sm}px;
`

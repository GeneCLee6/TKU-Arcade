// 2026-11-20 (owner: "keep going"; docs/ARCHITECTURE.md §4.50, docs/KART-FEEL.md §17): the driving
// school, its own lazy chunk, opened from /kart's menu (or /kart?school, ?school=<lesson>). Ten
// lessons, one technique each (lessons.ts), each driven in the time trial's own loop (spikeLoop.ts)
// on a short track of its own or the first stretch of a race track. The page shows the goal, the
// help of the moment with the player's own controls, and, when a try goes wrong, why (judge.ts);
// a lesson can be started over or skipped, and a pass earns one to three stars, kept in this
// browser (store.ts).
import { useEffect, useMemo, useRef, useState } from 'react'
import styled, { css, keyframes } from 'styled-components'
import { applyKart } from '../../../shared/kart/karts.ts'
import { KART_MESSAGES, type KartMessageKey } from '../../../shared/kart/i18n.ts'
import {
  DEFAULT_RULES,
  KART_TUNING,
  STEP_SECONDS,
  type KartInput,
  type KartState,
} from '../../../shared/kart/physics.ts'
import { formatTime, type Trial } from '../../../shared/kart/timeTrial.ts'
import { Button } from '../../components/Button.tsx'
import { registerMessages, type MessageParams } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { useMenuMusic } from '../audio/useMenuMusic.ts'
import { loadBody, loadDriver } from '../bodies.ts'
import { createDriver, DRIVERS } from '../bots/drivers.ts'
import type { Callout } from '../callouts.ts'
import { loadBindings } from '../devices.ts'
import { BoostVeil, CalloutText, Hud } from '../Hud.tsx'
import { KART_COMPACT } from '../layout.ts'
import { loadQuality } from '../quality.ts'
import { RaceCenter, RaceClock, type RaceClockHandle } from '../RaceOverlay.tsx'
import { supportsWebGL2 } from '../webgl.ts'
import type { SpikeHud, SpikeTrial } from '../spikeLoop.ts'
import { RACE_ENGINE } from '../load/kartLoad.ts'
import { KartLoading } from '../load/KartLoading.tsx'
import { useKartLoad } from '../load/useKartLoad.ts'
import { TouchControls } from '../touch/TouchControls.tsx'
import { touchBottom, touchSpace } from '../touch/touchLayout.ts'
import { useTouchControls } from '../touch/useTouchControls.ts'
import { broadcast, broadcastSolid, slam, ticker } from '../ui/broadcast.ts'
import { lessonContext } from './headless.ts'
import {
  judgeStep,
  liveHint,
  nextTry,
  sampleOf,
  starsFor,
  startJudge,
  worstNote,
  type Judge,
  type LiveHint,
  type Note,
} from './judge.ts'
import { controlLabels, useInputDevice } from './controls.ts'
import { KeyText } from './KeyText.tsx'
import {
  isLessonId,
  LESSON_IDS,
  LESSONS,
  nextLesson,
  type Lesson,
  type LessonId,
} from './lessons.ts'
import {
  firstOpen,
  loadProgress,
  saveResult,
  totalStars,
  type Progress,
} from './store.ts'
import { schoolTrack } from '../../../shared/kart/tracks/school.ts'

registerMessages(KART_MESSAGES)

type KartT = (key: KartMessageKey, params?: MessageParams) => string

const EMPTY_HUD: SpikeHud = { speed: 0, gauge: 0, storedBoosts: 0, boosting: false, chain: 0, hits: 0 }

/** A try that went wrong: its note stays up this long before the run starts again, ms */
const RETRY_MS = 1800
/** A callout's moment on the screen, as on the other race screens */
const CALLOUT_MS = 900

/** The lesson the address asks for (?school=<lesson>), if any */
function askedLesson(): LessonId | null {
  const asked = new URLSearchParams(window.location.search).get('school')
  return isLessonId(asked) ? asked : null
}

export interface SchoolViewProps {
  /** Back to /kart's menu */
  readonly onExit: () => void
}

export default function SchoolView({ onExit }: SchoolViewProps) {
  const [lesson, setLesson] = useState<LessonId | null>(askedLesson)
  const [progress, setProgress] = useState<Progress>(loadProgress)
  // A lesson started again is a new run of it
  const [round, setRound] = useState(0)
  const open = (id: LessonId | null) => {
    const url = new URL(window.location.href)
    url.searchParams.set('school', id ?? '')
    window.history.replaceState(null, '', url)
    setRound((n) => n + 1)
    setLesson(id)
  }
  if (!lesson) {
    return <SchoolMenu progress={progress} onLesson={open} onExit={onExit} />
  }
  return (
    <LessonScreen
      key={`${lesson}-${round}`}
      id={lesson}
      onResult={(stars) => setProgress(saveResult(lesson, stars))}
      onAgain={() => open(lesson)}
      onNext={() => open(nextLesson(lesson))}
      onList={() => open(null)}
      onExit={onExit}
    />
  )
}

// ── The list of lessons ─────────────────────────────────────────────────────────────────────

function StarRow({ t, stars }: { t: KartT; stars: number }) {
  return (
    <Stars role="img" aria-label={t('kart.school.stars', { stars })} data-stars={stars}>
      {[1, 2, 3].map((n) => (
        <Star key={n} $on={n <= stars} aria-hidden="true">
          ★
        </Star>
      ))}
    </Stars>
  )
}

function SchoolMenu({
  progress,
  onLesson,
  onExit,
}: {
  progress: Progress
  onLesson: (id: LessonId) => void
  onExit: () => void
}) {
  const t: KartT = useT()
  useMenuMusic()
  const suggested = firstOpen(progress)
  return (
    <MenuPage data-testid="kart-school">
      <MenuCard>
        <Title>{t('kart.school.title')}</Title>
        <Intro>{t('kart.school.intro')}</Intro>
        <Total data-testid="kart-school-total">
          {t('kart.school.total', { stars: totalStars(progress), most: LESSON_IDS.length * 3 })}
        </Total>
        <List>
          {LESSON_IDS.map((id, index) => {
            const result = progress[id]
            return (
              <Row key={id} $next={id === suggested} data-testid={`kart-school-lesson-${id}`}>
                <Number>{index + 1}</Number>
                <RowText>
                  <RowName>{t(`kart.school.lesson.${id}`)}</RowName>
                  <RowGoal>
                    {t(`kart.school.goal.${id}`, {
                      target: LESSONS[id].target,
                      limit: LESSONS[id].limit ?? 0,
                    })}
                  </RowGoal>
                </RowText>
                {result === 0 ? (
                  <Skipped>{t('kart.school.skipped')}</Skipped>
                ) : (
                  <StarRow t={t} stars={result ?? 0} />
                )}
                <Button
                  type="button"
                  $size="sm"
                  $variant={id === suggested ? 'primary' : 'secondary'}
                  onClick={() => onLesson(id)}
                  aria-label={`${t('kart.school.start')}: ${t(`kart.school.lesson.${id}`)}`}
                  data-testid={`kart-school-start-${id}`}
                >
                  {t('kart.school.start')}
                </Button>
              </Row>
            )
          })}
        </List>
        <Button type="button" $variant="secondary" onClick={onExit} data-testid="kart-school-exit">
          {t('kart.school.back')}
        </Button>
      </MenuCard>
    </MenuPage>
  )
}

// ── A lesson ────────────────────────────────────────────────────────────────────────────────

/** What the page shows of the judge: redrawn only when one of these changes */
interface Shown {
  readonly count: number
  readonly done: boolean
  readonly failed: boolean
  readonly tryOver: boolean
  readonly note: Note | null
  readonly notes: number
  readonly attempts: number
  /** Seconds from GO to the pass, the stars, and what went wrong most */
  readonly seconds: number
  readonly stars: 0 | 1 | 2 | 3
  readonly worst: Note | null
}

const shownOf = (judge: Judge, lesson: Lesson): Shown => ({
  count: judge.count,
  done: judge.done,
  failed: judge.failed,
  tryOver: judge.tryOver,
  note: judge.note,
  notes: judge.notes,
  attempts: judge.attempts,
  seconds: (judge.doneAt ?? 0) * STEP_SECONDS,
  stars: starsFor(lesson, judge),
  worst: judge.failed ? worstNote(judge) : null,
})

const sameShown = (a: Shown, b: Shown) =>
  a.count === b.count &&
  a.done === b.done &&
  a.failed === b.failed &&
  a.tryOver === b.tryOver &&
  a.notes === b.notes &&
  a.attempts === b.attempts &&
  a.stars === b.stars

function LessonScreen({
  id,
  onResult,
  onAgain,
  onNext,
  onList,
  onExit,
}: {
  id: LessonId
  onResult: (stars: 0 | 1 | 2 | 3) => void
  onAgain: () => void
  onNext: () => void
  onList: () => void
  onExit: () => void
}) {
  const t: KartT = useT()
  const lesson = LESSONS[id]
  const number = LESSON_IDS.indexOf(id) + 1
  const stage = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState(() => !supportsWebGL2())
  const [hud, setHud] = useState<SpikeHud>(EMPTY_HUD)
  const [trial, setTrial] = useState<SpikeTrial>()
  const [callout, setCallout] = useState<{ callout: Callout; id: number }>()
  const [live, setLive] = useState<LiveHint | null>(null)
  const clock = useRef<RaceClockHandle>(null)
  const race = useRef<{ restart: () => void } | null>(null)
  const touch = useTouchControls()
  const touchSource = touch.source
  const device = useInputDevice(touch.shown)
  const [setup] = useState(() => {
    const body = loadBody()
    // The school teaches the classic feel as it stands, whatever the tuning panel was set to; the
    // kart picked on /kart is the one driven
    return {
      body,
      driver: loadDriver(),
      quality: loadQuality(),
      controls: {
        bindings: loadBindings(),
        rules: { ...DEFAULT_RULES, autoBoost: false, chainBoosts: true },
        tuning: applyKart(KART_TUNING, body),
        enabled: true,
      },
    }
  })
  const track = useMemo(() => schoolTrack(lesson.track), [lesson.track])
  const context = useMemo(
    () => lessonContext(id, track, setup.controls.tuning),
    [id, track, setup.controls.tuning],
  )
  // Testing (the browser tests) and showing a lesson: `?autopilot` drives with the master's hands
  const [autopiloted] = useState(() => new URLSearchParams(window.location.search).has('autopilot'))
  const judge = useRef<Judge>(startJudge())
  const [shown, setShown] = useState<Shown>(() => shownOf(startJudge(), lesson))
  const liveRef = useRef<LiveHint | null>(null)
  const reported = useRef(false)
  // 2026-11-21 (§4.52): the engine and the kart, fetched before the lesson's scene is built
  const load = useKartLoad(
    { engine: RACE_ENGINE, track, bodies: [setup.body], music: true },
    `${track.id}|${setup.body}`,
  )
  const engine = load.engine

  useEffect(() => {
    if (!stage.current || failure || !engine) return
    let pilot: ((trial: Trial) => KartInput) | null = null
    const newPilot = () =>
      autopiloted ? createDriver(DRIVERS.master, track, setup.controls.tuning, 7) : null
    pilot = newPilot()
    const show = () => {
      const next = shownOf(judge.current, lesson)
      setShown((last) => (sameShown(last, next) ? last : next))
    }
    const hint = (kart: KartState, countdown: number | null) => {
      const next = judge.current.done ? null : liveHint(lesson, kart, setup.controls.tuning, countdown)
      if (next === liveRef.current) return
      liveRef.current = next
      setLive(next)
    }
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
        ghostPick: 'off',
        onTrial: setTrial,
        onClock: (total, lap) => clock.current?.set(total, lap),
        onReady: (handle) => {
          race.current = {
            restart: () => {
              pilot = newPilot()
              handle.restart()
            },
          }
        },
        touch: touchSource,
        ...(autopiloted ? { autopilot: (trial: Trial) => pilot!(trial) } : {}),
        onStep: (step) => {
          const sample = sampleOf(step)
          if (!sample) return
          judge.current = judgeStep(lesson, judge.current, sample, context)
          hint(step.after, step.trial?.phase === 'countdown' ? step.trial.countdown : null)
          show()
        },
      })
    } catch {
      queueMicrotask(() => setFailure(true))
    }
    return () => stop?.()
  }, [failure, track, lesson, context, setup, touchSource, autopiloted, engine])

  // A try that went wrong: a moment to read why, and the run starts again from the grid
  useEffect(() => {
    if (!shown.tryOver || shown.done) return
    const timer = window.setTimeout(() => {
      judge.current = nextTry(judge.current)
      setShown(shownOf(judge.current, lesson))
      race.current?.restart()
    }, RETRY_MS)
    return () => window.clearTimeout(timer)
  }, [shown.tryOver, shown.done, lesson])

  // A pass, kept once
  const { stars } = shown
  useEffect(() => {
    if (!shown.done || reported.current) return
    reported.current = true
    onResult(stars)
  }, [shown.done, stars, onResult])

  useEffect(() => {
    if (!callout) return
    const timer = window.setTimeout(() => setCallout(undefined), CALLOUT_MS)
    return () => window.clearTimeout(timer)
  }, [callout])

  const labels = controlLabels(device, setup.controls.bindings, t)
  const name = t(`kart.school.lesson.${id}`)
  const restart = () => {
    judge.current = startJudge()
    reported.current = false
    setShown(shownOf(judge.current, lesson))
    race.current?.restart()
  }
  const skip = () => {
    onResult(0)
    onNext()
  }

  if (failure) {
    return (
      <MenuPage>
        <MenuCard>
          <Title>{t('kart.school.title')}</Title>
          <p role="alert">{t('kart.spike.noWebgl')}</p>
          <Button type="button" onClick={onExit}>
            {t('kart.school.back')}
          </Button>
        </MenuCard>
      </MenuPage>
    )
  }

  const { worst, seconds: doneSeconds } = shown
  const last = nextLesson(id) === null
  return (
    <Page
      style={touch.shown ? touchSpace(touch.settings) : undefined}
      data-testid="kart-school-lesson"
      data-lesson={id}
      data-done={shown.done || undefined}
    >
      <Stage ref={stage} role="img" aria-label={t('kart.spike.canvas')} />
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
      <LessonPanel aria-labelledby="kart-school-name">
        <LessonTag>{t('kart.school.lessonNumber', { n: number })}</LessonTag>
        <LessonName id="kart-school-name">{name}</LessonName>
        <Goal>
          {t(`kart.school.goal.${id}`, { target: lesson.target, limit: lesson.limit ?? 0 })}
        </Goal>
        <Count data-testid="kart-school-count">
          {t('kart.school.progress', { count: shown.count, target: lesson.target })}
          {lesson.tries && shown.attempts > 0 && (
            <Attempt>{t('kart.school.attempt', { n: shown.attempts })}</Attempt>
          )}
        </Count>
        <How>
          <summary>{t('kart.school.how')}</summary>
          <KeyText t={t} id={`kart.school.how.${id}`} labels={labels} />
          <StarsBy>
            {t(`kart.school.starsBy.${lesson.stars.by}`, {
              three: lesson.stars.three,
              two: lesson.stars.two,
            })}
          </StarsBy>
        </How>
      </LessonPanel>
      <Actions>
        <Button type="button" $size="sm" $variant="secondary" onClick={restart} data-testid="kart-school-restart">
          {t('kart.school.restart')}
        </Button>
        <Button type="button" $size="sm" $variant="secondary" onClick={skip} data-testid="kart-school-skip">
          {t('kart.school.skip')}
        </Button>
        <Button type="button" $size="sm" $variant="secondary" onClick={onList} data-testid="kart-school-list">
          {t('kart.school.toList')}
        </Button>
      </Actions>
      {id === 'final' && trial && (
        <ClockCorner $touch={touch.shown}>
          <RaceClock ref={clock} t={t} trial={trial} />
        </ClockCorner>
      )}
      {hud.boosting && <BoostVeil aria-hidden="true" />}
      {callout && <CalloutText key={`callout-${callout.id}`} t={t} callout={callout.callout} />}
      {trial && trial.phase !== 'finished' && !shown.done && (
        <RaceCenter t={t} trial={trial} onRestart={restart} />
      )}
      {!shown.done && !shown.failed && (
        <Prompts>
          {live && (
            <Live data-testid="kart-school-live" data-hint={live}>
              <KeyText t={t} id={`kart.school.live.${live}`} labels={labels} />
            </Live>
          )}
          {shown.note && (
            <NoteLine
              key={`note-${shown.notes}`}
              role="status"
              data-testid="kart-school-note"
              data-note={shown.note}
            >
              <KeyText t={t} id={`kart.school.note.${shown.note}`} labels={labels} />
            </NoteLine>
          )}
        </Prompts>
      )}
      <TouchControls t={t} touch={touch} />
      <Bottom $touch={touch.shown}>
        <Hud t={t} hud={hud} maxStored={setup.controls.tuning.maxStoredBoosts} dense={touch.shown} />
      </Bottom>
      {(shown.done || shown.failed) && (
        <Result role="dialog" aria-labelledby="kart-school-result" data-testid="kart-school-result">
          <ResultTitle id="kart-school-result" $passed={shown.done}>
            {t(shown.done ? 'kart.school.passed' : 'kart.school.notYet')}
          </ResultTitle>
          <ResultName>{name}</ResultName>
          {shown.done ? (
            <>
              <BigStars>
                <StarRow t={t} stars={stars} />
              </BigStars>
              {lesson.stars.by === 'seconds' && (
                <ResultLine>
                  {id === 'final'
                    ? formatTime(doneSeconds)
                    : t('kart.school.time', { seconds: doneSeconds.toFixed(1) })}
                </ResultLine>
              )}
              {last && <ResultLine>{t('kart.school.allDone')}</ResultLine>}
            </>
          ) : (
            worst && (
              <ResultLine data-testid="kart-school-worst">
                <KeyText
                  t={t}
                  id="kart.school.mostly"
                  params={{ note: t(`kart.school.note.${worst}`) }}
                  labels={labels}
                />
              </ResultLine>
            )
          )}
          <ResultActions>
            {shown.done && (
              <Button
                type="button"
                autoFocus
                onClick={last ? onExit : onNext}
                data-testid="kart-school-next"
              >
                {t(last ? 'kart.school.toRace' : 'kart.school.next')}
              </Button>
            )}
            <Button
              type="button"
              autoFocus={!shown.done}
              $variant={shown.done ? 'secondary' : 'primary'}
              onClick={onAgain}
              data-testid="kart-school-again"
            >
              {t('kart.school.again')}
            </Button>
            {!shown.done && !last && (
              <Button type="button" $variant="secondary" onClick={skip}>
                {t('kart.school.skip')}
              </Button>
            )}
            <Button type="button" $variant="secondary" onClick={onList}>
              {t('kart.school.toList')}
            </Button>
          </ResultActions>
        </Result>
      )}
    </Page>
  )
}

// ── Styles ──────────────────────────────────────────────────────────────────────────────────

const MenuPage = styled.main`
  position: fixed;
  inset: 0;
  display: grid;
  place-items: start center;
  padding: ${space.lg}px;
  overflow-y: auto;
  background: ${color.bg};
`

const MenuCard = styled.section`
  ${broadcast}
  display: grid;
  gap: ${space.md}px;
  justify-items: start;
  width: min(720px, 100%);
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

const Total = styled.p`
  ${ticker(color.accent)}
  margin: 0;
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  font-weight: 700;
`

const List = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Row = styled.li<{ $next: boolean }>`
  display: grid;
  grid-template-columns: 2em minmax(0, 1fr) auto auto;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.xs}px ${space.sm}px;
  background: ${({ $next }) => ($next ? color.raisedHover : color.raised)};
  box-shadow: ${({ $next }) => ($next ? `inset 3px 0 0 ${color.accent}` : 'none')};

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
`

const RowName = styled.span`
  font-weight: 700;
`

const RowGoal = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Skipped = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
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

const LessonPanel = styled.section`
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

const LessonTag = styled.span`
  color: ${color.muted};
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
`

const LessonName = styled.h1`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const Goal = styled.p`
  margin: 0;
  font-weight: 700;
`

const Count = styled.p`
  ${displayType}
  display: flex;
  align-items: baseline;
  gap: ${space.sm}px;
  margin: 0;
  color: ${color.accent};
  font-size: ${fontSize.xl}px;
`

const Attempt = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const How = styled.details`
  summary {
    cursor: pointer;
    color: ${color.muted};
  }
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

  /* A phone held sideways: one row along the top, clear of the touch buttons under it */
  @media ${KART_COMPACT} {
    flex-wrap: nowrap;
    max-width: none;
  }
`

// Under the buttons on the right; with the touch buttons on a phone held sideways (they have the
// right-hand side), at the top between the lesson and the buttons
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

const noteIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
`

// Over the race, above the HUD: the help of the moment, and what went wrong
const Prompts = styled.div`
  position: absolute;
  left: 50%;
  bottom: 168px;
  translate: -50% 0;
  display: grid;
  justify-items: center;
  gap: ${space.xs}px;
  width: min(560px, calc(100% - ${2 * space.lg}px));
  pointer-events: none;

  @media ${KART_COMPACT} {
    bottom: auto;
    top: 46%;
  }
`

const Live = styled.p`
  ${broadcastSolid}
  margin: 0;
  padding: ${space.xs}px ${space.md}px;
  color: ${color.text};
  font-weight: 700;
  text-align: center;
`

const NoteLine = styled.p`
  ${ticker(color.danger, 10)}
  margin: 0;
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.onAccent};
  font-weight: 700;
  text-align: center;
  animation: ${noteIn} 0.2s ease-out both;

  kbd {
    color: ${color.text};
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Bottom = styled.div<{ $touch: boolean }>`
  position: absolute;
  bottom: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;

  ${({ $touch }) => $touch && touchBottom}
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
  font-size: 1.6em;

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

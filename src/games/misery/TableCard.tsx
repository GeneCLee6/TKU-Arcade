import { useEffect, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { MiseryAttempt, MiseryReveal, MiseryView } from '../../../shared/games/misery/types.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { useReducedMotion } from '../../lib/useMediaQuery.ts'
import { displayType, glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { IndexBadge } from './MiseryCardFace.tsx'
import './messages.ts'
import { attemptText, miseryFill } from './screenState.ts'

/** How long the index takes to climb to its value at a reveal */
const COUNT_MS = 1100

type NameOf = (seat: SeatId) => string

/** The card on the table, face down: what happened, and the tries at it so far */
export function TableCard({ view, nameOf }: { view: MiseryView; nameOf: NameOf }) {
  const t = useT()
  const language = useLanguage()
  const card = view.current
  if (card === null) return null
  return (
    <Panel aria-labelledby="misery-table-heading" data-testid="table-card" $edge={color.accent}>
      <Top>
        <Label id="misery-table-heading">{t('games.misery.ui.onTable')}</Label>
        <Category lang="zh-TW">{card.category}</Category>
      </Top>
      <Event>
        <IndexBadge index={null} size="lg" />
        <Title lang="zh-TW" data-testid="table-title">
          {card.title}
        </Title>
      </Event>
      <Meter aria-hidden="true">
        <Unknown />
      </Meter>
      <Small>{t('games.misery.ui.readAloud')}</Small>
      {language === 'en' && <Small>{t('games.misery.ui.chineseOnly')}</Small>}
      <Attempts attempts={view.attempts} nameOf={nameOf} />
      {view.stealers.length > 0 && view.attempts.length > 0 && (
        <Small>
          {t('games.misery.ui.stealersNext', {
            names: view.stealers.map(nameOf).join(t('games.misery.ui.nameSeparator')),
          })}
        </Small>
      )}
    </Panel>
  )
}

/** The last card face up: its index climbing up the meter, and who kept it */
export function RevealCard({ reveal, you, nameOf }: { reveal: MiseryReveal; you: SeatId | null; nameOf: NameOf }) {
  const t = useT()
  const still = useReducedMotion()
  const shown = useCountUp(reveal.card.index, `${reveal.turnNo}`, still)
  const { card, keptBy } = reveal
  const outcome =
    keptBy === null
      ? t('games.misery.ui.discarded')
      : keptBy === you
        ? t('games.misery.ui.keptByYou')
        : t('games.misery.ui.keptBy', { name: nameOf(keptBy) })

  return (
    <Panel
      aria-labelledby="misery-last-heading"
      data-testid="reveal-card"
      $edge={keptBy === null ? color.danger : color.success}
    >
      <Top>
        <Label id="misery-last-heading">{t('games.misery.ui.lastCard')}</Label>
        <Category lang="zh-TW">{card.category}</Category>
      </Top>
      <Event>
        <IndexBadge index={shown} size="lg" />
        <Title lang="zh-TW">{card.title}</Title>
      </Event>
      <Meter aria-hidden="true">
        <Fill $fill={miseryFill(shown)} style={{ width: `${shown}%` }} />
      </Meter>
      <Outcome role="status" data-testid="reveal-outcome">
        <span data-testid="reveal-index">{t('games.misery.ui.index', { index: card.index })}</span>
        {' · '}
        {outcome}
      </Outcome>
      <Attempts attempts={reveal.attempts} nameOf={nameOf} />
    </Panel>
  )
}

function Attempts({ attempts, nameOf }: { attempts: readonly MiseryAttempt[]; nameOf: NameOf }) {
  const t = useT()
  if (attempts.length === 0) return null
  return (
    <Tries aria-label={t('games.misery.ui.tries')}>
      {attempts.map((attempt, at) => {
        const text = attemptText(attempt, nameOf(attempt.seat))
        return (
          <Try key={at}>
            <Mark $right={attempt.right}>
              <span>{t(attempt.right ? 'games.misery.ui.right' : 'games.misery.ui.wrong')}</span>
            </Mark>
            <span>{t(text.key, text.params)}</span>
          </Try>
        )
      })}
    </Tries>
  )
}

/** A number climbing from 1 to `target` once per `run`; at once with reduced motion */
function useCountUp(target: number, run: string, still: boolean): number {
  const [frame, setFrame] = useState<{ run: string; value: number }>({ run, value: still ? target : 1 })
  useEffect(() => {
    if (still) return undefined
    let raf = 0
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_MS)
      const eased = 1 - (1 - progress) ** 3
      setFrame({ run, value: Math.max(1, Math.round(target * eased)) })
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [run, target, still])
  if (still) return target
  return frame.run === run ? frame.value : 1
}

const shimmer = keyframes`
  from { transform: translateX(-100%); }
  to { transform: translateX(250%); }
`

const Panel = styled.section<{ $edge: string }>`
  ${glass}
  display: grid;
  gap: ${space.md}px;
  padding: ${space.lg}px;
  box-shadow: inset 0 3px 0 ${(p) => p.$edge};
`

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: ${space.xs}px ${space.md}px;
`

const Label = styled.h2`
  ${monoType}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-transform: uppercase;
`

const Category = styled.span`
  padding: 0 ${space.sm}px;
  color: ${color.onAccent};
  background: ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Event = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.lg}px;
`

const Title = styled.p`
  ${displayType}
  margin: 0;
  font-size: clamp(${fontSize.lg}px, 5.5vw, 30px);
  overflow-wrap: anywhere;
`

const Meter = styled.div`
  position: relative;
  height: 10px;
  overflow: hidden;
  background: ${color.sunken};
`

const Fill = styled.div<{ $fill: string }>`
  height: 100%;
  background: ${(p) => p.$fill};
`

const Unknown = styled.div`
  width: 40%;
  height: 100%;
  background: ${color.raisedHover};
  animation: ${shimmer} 1.8s linear infinite;
`

const Outcome = styled.p`
  margin: 0;
  font-size: ${fontSize.lg}px;
  font-weight: 800;
`

const Small = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Tries = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Try = styled.li`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  overflow-wrap: anywhere;
`

const Mark = styled.span<{ $right: boolean }>`
  flex: none;
  padding: 0 ${space.sm}px;
  color: ${color.onAccent};
  background: ${(p) => (p.$right ? color.success : color.danger)};
  font-size: ${fontSize.sm}px;
  font-weight: 800;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

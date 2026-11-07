import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import styled from 'styled-components'
import { KART_MESSAGES, type KartMessageKey } from '../../shared/kart/i18n.ts'
import { Button } from '../components/Button.tsx'
import { registerMessages, type MessageParams } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import { supportsWebGL2 } from './Scene.ts'
import { startSpikeLoop, type SpikeStats } from './spikeLoop.ts'

registerMessages(KART_MESSAGES)

type Failure = 'noWebgl' | 'contextLost'

/**
 * e8-t01: three.js, a fixed-step loop and a box car, to see whether the stack holds up in a browser.
 * Reached only by typing /kart/spike: nothing links here, and the lobby does not know about it.
 */
export function SpikePage() {
  const t: (key: KartMessageKey, params?: MessageParams) => string = useT()
  const stage = useRef<HTMLDivElement>(null)
  const [failure, setFailure] = useState<Failure | undefined>(() =>
    supportsWebGL2() ? undefined : 'noWebgl',
  )
  const [stats, setStats] = useState<SpikeStats>()
  const [showNumbers, setShowNumbers] = useState(() =>
    new URLSearchParams(window.location.search).has('fps'),
  )
  // Read once: this page does not need useMediaQuery, whose chunk the room would then have to share
  const [coarsePointer] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false)

  useEffect(() => {
    if (!stage.current) return
    try {
      return startSpikeLoop(stage.current, {
        onStats: setStats,
        onContextLost: () => setFailure('contextLost'),
      })
    } catch {
      // The probe passed but three.js still could not start
      queueMicrotask(() => setFailure('noWebgl'))
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'KeyF' && !event.repeat) setShowNumbers((shown) => !shown)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (failure) {
    return (
      <Fallback>
        <FallbackTitle>{t('kart.spike.title')}</FallbackTitle>
        <p role="alert">
          {t(failure === 'noWebgl' ? 'kart.spike.noWebgl' : 'kart.spike.contextLost')}
        </p>
        <Link to="/">{t('kart.spike.back')}</Link>
      </Fallback>
    )
  }

  return (
    <Page>
      <Stage ref={stage} role="img" aria-label={t('kart.spike.canvas')} />
      <TopRow>
        <Panel>
          <Link to="/">{t('kart.spike.back')}</Link>
        </Panel>
        <Button $variant="secondary" $size="sm" onClick={() => setShowNumbers((shown) => !shown)}>
          {t(showNumbers ? 'kart.spike.hideNumbers' : 'kart.spike.showNumbers')}
        </Button>
      </TopRow>
      {showNumbers && stats && (
        <Numbers data-testid="kart-numbers">
          <dt>{t('kart.spike.fps')}</dt>
          <dd data-testid="kart-fps">{Math.round(stats.fps)}</dd>
          <dt>{t('kart.spike.slowest')}</dt>
          <dd>{t('kart.spike.ms', { ms: Math.round(stats.slowestMs) })}</dd>
          <dt>{t('kart.spike.speed')}</dt>
          <dd>{t('kart.spike.metresPerSecond', { speed: Math.round(stats.speed) })}</dd>
          <dt>{t('kart.spike.slip')}</dt>
          <dd>{t('kart.spike.degrees', { degrees: Math.round(stats.slipDegrees) })}</dd>
          <dt>{t('kart.spike.drift')}</dt>
          <dd>{t(stats.drifting ? 'kart.spike.yes' : 'kart.spike.no')}</dd>
          <dt>{t('kart.spike.resolution')}</dt>
          <dd>{stats.drawingBuffer}</dd>
          <dt>{t('kart.spike.renderer')}</dt>
          <dd>{stats.rendererName}</dd>
        </Numbers>
      )}
      <Hint>
        <HintTitle>{t('kart.spike.title')}</HintTitle>
        {t(coarsePointer ? 'kart.spike.noTouch' : 'kart.spike.keys')}
      </Hint>
    </Page>
  )
}

const Page = styled.main`
  position: fixed;
  inset: 0;
  overflow: hidden;
`

const Stage = styled.div`
  position: absolute;
  inset: 0;
`

const Panel = styled.div`
  padding: ${space.sm}px ${space.md}px;
  border-radius: ${radius.component}px;
  background: ${color.surface};
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

const TopRow = styled.div`
  position: absolute;
  top: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${space.sm}px;
`

const Numbers = styled(Panel).attrs({ as: 'dl' })`
  position: absolute;
  top: 64px;
  left: ${space.sm}px;
  max-width: calc(100% - ${2 * space.sm}px);
  margin: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 0 ${space.md}px;

  dt {
    color: ${color.muted};
  }

  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
`

const Hint = styled(Panel)`
  position: absolute;
  bottom: ${space.sm}px;
  left: ${space.sm}px;
  right: ${space.sm}px;
`

const HintTitle = styled.h1`
  margin: 0;
  font-size: ${fontSize.sm}px;
`

const Fallback = styled.main`
  display: grid;
  gap: ${space.md}px;
  width: min(480px, 100%);
  margin: 0 auto;
  padding: ${space.xl}px ${space.lg}px;

  p {
    margin: 0;
  }
`

const FallbackTitle = styled.h1`
  margin: 0;
  font-size: ${fontSize.xl}px;
`

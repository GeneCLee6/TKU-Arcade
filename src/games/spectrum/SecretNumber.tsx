import { useState } from 'react'
import styled from 'styled-components'
import type { SpectrumTopic } from '../../../shared/games/spectrum/types.ts'
import { Button } from '../../components/Button.tsx'
import { Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { position } from './numberLine.ts'
import { leaning } from './screenState.ts'

interface SecretNumberProps {
  number: number
  topic: SpectrumTopic
  /** A line, not a card: once the answers are in, the number is only a reminder */
  compact?: boolean
}

/**
 * Your secret number, which only you see (the view gives nobody else's), with a meter from 1 to 10
 * and a button to hide it from whoever is looking over your shoulder: it is often played face to face.
 */
export function SecretNumber({ number, topic, compact = false }: SecretNumberProps) {
  const t = useT()
  const [hidden, setHidden] = useState(false)
  const lean = leaning(number)
  const toggle = (
    <Button $variant="secondary" $size="sm" aria-pressed={hidden} onClick={() => setHidden(!hidden)}>
      {t(hidden ? 'games.spectrum.ui.showNumber' : 'games.spectrum.ui.hideNumber')}
    </Button>
  )

  if (compact) {
    return (
      <Line>
        <strong data-testid="secret-number">
          {hidden
            ? t('games.spectrum.ui.yourNumberHidden')
            : t('games.spectrum.ui.yourNumberIs', { number })}
        </strong>
        {toggle}
      </Line>
    )
  }

  return (
    <Card aria-labelledby="spectrum-secret-heading">
      <Label id="spectrum-secret-heading">
        {t('games.spectrum.ui.yourNumber')} · {t('games.spectrum.ui.onlyYou')}
      </Label>
      <Big $hidden={hidden} data-testid="secret-number">
        {hidden ? <Small>{t('games.spectrum.ui.numberHidden')}</Small> : number}
      </Big>
      <Meter aria-hidden="true">
        {!hidden && <Needle style={{ left: `${position(number) * 100}%` }} />}
      </Meter>
      <MeterEnds aria-hidden="true">
        <span>1</span>
        <span>10</span>
      </MeterEnds>
      {!hidden && (
        <Hint>
          {lean === 'low'
            ? t('games.spectrum.ui.nearLow', { low: topic.low })
            : lean === 'high'
              ? t('games.spectrum.ui.nearHigh', { high: topic.high })
              : t('games.spectrum.ui.nearMiddle')}
        </Hint>
      )}
      {toggle}
    </Card>
  )
}

const Card = styled(Section)`
  justify-items: center;
  align-content: center;
  text-align: center;
`

const Label = styled.h3`
  margin: 0;
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Big = styled.span<{ $hidden: boolean }>`
  display: grid;
  place-items: center;
  min-height: 1em;
  ${displayType}
  font-size: clamp(72px, 22vw, 112px);
  line-height: 0.9;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 0 32px color-mix(in srgb, ${color.accent} 60%, transparent);
  color: ${(p) => (p.$hidden ? color.muted : color.text)};
`

const Small = styled.span`
  font-size: ${fontSize.xl}px;
  text-shadow: none;
`

const Meter = styled.span`
  position: relative;
  width: 100%;
  height: 8px;
  margin-top: ${space.sm}px;
  background: linear-gradient(90deg, ${color.accent}, ${color.magenta});
  transform: skewX(${SLANT});
`

const Needle = styled.i`
  position: absolute;
  top: -6px;
  width: 4px;
  height: 20px;
  margin-left: -2px;
  background: ${color.text};
`

const MeterEnds = styled.span`
  display: flex;
  justify-content: space-between;
  width: 100%;
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Hint = styled.p`
  margin: 0;
  max-width: 24em;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Line = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.accent};
`

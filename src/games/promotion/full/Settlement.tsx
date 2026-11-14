import { useEffect } from 'react'
import styled from 'styled-components'
import type { FullSettlement } from '../../../../shared/games/promotion/types.ts'
import { Button } from '../../../components/Button.tsx'
import { useT } from '../../../i18n/useT.ts'
import { color, fontSize, promotionBoard, space } from '../../../styles/tokens.ts'
import { SETTLE_STEPS } from './settleSteps.ts'
import './sheetMessages.ts'

/** The settlement's steps: silver before, ranks compared (對品), the pot shared (分注), final */
export { SETTLE_STEPS }
const STEP_MS = 1400

const signed = (amount: number) => (amount > 0 ? `+${amount}` : amount < 0 ? `−${-amount}` : '0')

/**
 * The end of a full game, a step at a time (e3-t14): each seat's silver, then what comparing ranks
 * gave or took, then the share of the pot, then where everyone ends. It moves on by itself; "Next
 * step" hurries it, and with reduced motion it is all there at once. The parent holds the step.
 */
export function Settlement({
  settlement,
  nameOf,
  step,
  onStep,
  onClose,
  reducedMotion,
}: {
  settlement: FullSettlement
  nameOf(seat: number): string
  step: number
  onStep(step: number): void
  onClose(): void
  reducedMotion: boolean
}) {
  const t = useT()
  const shown = reducedMotion ? SETTLE_STEPS : step
  useEffect(() => {
    if (reducedMotion || step >= SETTLE_STEPS) return undefined
    const timer = setTimeout(() => onStep(step + 1), STEP_MS)
    return () => clearTimeout(timer)
  }, [step, reducedMotion, onStep])

  const { lines, remainder } = settlement
  return (
    <Panel aria-labelledby="full-settlement-title" data-settle-step={shown}>
      <Title id="full-settlement-title">{t('games.promotion.full.settlement')}</Title>
      <Explain>{t('games.promotion.full.settle.explain')}</Explain>
      <Table>
        <thead>
          <tr>
            <th scope="col">{t('games.promotion.full.settle.player')}</th>
            <th scope="col">{t('games.promotion.full.settle.grade')}</th>
            <th scope="col">{t('games.promotion.full.settle.before')}</th>
            <th scope="col">{t('games.promotion.full.settle.duipin')}</th>
            <th scope="col">{t('games.promotion.full.settle.share')}</th>
            <th scope="col">{t('games.promotion.full.settle.after')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.seat}>
              <th scope="row">{nameOf(line.seat)}</th>
              <td>{line.grade}</td>
              <td>{line.before}</td>
              <Delta $sign={Math.sign(line.duipin)} $shown={shown >= 1}>
                {shown >= 1 ? signed(line.duipin) : ''}
              </Delta>
              <Delta $sign={Math.sign(line.share)} $shown={shown >= 2}>
                {shown >= 2 ? signed(line.share) : ''}
              </Delta>
              <Final $shown={shown >= 3}>{shown >= 3 ? line.after : ''}</Final>
            </tr>
          ))}
        </tbody>
      </Table>
      <Remainder>
        {shown >= 2 &&
          remainder &&
          t('games.promotion.full.settle.remainder', {
            name: nameOf(remainder.seat),
            amount: remainder.amount,
          })}
      </Remainder>
      <Actions>
        {shown < SETTLE_STEPS ? (
          <Button $variant="secondary" $size="sm" onClick={() => onStep(step + 1)}>
            {t('games.promotion.full.settle.next')}
          </Button>
        ) : (
          <Button $variant="secondary" $size="sm" onClick={onClose}>
            {t('games.promotion.full.settle.close')}
          </Button>
        )}
      </Actions>
    </Panel>
  )
}

// Over the board, which stays where it was underneath: the page does not move for it
const Panel = styled.section`
  position: absolute;
  inset: ${space.sm}px;
  z-index: 2;
  overflow: auto;
  display: grid;
  align-content: start;
  gap: ${space.sm}px;
  padding: ${space.md}px;
  background: ${color.surface};
  color: ${color.text};
  border: 2px solid ${promotionBoard.gold};
  border-radius: 6px;
`

const Title = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Explain = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-variant-numeric: tabular-nums;

  & th,
  & td {
    padding: ${space.xs}px ${space.sm}px;
    text-align: right;
    border-bottom: 1px solid ${color.border};
  }

  & th[scope='row'],
  & thead th:first-child {
    text-align: left;
  }

  & thead th {
    color: ${color.muted};
    font-size: ${fontSize.sm}px;
    font-weight: 600;
  }
`

const Delta = styled.td<{ $sign: number; $shown: boolean }>`
  color: ${(p) => (p.$sign > 0 ? color.success : p.$sign < 0 ? color.danger : color.muted)};
  font-weight: 600;
  min-width: 4ch;
`

const Final = styled.td<{ $shown: boolean }>`
  font-weight: 700;
  min-width: 4ch;
`

const Remainder = styled.p`
  margin: 0;
  min-height: 1.5em;
  font-size: ${fontSize.sm}px;
`

const Actions = styled.div`
  display: flex;
  justify-content: flex-end;
`

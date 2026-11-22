import { useState } from 'react'
import styled from 'styled-components'
import type { HoldemAction, HoldemView } from '../../../shared/games/holdem/types.ts'
import { Button } from '../../components/Button.tsx'
import { useT } from '../../i18n/useT.ts'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { playerOf, raiseSizes, toCallOf } from './screenState.ts'

/**
 * Your turn, in the dock under your thumb: fold, check or call (with the amount), and bet or raise,
 * which opens a slider with the quick sizes (the smallest, half, two thirds and the whole pot, all in).
 */
export function BetBar({
  view,
  legal,
  disabled,
  onAct,
}: {
  view: HoldemView
  legal: readonly HoldemAction[]
  disabled: boolean
  onAct(action: HoldemAction): void
}) {
  const t = useT()
  const raises = legal.flatMap((action) => (action.type === 'raise' ? [action.to] : []))
  const sizes = raiseSizes(view, raises)
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState<number | null>(null)
  const you = view.you === null ? undefined : playerOf(view, view.you)
  const toCall = toCallOf(view)
  const opening = view.currentBet === 0
  const canFold = legal.some((action) => action.type === 'fold')
  const canCheck = legal.some((action) => action.type === 'check')
  const canCall = legal.some((action) => action.type === 'call')
  const callAll = you !== undefined && toCall >= you.stack

  if (open && sizes !== null) {
    const to = Math.min(sizes.max, Math.max(sizes.min, amount ?? sizes.min))
    const step = Math.max(1, view.bb)
    const label =
      to === sizes.max
        ? t('games.holdem.ui.allInTo', { chips: to })
        : opening
          ? t('games.holdem.ui.betTo', { chips: to })
          : t('games.holdem.ui.raiseTo', { chips: to })
    return (
      <Panel data-testid="raise-panel">
        <AmountRow>
          <Button $variant="secondary" $size="sm" aria-label={t('games.holdem.ui.less')} disabled={to <= sizes.min} onClick={() => setAmount(to - step)}>
            −
          </Button>
          <Slider
            type="range"
            aria-label={t('games.holdem.ui.amount')}
            min={sizes.min}
            max={sizes.max}
            step={1}
            value={to}
            onChange={(event) => setAmount(Number(event.target.value))}
          />
          <Button $variant="secondary" $size="sm" aria-label={t('games.holdem.ui.more')} disabled={to >= sizes.max} onClick={() => setAmount(to + step)}>
            +
          </Button>
          <Amount data-testid="raise-amount">{to}</Amount>
        </AmountRow>
        <Quick>
          <Button $variant="secondary" $size="sm" onClick={() => setAmount(sizes.min)}>
            {t('games.holdem.ui.min')}
          </Button>
          <Button $variant="secondary" $size="sm" onClick={() => setAmount(sizes.halfPot)}>
            {t('games.holdem.ui.halfPot')}
          </Button>
          <Button $variant="secondary" $size="sm" onClick={() => setAmount(sizes.twoThirdsPot)}>
            {t('games.holdem.ui.twoThirdsPot')}
          </Button>
          <Button $variant="secondary" $size="sm" onClick={() => setAmount(sizes.pot)}>
            {t('games.holdem.ui.fullPot')}
          </Button>
          <Button $variant="secondary" $size="sm" onClick={() => setAmount(sizes.max)}>
            {t('games.holdem.ui.max')}
          </Button>
        </Quick>
        <Row>
          <Button $variant="ghost" onClick={() => setOpen(false)}>
            {t('games.holdem.ui.cancel')}
          </Button>
          <Button disabled={disabled} onClick={() => onAct({ type: 'raise', to })}>
            {label}
          </Button>
        </Row>
      </Panel>
    )
  }

  return (
    <Row data-testid="bet-bar">
      {canFold && (
        <Button $variant="danger" disabled={disabled} onClick={() => onAct({ type: 'fold' })}>
          {t('games.holdem.ui.fold')}
        </Button>
      )}
      {canCheck && (
        <Button $variant="secondary" disabled={disabled} onClick={() => onAct({ type: 'check' })}>
          {t('games.holdem.ui.check')}
        </Button>
      )}
      {canCall && (
        <Button $variant="secondary" disabled={disabled} onClick={() => onAct({ type: 'call' })}>
          {callAll
            ? t('games.holdem.ui.callAllIn', { chips: you?.stack ?? toCall })
            : t('games.holdem.ui.call', { chips: toCall })}
        </Button>
      )}
      {sizes !== null && (
        <Button disabled={disabled} onClick={() => setOpen(true)}>
          {opening ? t('games.holdem.ui.openBet') : t('games.holdem.ui.openRaise')}
        </Button>
      )}
    </Row>
  )
}

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;

  & > button {
    flex: 1 1 0;
    min-width: 6em;
  }
`

const Panel = styled.div`
  display: grid;
  gap: ${space.sm}px;
  width: 100%;
`

const AmountRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
`

const Slider = styled.input`
  flex: 1 1 auto;
  min-width: 0;
  accent-color: ${color.accent};
  height: 32px;
`

const Amount = styled.output`
  ${monoType}
  min-width: 4.5em;
  text-align: right;
  font-size: ${fontSize.lg}px;
  font-weight: 800;
`

const Quick = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: ${space.xs}px;

  /* Five across a 360 px phone: the labels need the room more than the padding does */
  & > button {
    min-width: 0;
    padding: 0 ${space.xs}px;
    white-space: nowrap;
  }
`

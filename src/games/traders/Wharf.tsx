import styled from 'styled-components'
import type { TradersView } from '../../../shared/games/traders/types.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { Heading, Help, Section } from './Market.tsx'
import './messages.ts'
import { Token } from './pieces.tsx'
import type { Selection } from './screenState.ts'

type Props = {
  view: TradersView
  selection: Selection
  /** Your turn, in the play phase: goods can be picked */
  active: boolean
  onTap(good: number): void
}

/** The wharf's piles: tap goods to pick a take; gold only comes with a reservation */
export function Wharf({ view, selection, active, onTap }: Props) {
  const t = useT()
  const picked = selection.kind === 'goods' ? selection.goods : []
  return (
    <Section aria-labelledby="traders-wharf" data-testid="wharf">
      <Heading id="traders-wharf">{t('games.traders.ui.wharf')}</Heading>
      {active && <Help>{t('games.traders.ui.wharfHelp')}</Help>}
      <Piles>
        {view.bank.map((count, good) => {
          const times = picked.filter((one) => one === good).length
          const name = t(`games.traders.good.${good}`)
          const label = t('games.traders.ui.pile', { good: name, count })
          const inner = (
            <>
              <Token good={good} size={40} />
              <PileCount aria-hidden="true">{count}</PileCount>
              {times > 0 && <Picked aria-hidden="true">+{times}</Picked>}
            </>
          )
          return good === 5 ? (
            <Pile key={good} as="div" role="img" aria-label={label} $picked={false}>
              {inner}
            </Pile>
          ) : (
            <Pile
              key={good}
              type="button"
              data-testid={`pile-${good}`}
              disabled={!active || count === 0}
              aria-pressed={times > 0}
              $picked={times > 0}
              onClick={() => onTap(good)}
            >
              <VisuallyHidden>{times > 0 ? `${label}, ${t('games.traders.ui.picked', { count: times })}` : label}</VisuallyHidden>
              {inner}
            </Pile>
          )
        })}
      </Piles>
    </Section>
  )
}

const Piles = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: ${space.xs}px;
`

const Pile = styled.button<{ $picked: boolean }>`
  position: relative;
  display: grid;
  justify-items: center;
  gap: 2px;
  min-height: 64px;
  padding: ${space.xs}px 0;
  color: ${color.text};
  background: ${(p) => (p.$picked ? color.raisedHover : color.raised)};
  border: 0;
  border-radius: 6px;
  box-shadow: ${(p) => (p.$picked ? `inset 0 0 0 2px ${color.accent}` : 'none')};
  cursor: pointer;

  &:disabled {
    cursor: default;
  }

  &:disabled > span:first-child {
    opacity: ${(p) => (p.$picked ? 1 : 0.9)};
  }
`

const PileCount = styled.span`
  font-size: ${fontSize.sm}px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
`

const Picked = styled.span`
  position: absolute;
  top: 2px;
  right: 2px;
  padding: 0 4px;
  color: ${color.onAccent};
  background: ${color.accent};
  border-radius: 8px;
  font-size: 12px;
  font-weight: 800;
`

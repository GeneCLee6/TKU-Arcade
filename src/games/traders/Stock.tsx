import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { TradersPlayerView } from '../../../shared/games/traders/types.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import { tradersPieces as piece } from '../../styles/tradersTokens.ts'
import { Heading, Help, Section, Slot } from './Market.tsx'
import './messages.ts'
import { FILL, INK } from './goodColors.ts'
import { CardBack, CardFace, GoodMark, PatronNames, Token } from './pieces.tsx'
import { useCardLabel } from './useCardLabel.ts'
import type { Selection } from './screenState.ts'

const total = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0)

/** Per good: the bonus from cards (a card-shaped chip) over the tokens held (a round one) */
function Goods({
  player,
  returning,
  onReturn,
  small = false,
}: {
  player: TradersPlayerView
  returning: boolean
  onReturn?(good: number): void
  small?: boolean
}) {
  const t = useT()
  return (
    <GoodsGrid $small={small}>
      {player.tokens.map((tokens, good) => {
        const bonus = good < 5 ? player.bonuses[good] : null
        const name = t(`games.traders.good.${good}`)
        const label =
          bonus === null ? t('games.traders.ui.goldHeld', { tokens }) : t('games.traders.ui.stock', { good: name, bonus, tokens })
        const token = <Token good={good} size={small ? 22 : 30} count={tokens} />
        return (
          <Column key={good} role="listitem" aria-label={label}>
            {bonus === null ? <BonusGap $small={small} /> : (
              <Bonus $good={good} $small={small} aria-hidden="true">
                <GoodMark good={good} size={small ? 10 : 12} />
                {bonus}
              </Bonus>
            )}
            {returning && tokens > 0 ? (
              <ReturnButton
                type="button"
                data-testid={`return-${good}`}
                onClick={() => onReturn?.(good)}
              >
                <VisuallyHidden>{label}</VisuallyHidden>
                <span aria-hidden="true">{token}</span>
              </ReturnButton>
            ) : (
              <span aria-hidden="true">{token}</span>
            )}
          </Column>
        )
      })}
    </GoodsGrid>
  )
}

type MineProps = {
  player: TradersPlayerView
  returning: boolean
  selection: Selection
  /** Your turn, in the play phase: reserved cards can be picked */
  active: boolean
  onSelect(selection: Selection): void
  onReturn(good: number): void
}

/** Your goods, bonuses, points and reserved cards */
export function MyStock({ player, returning, selection, active, onSelect, onReturn }: MineProps) {
  const t = useT()
  const label = useCardLabel()
  return (
    <Panel aria-labelledby="traders-you" data-testid="my-stock" $returning={returning}>
      <Head>
        <Heading id="traders-you">{t('games.traders.ui.you')}</Heading>
        <Facts>
          <Fact data-testid="my-points">{t('games.traders.ui.pointsLong', { points: player.points })}</Fact>
          <Fact>{t('games.traders.ui.cards', { count: player.cardCount })}</Fact>
          <Fact $warn={total(player.tokens) > 10}>{t('games.traders.ui.tokens', { count: total(player.tokens) })}</Fact>
        </Facts>
      </Head>
      <div role="list">
        <Goods player={player} returning={returning} onReturn={onReturn} />
      </div>
      <Heading as="h3">{t('games.traders.ui.reserved', { count: player.reserved.length })}</Heading>
      {player.reserved.length === 0 ? (
        <Help>{t('games.traders.ui.noReserved')}</Help>
      ) : (
        <Reserved>
          {player.reserved.map((held, index) =>
            held.card === null ? (
              <CardBack key={index} tier={held.tier} />
            ) : (
              <Slot
                key={held.card.id}
                type="button"
                data-testid={`reserved-${held.card.id}`}
                disabled={!active}
                aria-pressed={selection.kind === 'card' && selection.id === held.card.id}
                $picked={selection.kind === 'card' && selection.id === held.card.id}
                onClick={() => {
                  const id = (held.card as { id: string }).id
                  onSelect(selection.kind === 'card' && selection.id === id ? { kind: 'none' } : { kind: 'card', id })
                }}
              >
                <VisuallyHidden>{label(held.card)}</VisuallyHidden>
                <CardFace card={held.card} />
              </Slot>
            ),
          )}
        </Reserved>
      )}
      <PatronNames patrons={player.patrons} />
    </Panel>
  )
}

/** Everyone else at a glance: points, cards, goods, reserved cards */
export function Rivals({
  players,
  turn,
  nameOf,
}: {
  players: TradersPlayerView[]
  turn: SeatId | null
  nameOf(seat: SeatId): string
}) {
  const t = useT()
  const label = useCardLabel()
  if (players.length === 0) return null
  return (
    <Section aria-labelledby="traders-rivals" data-testid="rivals">
      <Heading id="traders-rivals">{t('games.traders.ui.rivals')}</Heading>
      <RivalList>
        {players.map((player) => (
          <Rival key={player.seat} $turn={player.seat === turn} data-testid={`rival-${player.seat}`}>
            <RivalHead>
              <RivalName $seat={player.seat}>{nameOf(player.seat)}</RivalName>
              <Facts>
                <Fact>{t('games.traders.ui.points', { points: player.points })}</Fact>
                <Fact>{t('games.traders.ui.cards', { count: player.cardCount })}</Fact>
                <Fact>{t('games.traders.ui.tokenCount', { count: total(player.tokens) })}</Fact>
                {player.reserved.length > 0 && <Fact>{t('games.traders.ui.reservedCount', { count: player.reserved.length })}</Fact>}
              </Facts>
            </RivalHead>
            <div role="list">
              <Goods player={player} returning={false} small />
            </div>
            {player.reserved.length > 0 && (
              <RivalReserved>
                {player.reserved.map((held, index) => (
                  <MiniCard
                    key={held.card?.id ?? `hidden-${index}`}
                    role="img"
                    aria-label={held.card === null ? t('games.traders.ui.hiddenCard') : label(held.card)}
                  >
                    {held.card === null ? <CardBack tier={held.tier} /> : <CardFace card={held.card} compact />}
                  </MiniCard>
                ))}
              </RivalReserved>
            )}
            <PatronNames patrons={player.patrons} />
          </Rival>
        ))}
      </RivalList>
    </Section>
  )
}

const Panel = styled.section<{ $returning: boolean }>`
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.md}px;
  background: ${color.sunken};
  border-radius: 6px;
  box-shadow: inset 0 3px 0 ${(p) => (p.$returning ? color.warning : color.accent)};
`

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.xs}px ${space.sm}px;
`

export const Facts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

export const Fact = styled.span<{ $warn?: boolean }>`
  padding: 1px ${space.sm}px;
  color: ${(p) => (p.$warn ? color.warning : color.text)};
  background: ${color.raised};
  border-radius: 3px;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`

const GoodsGrid = styled.div<{ $small: boolean }>`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: ${(p) => (p.$small ? 2 : space.xs)}px;
  max-width: ${(p) => (p.$small ? '260px' : 'none')};
`

const Column = styled.div`
  display: grid;
  justify-items: center;
  gap: 3px;
`

const Bonus = styled.span<{ $good: number; $small: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: ${(p) => (p.$small ? 26 : 34)}px;
  padding: 1px 3px;
  color: ${(p) => INK[p.$good]};
  background: ${(p) => FILL[p.$good]};
  border-radius: 3px;
  box-shadow: 0 0 0 1px ${piece.rim};
  font-size: ${(p) => (p.$small ? 11 : 13)}px;
  font-weight: 800;
  line-height: 1.3;
`

const BonusGap = styled.span<{ $small: boolean }>`
  height: ${(p) => (p.$small ? 16 : 19)}px;
`

const ReturnButton = styled.button`
  display: grid;
  place-items: center;
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  background: ${color.raised};
  border: 0;
  border-radius: 50%;
  box-shadow: inset 0 0 0 2px ${color.warning};
  cursor: pointer;
`

const Reserved = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 96px));
  gap: ${space.sm}px;
`

const RivalList = styled.ul`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Rival = styled.li<{ $turn: boolean }>`
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.sm}px;
  background: ${color.sunken};
  border-radius: 6px;
  box-shadow: inset 3px 0 0 ${(p) => (p.$turn ? color.accent : 'transparent')};
`

const RivalHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
`

const RivalName = styled.span<{ $seat: number }>`
  font-weight: 800;
  border-bottom: 3px solid ${(p) => seatColor(p.$seat)};
  overflow-wrap: anywhere;
`

const RivalReserved = styled.div`
  display: flex;
  gap: ${space.xs}px;
`

const MiniCard = styled.span`
  display: block;
  width: 56px;
`

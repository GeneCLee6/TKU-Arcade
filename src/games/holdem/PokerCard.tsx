import styled, { css, keyframes } from 'styled-components'
import type { Card, Suit } from '../../../shared/poker/hand.ts'
import type { Translate } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { color, radius } from '../../styles/tokens.ts'
import { SUIT_PATHS } from '../silent-table/suits.ts'
import './messages.ts'

export type CardSize = 'tiny' | 'small' | 'medium' | 'large'

const WIDTH: Record<CardSize, number> = { tiny: 22, small: 30, medium: 38, large: 72 }
const RANK_SIZE: Record<CardSize, number> = { tiny: 11, small: 13, medium: 17, large: 30 }
const SUIT_SIZE: Record<CardSize, number> = { tiny: 9, small: 12, medium: 16, large: 30 }

const isRed = (suit: Suit) => suit === 'h' || suit === 'd'
const rankText = (rank: string) => (rank === 'T' ? '10' : rank)

/** A card in words, for screen readers: the face itself is a rank and a drawing */
function cardName(t: Translate, card: Card): string {
  const [rank, suit] = card
  const named = rank === 'A' || rank === 'K' || rank === 'Q' || rank === 'J'
  return t('games.holdem.card.name', {
    rank: named ? t(`games.holdem.card.rank.${rank}`) : rankText(rank),
    suit: t(`games.holdem.card.suit.${suit}`),
  })
}

/**
 * A card face up, drawn (no image). `win` lights it up as one of the winning five; `dim` greys out a
 * card that is not
 */
export function CardFace({
  card,
  size = 'medium',
  win = false,
  dim = false,
}: {
  card: Card
  size?: CardSize
  win?: boolean
  dim?: boolean
}) {
  const t = useT()
  const [rank, suit] = card
  return (
    <Face
      role="img"
      aria-label={cardName(t, card)}
      data-win={win || undefined}
      $size={size}
      $red={isRed(suit as Suit)}
      $win={win}
      $dim={dim}
    >
      <span>{rankText(rank)}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={SUIT_PATHS[suit as Suit]} fill="currentColor" />
      </svg>
    </Face>
  )
}

/** A card face down: a diamond lattice on the felt's green */
export function CardBack({ size = 'small', label = false }: { size?: CardSize; label?: boolean }) {
  const t = useT()
  return (
    <Back
      $size={size}
      viewBox="0 0 50 70"
      role={label ? 'img' : undefined}
      aria-label={label ? t('games.holdem.card.back') : undefined}
      aria-hidden={label ? undefined : true}
    >
      <rect x="0" y="0" width="50" height="70" fill={color.feltPlain} />
      <rect x="3" y="3" width="44" height="64" rx="3" fill="none" stroke={color.onFelt} />
      <path d="M25 9 41 35 25 61 9 35z" fill="none" stroke={color.chipFace} strokeWidth="2" />
      <path d="M25 21 33 35 25 49 17 35z" fill={color.chipFace} />
    </Back>
  )
}

const turnOver = keyframes`
  from {
    transform: rotateY(90deg);
  }
  to {
    transform: rotateY(0);
  }
`

const cardShape = (size: CardSize) => css`
  flex: none;
  width: ${WIDTH[size]}px;
  aspect-ratio: 5 / 7;
  border-radius: ${size === 'tiny' || size === 'small' ? radius.component / 2 : radius.card}px;
  border: 1px solid ${color.cardInk};
`

const Face = styled.span<{ $size: CardSize; $red: boolean; $win: boolean; $dim: boolean }>`
  ${(p) => cardShape(p.$size)}
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${(p) => (p.$size === 'large' ? 4 : 0)}px;
  background: ${color.cardFace};
  color: ${(p) => (p.$red ? color.cardRed : color.cardInk)};
  font-size: ${(p) => RANK_SIZE[p.$size]}px;
  font-weight: 800;
  line-height: 1;
  opacity: ${(p) => (p.$dim ? 0.45 : 1)};
  box-shadow: ${(p) => (p.$win ? `0 0 0 3px ${color.chipFace}, 0 0 14px ${color.chipFace}` : 'none')};
  transform: ${(p) => (p.$win ? 'translateY(-3px)' : 'none')};
  animation: ${turnOver} 260ms ease-out;
  transition:
    transform 200ms ease-out,
    opacity 200ms ease-out;

  & > svg {
    width: ${(p) => SUIT_SIZE[p.$size]}px;
    height: ${(p) => SUIT_SIZE[p.$size]}px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition: none;
  }
`

const Back = styled.svg<{ $size: CardSize }>`
  ${(p) => cardShape(p.$size)}
  height: auto;
  overflow: hidden;
`

/** Where a card of the board has yet to come */
export const CardSlot = styled.span<{ $size: CardSize }>`
  ${(p) => cardShape(p.$size)}
  border: 1px dashed ${color.onFelt};
  opacity: 0.35;
`

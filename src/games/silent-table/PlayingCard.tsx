import styled, { keyframes } from 'styled-components'
import type { SilentTableSkin } from '../../../shared/games/silent-table/types.ts'
import type { Card, Suit } from '../../../shared/poker/hand.ts'
import type { Translate } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { color, radius } from '../../styles/tokens.ts'

export type CardSize = 'small' | 'large'

/** Drawn rather than typed: phones turn the text suit signs into emoji */
const SUIT_PATHS: Record<Suit, string> = {
  s: 'M12 2C9 7 3 10 3 15a4.5 4.5 0 0 0 7.6 3.3L9.5 22h5l-1.100-3.700A4.5 4.5 0 0 0 21 15c0-5-6-8-9-13z',
  h: 'M12 21.500C6 16.500 2 13 2 8.200a5.200 5.200 0 0 1 10-2 5.200 5.200 0 0 1 10 2c0 4.800-4 8.300-10 13.300z',
  d: 'M12 1.500 20 12l-8 10.500L4 12z',
  c: 'M12 2a4.800 4.800 0 0 1 4.300 6.900 4.800 4.800 0 1 1-2.900 8.300L14.500 22h-5l1.100-4.800a4.800 4.800 0 1 1-2.900-8.300A4.800 4.800 0 0 1 12 2z',
}

const isRed = (suit: Suit) => suit === 'h' || suit === 'd'

const rankText = (rank: string) => (rank === 'T' ? '10' : rank)

/** A card in words, for screen readers: the face itself is a rank and a drawing */
function cardName(t: Translate, card: Card): string {
  const [rank, suit] = card
  const named = rank === 'A' || rank === 'K' || rank === 'Q' || rank === 'J'
  return t('games.silent-table.card.name', {
    rank: named ? t(`games.silent-table.card.rank.${rank}`) : rankText(rank),
    suit: t(`games.silent-table.card.suit.${suit}`),
  })
}

/** A card face up. It turns over as it first appears, which a new `key` makes it do again */
export function CardFace({ card, size = 'large' }: { card: Card; size?: CardSize }) {
  const t = useT()
  const [rank, suit] = card
  return (
    <Face role="img" aria-label={cardName(t, card)} $size={size} $red={isRed(suit as Suit)}>
      <span>{rankText(rank)}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={SUIT_PATHS[suit as Suit]} fill="currentColor" />
      </svg>
    </Face>
  )
}

/** The pattern on the back of the cards is most of what a skin is */
function BackMotif({ skin }: { skin: SilentTableSkin }) {
  switch (skin) {
    case 'diving':
      return (
        <g fill="none" stroke={color.onFelt} strokeWidth="2">
          <path d="M6 24q5-5 9.500 0t9.500 0 9.500 0 9.500 0" />
          <path d="M6 36q5-5 9.500 0t9.500 0 9.500 0 9.500 0" />
          <path d="M6 48q5-5 9.500 0t9.500 0 9.500 0 9.500 0" />
          <circle cx="16" cy="13" r="2.500" />
          <circle cx="27" cy="9" r="1.500" />
          <circle cx="34" cy="15" r="2" />
        </g>
      )
    case 'climbing':
      return (
        <g fill="none" stroke={color.onFelt} strokeWidth="2" strokeLinejoin="round">
          <path d="M5 44 18 20l7 12 6-8 14 20z" />
          <path d="M14 27.500 18 20l4 7-4 3zM5 56h40" />
        </g>
      )
    case 'plain':
    default:
      return (
        <g fill="none" stroke={color.onFelt} strokeWidth="2">
          <path d="M25 12 39 35 25 58 11 35z" />
          <path d="M25 24 32 35 25 46 18 35z" />
        </g>
      )
  }
}

/** A card face down, in the colours of the table it lies on */
export function CardBack({
  skin,
  felt,
  size = 'large',
}: {
  skin: SilentTableSkin
  felt: string
  size?: CardSize
}) {
  return (
    <Back $size={size} viewBox="0 0 50 70" aria-hidden="true" style={{ background: felt }}>
      <rect x="3" y="3" width="44" height="64" rx="3" fill="none" stroke={color.onFelt} />
      <BackMotif skin={skin} />
    </Back>
  )
}

const WIDTH: Record<CardSize, number> = { small: 30, large: 56 }

const turnOver = keyframes`
  from {
    transform: rotateY(90deg);
  }
  to {
    transform: rotateY(0);
  }
`

const cardShape = (size: CardSize) => `
  flex: none;
  width: ${WIDTH[size]}px;
  aspect-ratio: 5 / 7;
  border-radius: ${size === 'small' ? radius.component / 2 : radius.component}px;
  border: 1px solid ${color.cardInk};
`

const Face = styled.span<{ $size: CardSize; $red: boolean }>`
  ${(p) => cardShape(p.$size)}
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${(p) => (p.$size === 'small' ? 0 : 2)}px;
  background: ${color.cardFace};
  color: ${(p) => (p.$red ? color.cardRed : color.cardInk)};
  font-size: ${(p) => (p.$size === 'small' ? 13 : 20)}px;
  font-weight: 700;
  line-height: 1;
  animation: ${turnOver} 280ms ease-out;

  & > svg {
    width: ${(p) => (p.$size === 'small' ? 12 : 22)}px;
    height: ${(p) => (p.$size === 'small' ? 12 : 22)}px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Back = styled.svg<{ $size: CardSize }>`
  ${(p) => cardShape(p.$size)}
  height: auto;
`

/** Where a shared card has yet to come */
export const CardSlot = styled.span`
  ${cardShape('large')}
  border: 1px dashed ${color.onFelt};
`

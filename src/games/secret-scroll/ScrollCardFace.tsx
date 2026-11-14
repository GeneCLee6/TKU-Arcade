import type { ReactElement } from 'react'
import styled, { css } from 'styled-components'
import type { ScrollCard } from '../../../shared/games/secret-scroll/types.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, promotionBoard, space } from '../../styles/tokens.ts'

// The cards borrow Silent Table's card stock and the promotion board's lacquer and gold: the same in
// both themes, as a real deck is, and no new colours in everyone's first load
const scrollCard = {
  face: color.cardFace,
  ink: color.cardInk,
  seal: color.cardRed,
  onSeal: color.cardFace,
  edge: promotionBoard.edge,
  back: promotionBoard.lacquer,
  backTrim: promotionBoard.gold,
}
import './messages.ts'

// Each character's emblem, drawn here in a 24-unit box: our own simple line marks, no artwork
const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

const EMBLEMS: Record<ScrollCard, ReactElement> = {
  // A begging bowl and a pair of chopsticks
  0: (
    <>
      <path {...stroke} d="M3 12h18a9 7 0 0 1-18 0z" />
      <path {...stroke} d="M14 4l-3 8M18 5l-4 7" />
    </>
  ),
  // A constable's warrant tablet
  1: (
    <>
      <path {...stroke} d="M7 3h10v13l-5 5-5-5z" />
      <path {...stroke} d="M10 8h4M10 12h4" />
    </>
  ),
  // An eye behind a screen
  2: (
    <>
      <path {...stroke} d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z" />
      <circle {...stroke} cx="12" cy="12" r="2.5" />
    </>
  ),
  // Two crossed swords
  3: (
    <>
      <path {...stroke} d="M5 19L19 5M5 5l14 14" />
      <path {...stroke} d="M3 16l5 5M16 21l5-5" />
    </>
  ),
  // Prayer beads
  4: (
    <>
      <circle {...stroke} cx="12" cy="11" r="7" strokeDasharray="0.1 3.6" strokeWidth={3} />
      <path {...stroke} d="M12 18v4" />
    </>
  ),
  // A wine gourd
  5: (
    <>
      <circle {...stroke} cx="12" cy="8" r="3" />
      <circle {...stroke} cx="12" cy="16" r="5" />
      <path {...stroke} d="M12 5V2" />
    </>
  ),
  // An opera mask
  6: (
    <>
      <path {...stroke} d="M4 6c4-2 12-2 16 0 0 8-4 13-8 13S4 14 4 6z" />
      <path {...stroke} d="M8 10l2 1M16 10l-2 1M10 15h4" />
    </>
  ),
  // A strategist's feather fan
  7: (
    <>
      <path {...stroke} d="M12 21L4 9a12 10 0 0 1 16 0z" />
      <path {...stroke} d="M12 21V7M12 21L8 8M12 21l4-13" />
    </>
  ),
  // The scroll itself
  8: (
    <>
      <rect {...stroke} x="6" y="5" width="12" height="14" />
      <path {...stroke} d="M4 5h16M4 19h16M9 9h6M9 12h6M9 15h4" />
    </>
  ),
}

export function Emblem({ card }: { card: ScrollCard }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {EMBLEMS[card]}
    </svg>
  )
}

/** A card face up: value seal, emblem, name and what it does. `small` for discards and the log */
export function ScrollCardFace({ card, small = false }: { card: ScrollCard; small?: boolean }) {
  const t = useT()
  const name = t(`games.secret-scroll.card.${card}`)
  if (small) {
    return (
      <Mini title={name} data-card={card}>
        <MiniValue>{card}</MiniValue>
        <MiniName>{name}</MiniName>
      </Mini>
    )
  }
  return (
    <Face data-card={card}>
      <Seal>{card}</Seal>
      <Art>
        <Emblem card={card} />
      </Art>
      <Name>{name}</Name>
      <Text>{t(`games.secret-scroll.text.${card}`)}</Text>
    </Face>
  )
}

/** A card face down */
export function ScrollCardBack({ small = false }: { small?: boolean }) {
  return <Back $small={small} aria-hidden="true" />
}

const paper = css`
  color: ${scrollCard.ink};
  background: ${scrollCard.face};
  border: 2px solid ${scrollCard.edge};
  border-radius: 8px;
`

const Face = styled.div`
  ${paper}
  position: relative;
  display: grid;
  grid-template-rows: auto auto 1fr;
  justify-items: center;
  gap: ${space.xs}px;
  aspect-ratio: 5 / 7;
  width: 100%;
  padding: ${space.lg}px ${space.sm}px ${space.sm}px;
  text-align: center;
  box-shadow: 0 6px 16px ${color.overlay};
`

const Seal = styled.span`
  position: absolute;
  top: ${space.xs}px;
  left: ${space.xs}px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  color: ${scrollCard.onSeal};
  background: ${scrollCard.seal};
  border-radius: 6px;
  font-size: ${fontSize.md}px;
  font-weight: 900;
`

const Art = styled.span`
  display: block;
  width: 46%;
  color: ${scrollCard.edge};

  & svg {
    display: block;
    width: 100%;
    height: auto;
  }
`

const Name = styled.span`
  font-size: ${fontSize.lg}px;
  font-weight: 900;
  line-height: 1.1;
`

const Text = styled.span`
  align-self: start;
  font-size: ${fontSize.sm}px;
  line-height: 1.35;
`

const Mini = styled.span`
  ${paper}
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px 1px 2px;
  border-width: 1px;
  border-radius: 4px;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  white-space: nowrap;
`

const MiniValue = styled.span`
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  color: ${scrollCard.onSeal};
  background: ${scrollCard.seal};
  border-radius: 3px;
`

const MiniName = styled.span`
  line-height: 1;
`

const Back = styled.span<{ $small: boolean }>`
  display: inline-block;
  width: ${({ $small }) => ($small ? 16 : 40)}px;
  aspect-ratio: 5 / 7;
  background:
    repeating-linear-gradient(45deg, ${scrollCard.backTrim} 0 1px, transparent 1px 6px),
    ${scrollCard.back};
  border: 1px solid ${scrollCard.backTrim};
  border-radius: 3px;
`

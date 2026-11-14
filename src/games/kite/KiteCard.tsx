import { useId, type ReactNode } from 'react'
import styled, { css } from 'styled-components'
import type { KiteKnowledge, KiteRank, KiteSuit } from '../../../shared/games/kite/types.ts'
import { color } from '../../styles/tokens.ts'
import { ALL_RANKS, kiteColors as lc, suitFill } from './screenState.ts'

type BaseSuit = Exclude<KiteSuit, 'rainbow'>
const BASE: readonly BaseSuit[] = ['red', 'gold', 'jade', 'blue', 'white']

/** A small mark per colour, so that the colours can be told apart without seeing colour */
function SuitGlyph({ suit, x, y, r = 2.6 }: { suit: KiteSuit; x: number; y: number; r?: number }) {
  const paint = { fill: lc.paper, stroke: lc.frame, strokeWidth: 0.9 }
  switch (suit) {
    case 'red':
      return <circle {...paint} cx={x} cy={y} r={r} />
    case 'gold':
      return <path {...paint} d={`M${x} ${y - r - 0.6}L${x + r + 0.6} ${y}L${x} ${y + r + 0.6}L${x - r - 0.6} ${y}z`} />
    case 'jade':
      return <path {...paint} d={`M${x} ${y - r - 0.4}L${x + r + 0.6} ${y + r}L${x - r - 0.6} ${y + r}z`} />
    case 'blue':
      return <rect {...paint} x={x - r} y={y - r} width={r * 2} height={r * 2} />
    case 'white':
      return <path {...paint} d={`M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}`} strokeWidth={1.8} stroke={lc.frame} />
    case 'rainbow':
      return (
        <g {...paint}>
          <circle cx={x} cy={y} r={r} />
          <circle cx={x} cy={y} r={r / 2.4} fill={lc.frame} />
        </g>
      )
  }
}

export interface KiteCardProps {
  /** Null where this viewer may not see it */
  suit: KiteSuit | null
  rank: KiteRank | null
  /** What its holder knows, from the notes: drawn under the card */
  knows?: KiteKnowledge
  /** The colours in this game, for the marks */
  suits?: readonly KiteSuit[]
  size?: 'small' | 'medium' | 'large'
  /** Pointed at by the last note */
  marked?: boolean
  selected?: boolean
  dim?: boolean
}

/**
 * One diamond kite as a card: the colour is the kite's sail, the number on a label in the middle,
 * a mark per colour under it, a tail with bows. A card this viewer may not see is grey with what its holder
 * knows filled in (one known colour paints it, one known number labels it).
 */
export function KiteCard({ suit, rank, knows, suits = BASE, size = 'medium', marked, selected, dim }: KiteCardProps) {
  const gradient = `lg${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const knownSuit = suit ?? (knows && knows.suits.length === 1 ? knows.suits[0] : null)
  const knownRank = rank ?? (knows && knows.ranks.length === 1 ? knows.ranks[0] : null)
  const fill = knownSuit === null ? lc.unknown : knownSuit === 'rainbow' ? `url(#${gradient})` : lc[knownSuit]
  const narrowed =
    knows !== undefined && (knows.ranks.length < ALL_RANKS.length || knows.suits.length < suits.length)
  return (
    <Wrap $size={size} $dim={dim} $selected={selected} $marked={marked} aria-hidden="true">
      <svg viewBox="0 0 40 58">
        {knownSuit === 'rainbow' && (
          <defs>
            <linearGradient id={gradient} x1="0" x2="1" y1="0" y2="0">
              {BASE.map((part, index) => (
                <stop key={part} offset={`${(index / (BASE.length - 1)) * 100}%`} stopColor={lc[part]} />
              ))}
            </linearGradient>
          </defs>
        )}
        <path d="M20 2L37 20L20 44L3 20z" fill={fill} stroke={lc.frame} strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M20 2V44M3 20H37" fill="none" stroke={lc.frame} strokeOpacity="0.45" strokeWidth="1" />
        <path
          d="M20 44q-4 3 0 5.5t0 6"
          fill="none"
          stroke={lc.frame}
          strokeWidth="1"
        />
        <path d="M17 48.5l3 1.5 3-1.5M17 53.5l3 1.5 3-1.5" fill="none" stroke={knownSuit === null ? lc.unknown : suitFill(knownSuit)} strokeWidth="1.6" />
        <circle cx="20" cy="20" r="8.2" fill={lc.paper} stroke={lc.frame} strokeWidth="1" />
        <text
          x="20"
          y="20"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="12"
          fontWeight="800"
          fill={lc.ink}
        >
          {knownRank ?? '?'}
        </text>
        {knownSuit !== null && <SuitGlyph suit={knownSuit} x={20} y={34} />}
      </svg>
      {narrowed && knows && <Marks knows={knows} suits={suits} />}
    </Wrap>
  )
}

/** What the holder knows: the numbers still possible bright, ruled out struck; the same for colours */
function Marks({ knows, suits }: { knows: KiteKnowledge; suits: readonly KiteSuit[] }): ReactNode {
  return (
    <MarkRows>
      {knows.ranks.length < ALL_RANKS.length && (
        <Digits>
          {ALL_RANKS.map((rank) => (
            <Digit key={rank} $out={!knows.ranks.includes(rank)}>
              {rank}
            </Digit>
          ))}
        </Digits>
      )}
      {knows.suits.length < suits.length && (
        <Dots>
          {suits.map((suit) => (
            <Dot key={suit} $fill={suitFill(suit)} $out={!knows.suits.includes(suit)} />
          ))}
        </Dots>
      )}
    </MarkRows>
  )
}

const WIDTH = { small: 30, medium: 'clamp(44px, 14.5vw, 62px)', large: 'clamp(50px, 16vw, 72px)' } as const

const Wrap = styled.span<{ $size: 'small' | 'medium' | 'large'; $dim?: boolean; $selected?: boolean; $marked?: boolean }>`
  display: inline-grid;
  justify-items: center;
  gap: 2px;
  width: ${({ $size }) => (typeof WIDTH[$size] === 'number' ? `${WIDTH[$size]}px` : WIDTH[$size])};
  padding: 2px;
  border-radius: 6px;
  opacity: ${({ $dim }) => ($dim ? 0.45 : 1)};
  transition: transform 120ms ease-out;

  & > svg {
    display: block;
    width: 100%;
    height: auto;
  }

  ${({ $marked }) =>
    $marked &&
    css`
      box-shadow: 0 0 0 2px ${color.accent};
    `}
  ${({ $selected }) =>
    $selected &&
    css`
      transform: translateY(-6px);
      box-shadow: 0 0 0 3px ${color.accent};
    `}

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const MarkRows = styled.span`
  display: grid;
  justify-items: center;
  gap: 2px;
  width: 100%;
`

const Digits = styled.span`
  display: flex;
  justify-content: center;
  gap: 1px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
`

const Digit = styled.span<{ $out: boolean }>`
  color: ${({ $out }) => ($out ? color.muted : color.text)};
  text-decoration: ${({ $out }) => ($out ? 'line-through' : 'none')};
  opacity: ${({ $out }) => ($out ? 0.55 : 1)};
`

const Dots = styled.span`
  display: flex;
  justify-content: center;
  gap: 2px;
`

const Dot = styled.span<{ $fill: string; $out: boolean }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid ${color.muted};
  background: ${({ $fill, $out }) => ($out ? 'transparent' : $fill)};
`

/** A train's place in the sky: an empty outline until its 1 is flying */
export function EmptySlot({ suit }: { suit: KiteSuit }) {
  return (
    <Wrap $size="medium" aria-hidden="true">
      <svg viewBox="0 0 40 58">
        <path
          d="M20 2L37 20L20 44L3 20z"
          fill="none"
          stroke={suit === 'rainbow' ? lc.glow : lc[suit]}
          strokeWidth="1.6"
          strokeDasharray="3 3"
        />
        <SuitGlyph suit={suit} x={20} y={22} r={3.4} />
      </svg>
    </Wrap>
  )
}

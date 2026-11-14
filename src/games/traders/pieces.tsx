import type { ReactElement } from 'react'
import styled from 'styled-components'
import type { TradersCard, TradersPatron } from '../../../shared/games/traders/types.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { fontSize, space } from '../../styles/tokens.ts'
import { tradersPieces as piece } from '../../styles/tradersTokens.ts'
import { FILL, INK } from './goodColors.ts'
import './messages.ts'

// The game's pieces, drawn in code (no asset files): the five goods and gold as tokens, a card, a
// patron. Each good has a shape as well as a colour, so that nobody needs to tell colours apart.

/** A good's mark on a 24-unit square: tea leaf, camphor crystal, indigo drop, sugar cube, peppercorns, coin */
const MARKS: readonly ((ink: string) => ReactElement)[] = [
  (ink) => (
    <>
      <path d="M5 18C5 10 11 5 19 5C19 13 14 19 6 19Z" fill={ink} />
      <path d="M6 18L15 9" stroke={FILL[0]} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  (ink) => <path d="M12 3.5L19.4 7.8V16.2L12 20.5L4.6 16.2V7.8Z" fill="none" stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />,
  (ink) => <path d="M12 3.5C15.5 8.5 17.5 11.5 17.5 14.5A5.5 5.5 0 0 1 6.5 14.5C6.5 11.5 8.5 8.5 12 3.5Z" fill={ink} />,
  (ink) => (
    <>
      <path d="M12 4.5L19 8.5V15.5L12 19.5L5 15.5V8.5Z" fill={ink} />
      <path d="M5 8.5L12 12.5L19 8.5M12 12.5V19.5" fill="none" stroke={FILL[3]} strokeWidth="1.3" strokeLinejoin="round" />
    </>
  ),
  (ink) => (
    <>
      <circle cx="8.5" cy="9" r="3.2" fill={ink} />
      <circle cx="15.5" cy="9" r="3.2" fill={ink} />
      <circle cx="12" cy="15.5" r="3.2" fill={ink} />
    </>
  ),
  (ink) => (
    <>
      <circle cx="12" cy="12" r="7.5" fill="none" stroke={ink} strokeWidth="2.2" />
      <rect x="9.6" y="9.6" width="4.8" height="4.8" fill="none" stroke={ink} strokeWidth="2" />
    </>
  ),
]

/** A good's mark alone, `size` px, in its ink (for a token) or its fill (on paper) */
export function GoodMark({ good, size, onPaper = false }: { good: number; size: number; onPaper?: boolean }) {
  const ink = onPaper ? (good === 1 ? piece.inkMuted : FILL[good]) : INK[good]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {MARKS[good](ink)}
    </svg>
  )
}

/** A round token of a good, with a count in it or under it */
export function Token({ good, size, count }: { good: number; size: number; count?: number }) {
  return (
    <TokenFace $good={good} $size={size} aria-hidden="true">
      {count === undefined ? <GoodMark good={good} size={Math.round(size * 0.62)} /> : <Count $size={size}>{count}</Count>}
    </TokenFace>
  )
}

const TokenFace = styled.span<{ $good: number; $size: number }>`
  display: inline-grid;
  place-items: center;
  flex: none;
  width: ${(p) => p.$size}px;
  height: ${(p) => p.$size}px;
  color: ${(p) => INK[p.$good]};
  background: ${(p) => FILL[p.$good]};
  border-radius: 50%;
  box-shadow: 0 0 0 1.5px ${piece.rim};
`

const Count = styled.span<{ $size: number }>`
  font-size: ${(p) => Math.max(11, Math.round(p.$size * 0.55))}px;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
`

/** The cost of a card, good by good, as tokens with numbers */
export function Cost({ cost, size = 18 }: { cost: readonly number[]; size?: number }) {
  return (
    <CostList>
      {cost.map((count, good) =>
        count > 0 ? (
          <li key={good}>
            <Token good={good} size={size} count={count} />
          </li>
        ) : null,
      )}
    </CostList>
  )
}

const CostList = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
`

/** A card's face: the good it gives and its points on a coloured band, its cost below */
export function CardFace({ card, compact = false }: { card: TradersCard; compact?: boolean }) {
  const t = useT()
  return (
    <Face $good={card.bonus} aria-hidden="true">
      <Band $good={card.bonus}>
        <Points>{card.points > 0 ? card.points : ''}</Points>
        <GoodMark good={card.bonus} size={compact ? 16 : 20} />
      </Band>
      {!compact && <Name>{t(`games.traders.card.${card.tier}.${card.bonus}`)}</Name>}
      <Pips>{'•'.repeat(card.tier)}</Pips>
      <Cost cost={card.cost} size={compact ? 16 : 18} />
    </Face>
  )
}

const Face = styled.span<{ $good: number }>`
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  gap: 2px;
  width: 100%;
  height: 100%;
  min-height: 96px;
  padding: 0 4px 4px;
  color: ${piece.ink};
  background: ${piece.paper};
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px ${piece.paperEdge};
  overflow: hidden;
  text-align: left;
`

const Band = styled.span<{ $good: number }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 -4px;
  padding: 2px 4px;
  color: ${(p) => INK[p.$good]};
  background: ${(p) => FILL[p.$good]};
  box-shadow: inset 0 -1px 0 ${piece.rim};
`

const Points = styled.span`
  min-width: 1ch;
  font-size: ${fontSize.lg}px;
  font-weight: 900;
  line-height: 1.1;
`

const Name = styled.span`
  font-size: 11px;
  font-weight: 700;
  line-height: 1.15;
  overflow-wrap: anywhere;
`

const Pips = styled.span`
  color: ${piece.inkMuted};
  font-size: 10px;
  line-height: 1;
  letter-spacing: 1px;
`

/** The back of a card: its tier, for a face-down reservation */
export function CardBack({ tier }: { tier: number }) {
  return (
    <Back aria-hidden="true">
      <Pips>{'•'.repeat(tier)}</Pips>
    </Back>
  )
}

const Back = styled.span`
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 96px;
  background: repeating-linear-gradient(45deg, ${piece.paperEdge} 0 6px, ${piece.paper} 6px 12px);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px ${piece.inkMuted};
`

/** The patrons who came to a seat, by name; nothing when none */
export function PatronNames({ patrons }: { patrons: readonly TradersPatron[] }) {
  const t = useT()
  const language = useLanguage()
  if (patrons.length === 0) return null
  return (
    <Came>
      {t('games.traders.ui.came', {
        names: patrons.map((patron) => (language === 'zh-TW' ? patron.zh : patron.en)).join(t('games.traders.ui.separator')),
      })}
    </Came>
  )
}

const Came = styled.p`
  margin: 0;
  font-size: ${fontSize.sm}px;
  font-weight: 600;
  line-height: 1.35;
`

/** A patron's tile: name, 3 points, the bonuses wanted */
export function PatronTile({ patron }: { patron: TradersPatron }) {
  const t = useT()
  const language = useLanguage()
  const name = language === 'zh-TW' ? patron.zh : patron.en
  const need = patron.need
    .map((count, good) => (count > 0 ? t('games.traders.ui.costPart', { count, good: t(`games.traders.good.${good}`) }) : null))
    .filter((part): part is string => part !== null)
    .join(t('games.traders.ui.separator'))
  return (
    <Patron aria-label={t('games.traders.ui.patron', { name, need })} role="listitem">
      <PatronHead>
        <PatronName>{name}</PatronName>
        <PatronPoints aria-hidden="true">{patron.points}</PatronPoints>
      </PatronHead>
      <NeedList aria-hidden="true">
        {patron.need.map((count, good) =>
          count > 0 ? (
            <Need key={good} $good={good}>
              <GoodMark good={good} size={12} />
              {count}
            </Need>
          ) : null,
        )}
      </NeedList>
    </Patron>
  )
}

const Patron = styled.div`
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.xs}px ${space.sm}px ${space.sm}px;
  color: ${piece.ink};
  background: ${piece.paper};
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px ${piece.paperEdge}, inset 0 3px 0 ${piece.gold};
`

const PatronHead = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: ${space.xs}px;
`

const PatronName = styled.span`
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
`

const PatronPoints = styled.span`
  font-size: ${fontSize.md}px;
  font-weight: 900;
`

const NeedList = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
`

/** A wanted bonus: a small card-shaped chip, as bonuses come from cards */
const Need = styled.span<{ $good: number }>`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 4px 1px 2px;
  color: ${(p) => INK[p.$good]};
  background: ${(p) => FILL[p.$good]};
  border-radius: 3px;
  box-shadow: 0 0 0 1px ${piece.rim};
  font-size: 12px;
  font-weight: 800;
  line-height: 1.2;
`

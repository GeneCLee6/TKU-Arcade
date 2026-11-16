// e9-t05, e9-t06a: the item race's HUD. The slot shows the item held, its name and the key that uses
// it; the note under the place says what an item just did to this kart or for it. Icons are our own,
// drawn here in a few strokes; colours come from the tokens.
import { memo } from 'react'
import styled, { css, keyframes } from 'styled-components'
import type { ItemId } from '../../../shared/kart/items.ts'
import type { Translate } from '../../i18n/t.ts'
import { displayType, glass } from '../../styles/esports.ts'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'

type T = Translate

const ICON_PATHS: Record<ItemId, string> = {
  // Two chevrons pointing ahead
  boost: 'M6 20 L16 10 L26 20 M6 28 L16 18 L26 28',
  // A bubble with a shine
  shield: 'M16 4 A12 12 0 1 1 15.99 4 Z M10 12 A7 7 0 0 1 15 8',
  // A line pulled towards a kart ahead
  tow: 'M4 24 C10 24 12 14 20 12 M18 7 L24 12 L18 17 M26 12 L28 12',
  // Gusts blowing back
  headwind: 'M28 10 H12 A4 4 0 1 1 16 6 M28 17 H6 M28 24 H14 A4 4 0 1 0 18 28',
  // Two arrows trading places
  swap: 'M6 11 H24 M19 6 L24 11 L19 16 M26 21 H8 M13 16 L8 21 L13 26',
}

export const ItemIcon = memo(function ItemIcon({ item }: { item: ItemId }) {
  return (
    <svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true" focusable="false">
      <path
        d={ICON_PATHS[item]}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
})

export interface ItemSlotProps {
  t: T
  item: ItemId | null
  /** The key that uses it, as the player sees it */
  keyName: string
}

/** What this kart holds: an empty slot, or the item with its name and key */
export const ItemSlot = memo(function ItemSlot({ t, item, keyName }: ItemSlotProps) {
  return (
    <Slot data-testid="kart-item" data-item={item ?? ''} $full={item !== null}>
      <Frame $full={item !== null}>{item && <ItemIcon item={item} />}</Frame>
      <Words>
        <Name>{item ? t(`games.kart.item.${item}`) : t('games.kart.item.empty')}</Name>
        {item && <Key>{t('games.kart.item.press', { key: keyName })}</Key>}
      </Words>
    </Slot>
  )
})

/** One line about an item, for a moment */
export const ItemNote = memo(function ItemNote({ text, bad }: { text: string; bad: boolean }) {
  return (
    <Note role="status" data-testid="kart-item-note" $bad={bad}>
      {text}
    </Note>
  )
})

const pop = keyframes`
  from { transform: scale(0.85); opacity: 0.4; }
  to { transform: scale(1); opacity: 1; }
`

const Slot = styled.div<{ $full: boolean }>`
  ${glass}
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.xs}px ${space.sm}px;
  pointer-events: none;
  ${({ $full }) =>
    $full &&
    css`
      animation: ${pop} 0.18s ease-out;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Frame = styled.div<{ $full: boolean }>`
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 2px solid ${({ $full }) => ($full ? color.accent : color.border)};
  border-radius: ${radius.component}px;
  color: ${color.accent};
  background: ${color.sunken};
`

const Words = styled.div`
  display: grid;
  gap: 2px;
`

const Name = styled.span`
  ${displayType}
  color: ${color.text};
  font-size: ${fontSize.md}px;
`

const Key = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Note = styled.p<{ $bad: boolean }>`
  margin: 0;
  padding: ${space.xs}px ${space.sm}px;
  border-radius: ${radius.component}px;
  color: ${color.onAccent};
  background: ${({ $bad }) => ($bad ? color.danger : color.accent)};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  animation: ${pop} 0.18s ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

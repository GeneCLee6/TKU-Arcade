// e9-t05, e9-t06a, e9-t06b: the item race's HUD. The slot shows the item held, its name and the key that uses
// it; the note under the place says what an item just did to this kart or for it. Icons are our own,
// drawn here in a few strokes; colours come from the tokens.
// 2026-11-18 (owner: "the items could be at the top of the screen, in the middle, where they stand
// out"): the slot is big, at the top centre of the race, of a race being watched and of a replay
// alike, and an item arriving drops into it with a flash.
import { memo } from 'react'
import styled, { css, keyframes } from 'styled-components'
import type { ItemId } from '../../../shared/kart/items.ts'
import type { Translate } from '../../i18n/t.ts'
import { displayType } from '../../styles/esports.ts'
import { broadcast } from '../ui/broadcast.ts'
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
  // A ball with speed lines behind it (e9-t06b)
  hail: 'M27 16 A6 6 0 1 1 26.99 16 Z M4 12 H11 M2 17 H10 M4 22 H11',
  // A cloud with a bolt under it
  cloud: 'M8 18 A5 5 0 0 1 10 9 A7 7 0 0 1 23 9 A5 5 0 0 1 24 18 Z M17 19 L13 25 H18 L15 30',
  // A flat puddle with a splash
  puddle:
    'M4 23 C4 19 12 18 16 19 C21 20 28 19 28 23 C28 27 4 27 4 23 Z M12 13 L10 9 M16 12 V7 M20 13 L22 9',
  // 2026-11-20. A round mirror on a handle, and an arrow turning back off it
  mirror: 'M13 3 A8 8 0 1 1 12.99 3 Z M13 19 V29 M9 8 L7 12 M29 15 A7 7 0 0 0 23 8 M23 4 V8 H27',
  // Three drifting lines of fog
  fog: 'M4 10 C8 7 12 13 16 10 C20 7 24 13 28 10 M4 17 C8 14 12 20 16 17 C20 14 24 20 28 17 M4 24 C8 21 12 27 16 24 C20 21 24 27 28 24',
  // A stone skipping over water: hops getting shorter, and the stone
  skip: 'M2 26 Q6 16 10 26 Q13 19 16 26 Q18 21 20 26 M25 22 A3 3 0 1 1 24.99 22 Z M2 29 H30',
  // A spark crossed out: no boost
  jam: 'M16 3 A13 13 0 1 1 15.99 3 Z M18 7 L12 16 H19 L14 25 M7 7 L25 25',
  // A flag waving on its pole
  rally: 'M8 29 V4 M8 5 C14 2 18 9 25 6 V16 C18 19 14 12 8 15',
  // A box seen from a corner, standing a little crooked
  decoy: 'M6 12 L16 6 L26 12 V23 L16 29 L6 23 Z M6 12 L16 18 L26 12 M16 18 V29',
}

export const ItemIcon = memo(function ItemIcon({ item }: { item: ItemId }) {
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true" focusable="false">
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
  /** The key that uses it, as the player sees it; left out when watching (nothing to press) */
  keyName?: string
  /**
   * On a phone held upright, in the middle too, under the clock (2026-11-22, #100: the race moves its
   * map to the left under it, MAP_UNDER_ITEM_SLOT); otherwise beside the map, in what it leaves free
   */
  centred?: boolean
}

/**
 * What this kart holds, at the top centre of the screen: an empty slot, or the item with its name
 * and key. The page it is on must be the positioned box it sits in (the race, the watch page)
 */
export const ItemSlot = memo(function ItemSlot({
  t,
  item,
  keyName,
  centred = false,
}: ItemSlotProps) {
  const full = item !== null
  return (
    <Dock $centred={centred}>
      {/* Keyed by the item: each one arriving plays the drop again */}
      <Slot key={item ?? 'empty'} data-testid="kart-item" data-item={item ?? ''} $full={full}>
        <Frame $full={full}>{item && <ItemIcon item={item} />}</Frame>
        <Words>
          <Name $full={full}>
            {item ? t(`games.kart.item.${item}`) : t('games.kart.item.empty')}
          </Name>
          {item && keyName !== undefined && (
            <Key>{t('games.kart.item.press', { key: keyName })}</Key>
          )}
        </Words>
      </Slot>
    </Dock>
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

/** An item arriving: it drops in from above, overshoots and settles */
const drop = keyframes`
  0% { transform: translateY(-140%) scale(0.6); opacity: 0; }
  55% { transform: translateY(6%) scale(1.18); opacity: 1; }
  78% { transform: translateY(-3%) scale(0.96); }
  100% { transform: none; }
`

/** ... and its frame flashes */
const flash = keyframes`
  0% { box-shadow: 0 0 0 0 ${color.accent}, 0 0 0 0 color-mix(in srgb, ${color.accent} 60%, transparent); }
  45% { box-shadow: 0 0 26px 6px ${color.accent}, 0 0 0 14px color-mix(in srgb, ${color.accent} 0%, transparent); }
  100% { box-shadow: 0 0 14px 0 color-mix(in srgb, ${color.accent} 70%, transparent), 0 0 0 0 transparent; }
`

/** Where the slot starts on a phone held upright: under the place and whatever is said beside it */
const ITEM_SLOT_PORTRAIT_TOP = 92
/**
 * A phone held upright, the slot in the middle (`centred`, 2026-11-22): under the clock at the top
 * right, at its tallest (four rows from the second lap on); and where the map, moved to the left
 * under it, starts (the slot there is 48 px of frame and its padding, about 60 px)
 */
export const ITEM_SLOT_UPRIGHT_TOP = 136
export const MAP_UNDER_ITEM_SLOT = ITEM_SLOT_UPRIGHT_TOP + 60 + space.sm

/** Top centre of the race, clear of the place (top left) and the map (top right) */
const Dock = styled.div<{ $centred: boolean }>`
  position: absolute;
  top: ${space.sm}px;
  left: 50%;
  translate: -50% 0;
  z-index: 1;
  pointer-events: none;

  /*
   * A phone held upright has no room between the place and the clock: under that row, in the middle
   * of what the map (132 px, top right) leaves free
   */
  @media (max-width: 560px) and (orientation: portrait) {
    top: ${({ $centred }) => ($centred ? ITEM_SLOT_UPRIGHT_TOP : ITEM_SLOT_PORTRAIT_TOP)}px;
    left: ${({ $centred }) => ($centred ? '50%' : 'calc((100% - 140px) / 2)')};
  }
`

const Slot = styled.div<{ $full: boolean }>`
  ${broadcast}
  display: flex;
  align-items: center;
  gap: ${space.md}px;
  padding: ${space.sm}px ${space.lg}px ${space.sm}px ${space.sm}px;
  ${({ $full }) =>
    $full
      ? css`
          animation: ${drop} 0.42s cubic-bezier(0.2, 0.9, 0.3, 1) both;
        `
      : css`
          opacity: 0.7;
        `}

  /* A narrow or a short screen (a phone, either way up): smaller, and the frame over the words */
  @media (max-width: 760px), (max-height: 500px) {
    gap: ${space.sm}px;
    padding: ${space.xs}px ${space.md}px ${space.xs}px ${space.xs}px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Frame = styled.div<{ $full: boolean }>`
  display: grid;
  place-items: center;
  flex: none;
  width: 72px;
  height: 72px;
  padding: 10px;
  border: 3px ${({ $full }) => ($full ? 'solid' : 'dashed')}
    ${({ $full }) => ($full ? color.accent : color.border)};
  border-radius: 2px;
  color: ${color.accent};
  background: ${color.sunken};
  ${({ $full }) =>
    $full &&
    css`
      animation: ${flash} 0.6s ease-out both;
    `}

  @media (max-width: 760px), (max-height: 500px) {
    width: 48px;
    height: 48px;
    padding: 6px;
    border-width: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    box-shadow: ${({ $full }) =>
      $full ? `0 0 14px 0 color-mix(in srgb, ${color.accent} 70%, transparent)` : 'none'};
  }
`

const Words = styled.div`
  display: grid;
  gap: 2px;
`

const Name = styled.span<{ $full: boolean }>`
  ${displayType}
  color: ${({ $full }) => ($full ? color.text : color.muted)};
  font-size: ${({ $full }) => ($full ? fontSize.xl : fontSize.md)}px;
  line-height: 1.1;
  white-space: nowrap;

  @media (max-width: 760px), (max-height: 500px) {
    font-size: ${({ $full }) => ($full ? fontSize.lg : fontSize.sm)}px;
  }
`

const Key = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  white-space: nowrap;

  /* No room on a short screen, and a phone's button says ITEM itself */
  @media (max-height: 500px) {
    display: none;
  }
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

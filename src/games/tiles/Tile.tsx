import type { DragEvent } from 'react'
import styled, { css } from 'styled-components'
import { isJoker, numberOf, suitOf } from '../../../shared/games/tiles/tiles.ts'
import type { Suit, TileId } from '../../../shared/games/tiles/types.ts'
import type { Translate } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, radius } from '../../styles/tokens.ts'
import './messages.ts'

/** Drawn rather than typed: phones turn the text suit signs into emoji */
const SUIT_PATHS: Record<Suit, string> = {
  0: 'M12 2C9 7 3 10 3 15a4.5 4.5 0 0 0 7.6 3.3L9.5 22h5l-1.1-3.7A4.5 4.5 0 0 0 21 15c0-5-6-8-9-13z',
  1: 'M12 21.5C6 16.5 2 13 2 8.2a5.2 5.2 0 0 1 10-2 5.2 5.2 0 0 1 10 2c0 4.8-4 8.3-10 13.3z',
  2: 'M12 1.5 20 12l-8 10.5L4 12z',
  3: 'M12 2a4.8 4.8 0 0 1 4.3 6.9 4.8 4.8 0 1 1-2.9 8.3L14.5 22h-5l1.1-4.8a4.8 4.8 0 1 1-2.9-8.3A4.8 4.8 0 0 1 12 2z',
}

/** The club's chair: a five-point star in a ring, the wildcard's face */
const JOKER_PATH = 'M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.4l-5.1 2.7 1-5.6-4.1-4 5.7-.8z'

const INK: Record<Suit, string> = {
  0: color.tileSpade,
  1: color.tileHeart,
  2: color.tileDiamond,
  3: color.tileClub,
}

/** A tile in words, for screen readers */
function tileName(t: Translate, tile: TileId): string {
  if (isJoker(tile)) return t('games.tiles.ui.tile.joker')
  return t('games.tiles.ui.tile.number', { number: numberOf(tile), suit: t(`games.tiles.ui.suit.${suitOf(tile)}`) })
}

export interface TileProps {
  tile: TileId
  selected?: boolean
  /** Laid on the table this turn */
  fresh?: boolean
  /** Without it the tile is only a picture */
  onPick?: () => void
  onDragStart?: (event: DragEvent) => void
}

/** One tile, face up: a number over a suit sign in the suit's ink, or the wildcard's star */
export function TileFace({ tile, selected = false, fresh = false, onPick, onDragStart }: TileProps) {
  const t = useT()
  const joker = isJoker(tile)
  const ink = joker ? color.tileJoker : INK[suitOf(tile)]
  const name = fresh ? `${tileName(t, tile)}, ${t('games.tiles.ui.newTile')}` : tileName(t, tile)
  const face = (
    <>
      <Number>{joker ? '' : numberOf(tile)}</Number>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d={joker ? JOKER_PATH : SUIT_PATHS[suitOf(tile)]} fill="currentColor" />
      </svg>
    </>
  )
  if (onPick === undefined) {
    return (
      <Face as="span" role="img" aria-label={name} $ink={ink} $selected={false} $fresh={fresh} data-tile={tile}>
        {face}
      </Face>
    )
  }
  return (
    <Face
      type="button"
      aria-label={name}
      aria-pressed={selected}
      $ink={ink}
      $selected={selected}
      $fresh={fresh}
      data-tile={tile}
      draggable={onDragStart !== undefined}
      onDragStart={onDragStart}
      onClick={(event) => {
        event.stopPropagation()
        onPick()
      }}
    >
      {face}
    </Face>
  )
}

const Face = styled.button<{ $ink: string; $selected: boolean; $fresh: boolean }>`
  position: relative;
  display: inline-grid;
  grid-template-rows: 1fr auto;
  justify-items: center;
  align-items: center;
  flex: none;
  width: 34px;
  height: 46px;
  padding: 3px 0 4px;
  color: ${(p) => p.$ink};
  background: ${color.tileFace};
  border: 1px solid ${color.tileEdge};
  border-radius: ${radius.component}px;
  box-shadow: 0 2px 0 ${color.tileEdge};
  font: inherit;
  line-height: 1;
  cursor: ${(p) => (p.as === 'span' ? 'default' : 'pointer')};
  touch-action: manipulation;
  user-select: none;
  transition: transform 120ms ease;

  svg {
    width: 14px;
    height: 14px;
  }

  ${(p) =>
    p.$fresh &&
    css`
      &::after {
        content: '';
        position: absolute;
        left: 6px;
        right: 6px;
        bottom: -5px;
        height: 3px;
        background: ${color.accent};
      }
    `}

  ${(p) =>
    p.$selected &&
    css`
      transform: translateY(-5px);
      outline: 3px solid ${color.accent};
      outline-offset: 1px;
    `}

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Number = styled.span`
  font-size: ${fontSize.lg}px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
`

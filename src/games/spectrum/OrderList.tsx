import { useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import { useT } from '../../i18n/useT.ts'
import { clippedFill, displayType, slantClip } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import './messages.ts'
import { moveSeat } from './order.ts'

export type OrderItem = { seat: SeatId; name: string; text: string }

interface OrderListProps {
  /** What 1 means: the top of the list */
  low: string
  /** What 10 means: the bottom */
  high: string
  items: readonly OrderItem[]
  /** The guesser's order so far, lowest first: every item's seat once */
  order: readonly SeatId[]
  onChange(order: SeatId[]): void
  disabled?: boolean
}

/**
 * The guesser putting every answer in order, for the full-order rule option (e5-t04): drag a row,
 * or use its two buttons, which also work from the keyboard and on a phone. It only keeps the
 * order; sending it as `guessOrder` is the screen's (H2).
 */
export function OrderList({ low, high, items, order, onChange, disabled = false }: OrderListProps) {
  const t = useT()
  const [dragging, setDragging] = useState<number | null>(null)
  const bySeat = new Map(items.map((item) => [item.seat, item]))
  const move = (from: number, to: number) => onChange(moveSeat(order, from, to))

  return (
    <Wrap>
      <End>{t('games.spectrum.ui.lowEnd', { low })}</End>
      <List aria-label={t('games.spectrum.ui.orderList')}>
        {order.map((seat, index) => {
          const item = bySeat.get(seat)
          if (!item) return null
          return (
            <Row
              key={seat}
              draggable={!disabled}
              $dragging={dragging === index}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move'
                setDragging(index)
              }}
              onDragOver={(event) => {
                if (dragging !== null) event.preventDefault()
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (dragging !== null) move(dragging, index)
                setDragging(null)
              }}
              onDragEnd={() => setDragging(null)}
            >
              <Place style={{ background: seatColor(seat) }}>{index + 1}</Place>
              <Who>
                <Answer>{item.text}</Answer>
                <Name>{item.name}</Name>
              </Who>
              <Buttons>
                <MoveButton
                  type="button"
                  disabled={disabled || index === 0}
                  aria-label={t('games.spectrum.ui.moveLower', { name: item.name })}
                  onClick={() => move(index, index - 1)}
                >
                  ↑
                </MoveButton>
                <MoveButton
                  type="button"
                  disabled={disabled || index === order.length - 1}
                  aria-label={t('games.spectrum.ui.moveHigher', { name: item.name })}
                  onClick={() => move(index, index + 1)}
                >
                  ↓
                </MoveButton>
              </Buttons>
            </Row>
          )
        })}
      </List>
      <End>{t('games.spectrum.ui.highEnd', { high })}</End>
    </Wrap>
  )
}

const Wrap = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const End = styled.div`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const List = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Row = styled.li<{ $dragging: boolean }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: ${space.sm}px;
  padding: ${space.sm}px ${space.sm}px ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow:
    inset 4px 0 0 ${color.accent},
    inset 0 0 0 1px ${(p) => (p.$dragging ? color.accent : color.line)};
  opacity: ${(p) => (p.$dragging ? 0.6 : 1)};
  cursor: grab;
`

const Place = styled.span`
  display: grid;
  place-items: center;
  min-width: 28px;
  height: 28px;
  color: ${color.onSeat};
  ${displayType}
  font-variant-numeric: tabular-nums;
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
`

const Who = styled.div`
  min-width: 0;
`

const Answer = styled.div`
  overflow-wrap: anywhere;
  font-weight: 700;
`

const Name = styled.div`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Buttons = styled.div`
  display: flex;
  gap: ${space.xs}px;
`

// 44 px: a finger, not a cursor
const MoveButton = styled.button`
  ${clippedFill(slantClip(8), color.raised)}
  min-width: 48px;
  min-height: 44px;
  color: ${color.text};
  font-size: ${fontSize.lg}px;
  background: transparent;
  border: 0;
  cursor: pointer;

  &::before {
    box-shadow: inset 0 0 0 1px ${color.border};
  }

  &:hover:not(:disabled)::before {
    background: ${color.raisedHover};
  }

  &:disabled {
    color: ${color.muted};
    cursor: default;
    opacity: 0.5;
  }
`

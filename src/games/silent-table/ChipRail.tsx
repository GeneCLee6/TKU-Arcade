import styled, { keyframes } from 'styled-components'
import type {
  SilentTableAction,
  SilentTablePlayerView,
} from '../../../shared/games/silent-table/types.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'

interface ChipRailProps {
  players: readonly SilentTablePlayerView[]
  you: number | null
  legal: readonly SilentTableAction[]
  nameOf(seat: number): string
  onAct(action: SilentTableAction): void
}

/**
 * Every rank chip in order, whoever holds it. The whole game is on this line: where the chips stand
 * says who claims what, and pressing a chip takes it, from the table or from its holder. Which chips
 * can be taken comes from `legal`: what the server says, not what this screen thinks.
 */
export function ChipRail({ players, you, legal, nameOf, onAct }: ChipRailProps) {
  const t = useT()
  const chips = players.map((_, index) => index + 1)

  return (
    <Rail role="group" aria-label={t('games.silent-table.ui.chips')}>
      <Ends aria-hidden="true">
        <span>{t('games.silent-table.ui.weakest')}</span>
        <span>{t('games.silent-table.ui.strongest', { top: chips.length })}</span>
      </Ends>
      <Slots $count={chips.length}>
        {chips.map((chip) => {
          const holder = players.find((player) => player.chip === chip)?.seat ?? null
          const mine = holder !== null && holder === you
          const action: SilentTableAction | undefined =
            holder === null
              ? legal.find((other) => other.type === 'takeChip' && other.chip === chip)
              : legal.find((other) => other.type === 'takeFrom' && other.seat === holder)

          let label: string
          if (mine) label = t('games.silent-table.ui.chipYours', { chip })
          else if (holder !== null && action) {
            label = t('games.silent-table.ui.takeFrom', { chip, name: nameOf(holder) })
          } else if (holder !== null) {
            label = t('games.silent-table.ui.chipHeld', { chip, name: nameOf(holder) })
          } else if (action) label = t('games.silent-table.ui.take', { chip })
          else label = t('games.silent-table.ui.chipFree', { chip })

          return (
            <Slot key={chip}>
              {/* aria-disabled, not disabled: the focus stays when a chip moves under it */}
              <ChipButton
                type="button"
                aria-label={label}
                aria-disabled={!action}
                disabled={you === null}
                data-chip={chip}
                $held={holder !== null}
                $mine={mine}
                $takeable={Boolean(action)}
                style={holder !== null ? { background: seatColor(holder) } : undefined}
                onClick={() => {
                  if (action) onAct(action)
                }}
              >
                {/* The key turns the chip over whenever it changes hands */}
                <ChipNumber key={String(holder)}>{chip}</ChipNumber>
              </ChipButton>
              <Holder aria-hidden="true" $mine={mine}>
                {mine ? t('room.waiting.badge.you') : holder !== null ? nameOf(holder) : ''}
              </Holder>
            </Slot>
          )
        })}
      </Slots>
    </Rail>
  )
}

/** A chip as a plain mark: a seat's own, off the rail */
export function ChipMark({ chip, seat }: { chip: number | null; seat: number }) {
  if (chip === null) return <EmptyMark aria-hidden="true" />
  return (
    <Mark aria-hidden="true" style={{ background: seatColor(seat) }}>
      {chip}
    </Mark>
  )
}

const Rail = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const Ends = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: ${fontSize.sm}px;
`

const Slots = styled.div<{ $count: number }>`
  display: grid;
  grid-template-columns: repeat(${(p) => p.$count}, minmax(0, 1fr));
  gap: ${space.xs}px;
`

const Slot = styled.div`
  display: grid;
  justify-items: center;
  gap: 2px;
  min-width: 0;
`

const ChipButton = styled.button<{ $held: boolean; $mine: boolean; $takeable: boolean }>`
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 50%;
  border: 2px ${(p) => (p.$held ? 'solid' : 'dashed')} ${(p) => (p.$held ? color.onFelt : color.chipInk)};
  /* Yours has a ring round it, not only a place on the rail */
  box-shadow: ${(p) => (p.$mine ? `0 0 0 3px ${color.onFelt}` : 'none')};
  background: ${color.chipFace};
  color: ${(p) => (p.$held ? color.onSeat : color.chipInk)};
  font-family: inherit;
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  line-height: 1;
  cursor: ${(p) => (p.$takeable ? 'pointer' : 'default')};

  &:hover:not([aria-disabled='true']) {
    filter: brightness(1.08);
  }
`

const pop = keyframes`
  from {
    transform: scale(0.4);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
`

const ChipNumber = styled.span`
  display: inline-block;
  animation: ${pop} 200ms ease-out;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Holder = styled.span<{ $mine: boolean }>`
  max-width: 100%;
  min-height: 1.5em;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: ${fontSize.sm}px;
  font-weight: ${(p) => (p.$mine ? 700 : 400)};
`

const markShape = `
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
`

const Mark = styled.span`
  ${markShape}
  border: 2px solid ${color.border};
  color: ${color.onSeat};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const EmptyMark = styled.span`
  ${markShape}
  border: 2px dashed ${color.muted};
`

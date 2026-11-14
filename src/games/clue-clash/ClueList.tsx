import styled, { css } from 'styled-components'
import type { CcAction, CcClueView } from '../../../shared/games/clue-clash/types.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import { Button } from '../../components/Button.tsx'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'

interface ClueListProps {
  clues: readonly CcClueView[]
  nameOf(seat: SeatId): string
  /** The review's cross-out buttons you may press, by clue index */
  flags?: ReadonlyMap<number, Extract<CcAction, { type: 'flag' }>>
  /** Crosses that take a clue out */
  need?: number
  disabled?: boolean
  send?(action: CcAction): void
  /** Only the clues still standing (the guesser's view) */
  survivorsOnly?: boolean
}

/**
 * The clues, one line each: who wrote it and, where you may read it, the word. A clash the room
 * found is struck through with its tag; in the review a giver crosses out clues that mean the same.
 */
export function ClueList({ clues, nameOf, flags, need, disabled, send, survivorsOnly }: ClueListProps) {
  const t = useT()
  const shown = clues.map((clue, index) => ({ clue, index })).filter(({ clue }) => !survivorsOnly || clue.cancelled === false)
  return (
    <List data-testid="clue-list">
      {shown.map(({ clue, index }) => {
        const out = clue.clash || clue.cancelled === true
        const flag = flags?.get(index)
        return (
          <Line key={index} data-testid="clue-line" data-out={out ? '' : undefined} $out={out}>
            <Text $out={out} $status={clue.text === null}>
              {clue.text ?? t(`games.clue-clash.ui.status.${clue.status}`)}
            </Text>
            {!survivorsOnly && <By>{nameOf(clue.seat)}</By>}
            {clue.clash && <Tag>{t('games.clue-clash.ui.clashTag')}</Tag>}
            {!clue.clash && clue.cancelled === true && <Tag>{t('games.clue-clash.ui.crossedTag')}</Tag>}
            {need !== undefined && !clue.clash && clue.text !== null && clue.cancelled === null && (
              <Count>{t('games.clue-clash.ui.crosses', { count: clue.flags.length, need })}</Count>
            )}
            {flag && send && (
              <Button
                $size="sm"
                $variant={flag.on ? 'secondary' : 'primary'}
                aria-pressed={!flag.on}
                disabled={disabled}
                onClick={() => send(flag)}
              >
                {t(flag.on ? 'games.clue-clash.ui.crossOut' : 'games.clue-clash.ui.uncross')}
              </Button>
            )}
          </Line>
        )
      })}
    </List>
  )
}

const List = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Line = styled.li<{ $out: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  min-height: 48px;
  padding: ${space.xs}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => (p.$out ? color.danger : color.accent)};
`

const Text = styled.span<{ $out: boolean; $status: boolean }>`
  flex: 1 1 6em;
  min-width: 0;
  color: ${(p) => (p.$status ? color.muted : color.text)};
  font-size: ${(p) => (p.$status ? fontSize.md : fontSize.xl)}px;
  font-weight: ${(p) => (p.$status ? 600 : 800)};
  overflow-wrap: anywhere;

  ${(p) =>
    p.$out &&
    css`
      color: ${color.muted};
      text-decoration: line-through;
    `}
`

const By = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Tag = styled.span`
  padding: 0 ${space.xs}px;
  color: ${color.danger};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Count = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

import styled, { css } from 'styled-components'
import type { WbCard, WbDuoCard } from '../../../shared/games/word-bridge/types.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import type { CellLook } from './screenState.ts'

type Face = WbCard | WbDuoCard | 'found'

interface GridProps {
  words: readonly string[]
  looks: readonly CellLook[]
  /** The words you may pick now */
  pickable: ReadonlySet<number>
  selected: number | null
  onSelect(index: number): void
  /** The co-op sides' names, for the bystander marks */
  sideNames?: readonly [string, string]
}

/** The colour of a turned word and of a key's mark: the two partnerships take two seat colours */
const FILL: Record<Face, string> = {
  ns: color.seat1,
  ew: color.seat0,
  target: color.seat2,
  found: color.seat2,
  neutral: color.sunken,
  mine: color.text,
}

const INK: Record<Face, string> = {
  ns: color.onSeat,
  ew: color.onSeat,
  target: color.onSeat,
  found: color.onSeat,
  neutral: color.muted,
  mine: color.bg,
}

/**
 * The 5×5 grid. A word you may pick is a button: the first tap selects it, the dock's button turns
 * it, so that a slip of the thumb on a phone never hits the trap. Turned words take their colour;
 * a key you hold marks the rest with a coloured edge and a word saying what it is.
 */
export function Grid({ words, looks, pickable, selected, onSelect, sideNames }: GridProps) {
  const t = useT()
  const faceName = (face: Face) => t(`games.word-bridge.ui.card.${face}`)
  return (
    <Board role="list" data-testid="word-grid">
      {words.map((word, index) => {
        const look = looks[index]
        const can = pickable.has(index)
        const shown = look?.shown ?? null
        const hint = look?.hint ?? null
        const tag = shown !== null ? faceName(shown) : hint !== null ? faceName(hint) : null
        const missed = look?.missed ?? []
        return (
          <li key={word} role="listitem">
            <Cell
              type="button"
              data-testid="word-cell"
              data-index={index}
              data-shown={shown ?? undefined}
              data-hint={hint ?? undefined}
              disabled={!can}
              aria-pressed={can ? selected === index : undefined}
              onClick={() => onSelect(index)}
              $shown={shown}
              $hint={hint}
              $selected={selected === index}
              $can={can}
            >
              <Word>{word}</Word>
              {tag !== null && <Tag>{tag}</Tag>}
              {missed.length > 0 && sideNames && (
                <Missed>
                  {missed.map((side) => t('games.word-bridge.ui.missedBy', { name: sideNames[side] })).join(' ')}
                </Missed>
              )}
            </Cell>
          </li>
        )
      })}
    </Board>
  )
}

const Board = styled.ul`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;

  & > li {
    display: grid;
  }
`

const Cell = styled.button<{
  $shown: Face | null
  $hint: Face | null
  $selected: boolean
  $can: boolean
}>`
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 2px;
  min-width: 0;
  min-height: 64px;
  padding: ${space.xs}px 2px;
  border: 0;
  border-radius: 6px;
  color: ${(p) => (p.$shown ? INK[p.$shown] : color.text)};
  background: ${(p) => (p.$shown ? FILL[p.$shown] : color.raised)};
  font: inherit;
  text-align: center;
  cursor: ${(p) => (p.$can ? 'pointer' : 'default')};
  box-shadow: ${(p) => (p.$hint && !p.$shown ? `inset 0 -5px 0 ${p.$hint === 'neutral' ? color.border : FILL[p.$hint]}` : 'none')};
  transition: transform 120ms ease;

  ${(p) =>
    p.$can &&
    css`
      &:hover {
        background: ${color.raisedHover};
      }
    `}

  ${(p) =>
    p.$selected &&
    css`
      outline: 3px solid ${color.accent};
      outline-offset: 1px;
      transform: translateY(-2px);
    `}

  &:disabled {
    opacity: 1;
  }

  @media (min-width: 640px) {
    min-height: 76px;
  }
`

const Word = styled.span`
  max-width: 100%;
  font-size: clamp(13px, 3.9vw, ${fontSize.lg}px);
  font-weight: 800;
  line-height: 1.15;
  overflow-wrap: anywhere;
`

const Tag = styled.span`
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  opacity: 0.85;
`

const Missed = styled.span`
  font-size: 10px;
  line-height: 1.1;
  color: ${color.warning};
`

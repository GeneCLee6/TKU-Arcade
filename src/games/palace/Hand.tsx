import { useState } from 'react'
import styled from 'styled-components'
import type { PalaceAction, PalaceCard, PalaceView } from '../../../shared/games/palace/types.ts'
import { Button } from '../../components/Button.tsx'
import { Heading } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { glass, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { RoleCard } from './RoleCard.tsx'
import { roleKey } from './screenState.ts'

type Props = {
  view: PalaceView
  disabled: boolean
  onAct(action: PalaceAction): void
}

/**
 * Your face-down backers, big: the secret this game turns on, cut by the server into your own view.
 * When you must lose one, each card is a button; after a scheme the two drawn cards join them and
 * you tap the ones to keep.
 */
export function Hand({ view, disabled, onAct }: Props) {
  const t = useT()
  const phase = view.phase
  const me = view.players.find((player) => player.seat === view.you)
  const losing = phase.kind === 'lose' && phase.seat === view.you
  const exchanging = phase.kind === 'exchange' && view.drawn.length > 0
  const keep = phase.kind === 'exchange' ? phase.keep : 0
  const [kept, setKept] = useState<{ step: number; ids: string[] }>({ step: view.step, ids: [] })
  const chosen = kept.step === view.step ? kept.ids : []
  const toggle = (id: string) => {
    const ids = chosen.includes(id) ? chosen.filter((one) => one !== id) : [...chosen, id].slice(-keep)
    setKept({ step: view.step, ids })
  }

  if (view.you === null) {
    return (
      <Panel aria-labelledby="palace-hand-heading">
        <Heading id="palace-hand-heading">{t('games.palace.ui.hand')}</Heading>
        <Help>{t('games.palace.ui.spectatorHand')}</Help>
      </Panel>
    )
  }

  const cards: { card: PalaceCard; drawn: boolean }[] = [
    ...view.hand.map((card) => ({ card, drawn: false })),
    ...(exchanging ? view.drawn.map((card) => ({ card, drawn: true })) : []),
  ]

  return (
    <Panel aria-labelledby="palace-hand-heading" data-testid="hand" $urgent={losing || exchanging}>
      <Heading id="palace-hand-heading">{t('games.palace.ui.hand')}</Heading>
      {me?.out === true && <Help>{t('games.palace.ui.outHelp')}</Help>}
      {losing && <Strong>{t('games.palace.ui.loseHelp')}</Strong>}
      {exchanging && <Strong>{t('games.palace.ui.keepHelp', { count: keep })}</Strong>}
      <Cards>
        {cards.map(({ card, drawn }) => {
          const face = <RoleCard role={card.role} />
          if (losing) {
            return (
              <Pick
                key={card.id}
                type="button"
                disabled={disabled}
                aria-label={t(roleKey(card.role))}
                data-testid="lose-card"
                onClick={() => onAct({ type: 'lose', card: card.id })}
              >
                {face}
              </Pick>
            )
          }
          if (exchanging) {
            const on = chosen.includes(card.id)
            return (
              <Pick
                key={card.id}
                type="button"
                aria-pressed={on}
                aria-label={t(roleKey(card.role))}
                data-testid="keep-card"
                $on={on}
                onClick={() => toggle(card.id)}
              >
                {face}
                {drawn && (
                  <Drawn>
                    <span>{t('games.palace.ui.drawnTag')}</span>
                  </Drawn>
                )}
              </Pick>
            )
          }
          return <Holder key={card.id}>{face}</Holder>
        })}
      </Cards>
      {exchanging && (
        <div>
          <Button
            disabled={disabled || chosen.length !== keep}
            onClick={() => onAct({ type: 'keep', cards: chosen })}
          >
            {t('games.palace.ui.keep')}
          </Button>
        </div>
      )}
      {!losing && !exchanging && me?.out !== true && <Help>{t('games.palace.ui.handHelp')}</Help>}
    </Panel>
  )
}

const Panel = styled.section<{ $urgent?: boolean }>`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
  box-shadow: inset 0 3px 0 ${(p) => (p.$urgent ? color.warning : color.accent)};
`

const Cards = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.md}px;
`

const Holder = styled.span`
  display: inline-flex;
`

const Pick = styled.button<{ $on?: boolean }>`
  position: relative;
  display: inline-flex;
  padding: 4px;
  background: ${(p) => (p.$on ? color.accent : 'transparent')};
  border: 2px dashed ${(p) => (p.$on ? color.accent : color.border)};
  border-radius: 8px;
  cursor: pointer;

  &:disabled {
    cursor: default;
  }
`

const Drawn = styled.span`
  position: absolute;
  top: -8px;
  right: -6px;
  padding: 0 ${space.xs}px;
  color: ${color.onAccent};
  background: ${color.magenta};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Help = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Strong = styled.p`
  margin: 0;
  font-weight: 700;
`

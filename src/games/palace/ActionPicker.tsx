import { useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { PalaceAct, PalaceAction, PalaceView } from '../../../shared/games/palace/types.ts'
import { Button } from '../../components/Button.tsx'
import { Heading } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { glass } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { actChoices, actKey, CLAIMS, isBluff, roleKey } from './screenState.ts'

const COSTS: Partial<Record<PalaceAct, number>> = { storm: 7, arrest: 3 }

type Props = {
  view: PalaceView
  legal: readonly PalaceAction[]
  disabled: boolean
  nameOf(seat: SeatId): string
  onAct(action: PalaceAction): void
}

/**
 * Your turn: one button per action you can take, each saying what it does, which role it claims and
 * whether you would be bluffing. A targeted action asks "against whom?" next.
 */
export function ActionPicker({ view, legal, disabled, nameOf, onAct }: Props) {
  const t = useT()
  const choices = actChoices(legal)
  const [picked, setPicked] = useState<PalaceAct | null>(null)
  const pickedChoice = choices.find((choice) => choice.act === picked) ?? null
  const mustStorm = choices.length === 1 && choices[0].act === 'storm'

  return (
    <Panel aria-labelledby="palace-pick-heading" data-testid="action-picker">
      <Heading id="palace-pick-heading">{pickedChoice === null ? t('games.palace.ui.pick') : t(actKey(pickedChoice.act))}</Heading>
      {mustStorm && pickedChoice === null && <Note>{t('games.palace.ui.mustStorm')}</Note>}
      {pickedChoice === null && (
        <Grid>
          {choices.map((choice) => {
            const role = CLAIMS[choice.act]
            const cost = COSTS[choice.act]
            return (
              <ActButton
                key={choice.act}
                type="button"
                disabled={disabled}
                data-act={choice.act}
                onClick={() =>
                  choice.untargeted ? onAct({ type: 'act', act: choice.act, target: null }) : setPicked(choice.act)
                }
              >
                <ActName>{t(actKey(choice.act))}</ActName>
                <ActDoes>{t(`games.palace.act.${choice.act}.does`)}</ActDoes>
                <ActTags>
                  {role !== null && <span>{t('games.palace.ui.claims', { role: t(roleKey(role)) })}</span>}
                  {cost !== undefined && <span>{t('games.palace.ui.cost', { cost })}</span>}
                  {isBluff(view, role) && <Bluff>{t('games.palace.ui.bluff')}</Bluff>}
                </ActTags>
              </ActButton>
            )
          })}
        </Grid>
      )}
      {pickedChoice !== null && (
        <>
          <Note>{t('games.palace.ui.target')}</Note>
          <Targets>
            {pickedChoice.targets.map((seat) => (
              <Button
                key={seat}
                disabled={disabled}
                onClick={() => {
                  setPicked(null)
                  onAct({ type: 'act', act: pickedChoice.act, target: seat })
                }}
              >
                {nameOf(seat)}
              </Button>
            ))}
            <Button $variant="ghost" onClick={() => setPicked(null)}>
              {t('games.palace.ui.cancel')}
            </Button>
          </Targets>
        </>
      )}
    </Panel>
  )
}

const Panel = styled.section`
  ${glass}
  display: grid;
  gap: ${space.md}px;
  padding: ${space.lg}px;
  box-shadow: inset 0 3px 0 ${color.accent};
`

const Note = styled.p`
  margin: 0;
  font-weight: 600;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: ${space.sm}px;
`

const ActButton = styled.button`
  display: grid;
  align-content: start;
  gap: 2px;
  min-height: 44px;
  padding: ${space.sm}px ${space.md}px;
  color: ${color.text};
  background: ${color.sunken};
  border: 1px solid ${color.border};
  box-shadow: inset 4px 0 0 ${color.accent};
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: ${color.raisedHover};
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
`

const ActName = styled.span`
  font-weight: 800;
`

const ActDoes = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const ActTags = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 0 ${space.sm}px;
  font-size: ${fontSize.sm}px;
  font-weight: 600;
`

const Bluff = styled.span`
  color: ${color.danger};
  font-weight: 700;
`

const Targets = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

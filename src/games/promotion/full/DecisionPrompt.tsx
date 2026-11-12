import { useEffect, useId, useRef } from 'react'
import styled from 'styled-components'
import type { FullPending, PromotionAction } from '../../../../shared/games/promotion/types.ts'
import { Button } from '../../../components/Button.tsx'
import { Countdown } from '../../../components/Countdown.tsx'
import { useLanguage, useT } from '../../../i18n/useT.ts'
import type { RoomTimer } from '../../../lib/roomConnection.ts'
import { color, fontSize, promotionBoard, radius, space } from '../../../styles/tokens.ts'
import { anyCell, shortCellName } from './fullText.ts'

/** Where an offered post leads, in a few words: the copyists, the banner school, the summons */
const routeOf = (cell: string) => {
  const dept = anyCell(cell).dept
  return dept === 'tenglu' ? 'tenglu' : cell === 'jiaoxi' ? 'jiaoxi' : 'zhaoshi'
}

/**
 * A decision the game waits for (C8), over the foot of the board: never in the page's flow, so that
 * the dock and the board keep their size while it shows. To the seat that decides, the question, what
 * each answer does and costs, a countdown and the answers (44 px buttons, the first focused); to
 * everyone else who is deciding what. Rules stay on the server: these buttons only send an answer.
 */
export function DecisionPrompt({
  pending,
  mine,
  name,
  money,
  timer,
  waiting,
  onAnswer,
}: {
  pending: FullPending
  /** This viewer is the one deciding */
  mine: boolean
  /** The deciding seat's player */
  name: string
  /** The deciding seat's silver */
  money: number
  timer: RoomTimer | null
  /** An answer was sent and the room has not replied yet */
  waiting: boolean
  onAnswer(action: PromotionAction): void
}) {
  const t = useT()
  const language = useLanguage()
  const titleId = useId()
  const first = useRef<HTMLButtonElement>(null)
  const cell = (id: string) => shortCellName(id, language)

  // The question just came: the first answer takes the focus, as a dialog's would
  const key = `${pending.kind}:${pending.cell}:${pending.from}`
  useEffect(() => {
    if (mine) first.current?.focus({ preventScroll: true })
  }, [mine, key])

  if (!mine) {
    return (
      <Banner role="status" data-decision="watching">
        {t(`games.promotion.full.watching.${pending.kind}`, { name, cell: cell(pending.cell) })}
      </Banner>
    )
  }

  const answer = (action: PromotionAction) => {
    if (!waiting) onAnswer(action)
  }

  return (
    <Card role="region" aria-labelledby={titleId} data-decision={pending.kind}>
      <Title id={titleId}>
        {pending.kind === 'offer'
          ? t('games.promotion.full.offer.title', { cell: cell(pending.cell) })
          : t('games.promotion.full.buy.title', { cell: cell(pending.cell) })}
      </Title>
      <Explain>
        {pending.kind === 'offer'
          ? t('games.promotion.full.offer.explain', {
              cell: cell(pending.cell),
              route: t(`games.promotion.full.route.${routeOf(pending.cell)}`),
              from: cell(pending.from),
            })
          : t('games.promotion.full.buy.explain', { cell: cell(pending.cell), money })}
      </Explain>
      <Clock>
        {timer && <Countdown timer={timer} label={t('games.promotion.full.countdown')} />}
        <Default>{t(`games.promotion.full.default.${pending.kind}`)}</Default>
      </Clock>
      {pending.kind === 'offer' ? (
        <Answers>
          <Button ref={first} aria-disabled={waiting} onClick={() => answer({ type: 'accept' })} data-answer="accept">
            {t('games.promotion.full.offer.accept')}
          </Button>
          <Button $variant="secondary" aria-disabled={waiting} onClick={() => answer({ type: 'decline' })} data-answer="decline">
            {t('games.promotion.full.offer.decline')}
          </Button>
        </Answers>
      ) : (
        <Answers $grid>
          {pending.choices.map((choice, at) => (
            <Button
              key={choice.cell}
              ref={at === 0 ? first : undefined}
              aria-disabled={waiting}
              onClick={() => answer({ type: 'buy', cell: choice.cell })}
              data-answer="buy"
              data-buy={choice.cell}
            >
              {t('games.promotion.full.buy.option', { cell: cell(choice.cell), price: choice.price })}
            </Button>
          ))}
          <Button $variant="secondary" aria-disabled={waiting} onClick={() => answer({ type: 'skip' })} data-answer="skip">
            {t('games.promotion.full.buy.skip', { cell: cell(pending.cell) })}
          </Button>
        </Answers>
      )}
    </Card>
  )
}

const overBoard = `
  position: absolute;
  left: 50%;
  bottom: ${space.sm}px;
  z-index: 2;
  transform: translateX(-50%);
  width: min(560px, calc(100% - ${2 * space.sm}px));
  background: ${color.surface};
  color: ${color.text};
  border: 2px solid ${promotionBoard.gold};
  border-radius: ${radius.card}px;
  box-shadow: 0 0 0 4px ${color.bg};
`

const Card = styled.section`
  ${overBoard}
  display: grid;
  gap: ${space.xs}px;
  max-height: calc(100% - ${2 * space.sm}px);
  overflow-y: auto;
  padding: ${space.sm}px ${space.md}px;
`

const Banner = styled.p`
  ${overBoard}
  margin: 0;
  padding: ${space.xs}px ${space.md}px;
  font-size: ${fontSize.sm}px;
  text-align: center;
  pointer-events: none;
`

const Title = styled.h2`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const Explain = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.35;
`

const Clock = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: ${space.sm}px;
`

const Default = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Answers = styled.div<{ $grid?: boolean }>`
  display: ${(p) => (p.$grid ? 'grid' : 'flex')};
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: ${space.xs}px;

  & > button {
    min-height: 44px;
    ${(p) => (p.$grid ? '' : 'flex: 1;')}
  }
`

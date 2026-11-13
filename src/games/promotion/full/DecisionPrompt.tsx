import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import styled from 'styled-components'
import type { FullPending, PromotionAction } from '../../../../shared/games/promotion/types.ts'
import { Button } from '../../../components/Button.tsx'
import { Countdown } from '../../../components/Countdown.tsx'
import { VisuallyHidden } from '../../../components/VisuallyHidden.ts'
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
 * A decision the game waits for (C8), over the foot of the board, or its top when the cell it is about
 * is in the lower half (that cell stays in sight); on the square board (C9) in the space inside its
 * outer ring, where every cell that asks a question is, so it hides none: never in the page's flow, so that
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
  top = false,
  area = null,
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
  /** Over the top of the board rather than its foot: the cell it is about is in the lower half */
  top?: boolean
  /** In the middle of this box instead (CSS pixels in the board's box): inside the square board's outer ring */
  area?: { x: number; y: number; width: number; height: number } | null
}) {
  const t = useT()
  const language = useLanguage()
  const titleId = useId()
  const first = useRef<HTMLButtonElement>(null)
  const cell = (id: string) => shortCellName(id, language)
  // Buying office can offer ten posts: the card takes the width it has, so the answers wrap into a
  // row or two more instead of the card scrolling
  const wide = mine && pending.kind === 'buy'
  const card = useRef<HTMLElement>(null)
  const [fit, setFit] = useState({ height: 0, room: 0 })
  useLayoutEffect(() => {
    const element = card.current
    if (!wide || !area || !element) return
    const measure = () =>
      setFit({ height: element.offsetHeight, room: (element.offsetParent as HTMLElement | null)?.clientHeight ?? 0 })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [wide, area])
  // Inside the square board's ring the short cards sit in the middle. Buying office's can be taller
  // than the room inside the ring (a phone on its side), so it rests on the edge of that room away
  // from the cell it is about and grows from there, over the far side of the ring (never over the
  // cell), and no further than the board's box
  const wideTop = (box: NonNullable<typeof area>) => {
    const y = top ? box.y + box.height - space.sm - fit.height : box.y + space.sm
    const lowest = fit.room > 0 ? fit.room - space.sm - fit.height : y
    return Math.max(space.sm, Math.min(y, lowest))
  }
  const placed: CSSProperties | undefined = area
    ? {
        left: area.x + area.width / 2,
        top: wide ? wideTop(area) : area.y + area.height / 2,
        bottom: 'auto',
        transform: wide ? 'translateX(-50%)' : 'translate(-50%, -50%)',
        width: `min(${wide ? WIDE : NARROW}px, ${Math.floor(area.width - 2 * space.sm)}px)`,
      }
    : undefined

  // The question just came: the first answer takes the focus, as a dialog's would
  const key = `${pending.kind}:${pending.cell}:${pending.from}`
  useEffect(() => {
    if (mine) first.current?.focus({ preventScroll: true })
  }, [mine, key])

  if (!mine) {
    return (
      <Banner role="status" data-decision="watching" $top={top} $wide={false} style={placed}>
        {t(`games.promotion.full.watching.${pending.kind}`, { name, cell: cell(pending.cell) })}
      </Banner>
    )
  }

  const answer = (action: PromotionAction) => {
    if (!waiting) onAnswer(action)
  }

  return (
    <Card ref={card} role="region" aria-labelledby={titleId} data-decision={pending.kind} $top={top} $wide={wide} style={placed}>
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
        <Answers $wrap>
          {pending.choices.map((choice, at) => (
            <Button
              key={choice.cell}
              ref={at === 0 ? first : undefined}
              aria-disabled={waiting}
              onClick={() => answer({ type: 'buy', cell: choice.cell })}
              data-answer="buy"
              data-buy={choice.cell}
            >
              {/* The name is what shows, with a separator only heard: an aria-label that does not
                  contain the visible text trips axe's label-content-name-mismatch */}
              <Post>
                <span>{cell(choice.cell)}</span>
                <VisuallyHidden>{t('games.promotion.full.buy.separator')}</VisuallyHidden>
                <Price>{t('games.promotion.full.buy.price', { price: choice.price })}</Price>
              </Post>
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

/** The card's widest: an offered post's two answers, and buying office's up to eleven */
const NARROW = 560
const WIDE = 880

const overBoard = (top: boolean, wide: boolean) => `
  position: absolute;
  left: 50%;
  ${top ? 'top' : 'bottom'}: ${space.sm}px;
  z-index: 2;
  transform: translateX(-50%);
  width: min(${wide ? WIDE : NARROW}px, calc(100% - ${2 * space.sm}px));
  background: ${color.surface};
  color: ${color.text};
  border: 2px solid ${promotionBoard.gold};
  border-radius: ${radius.card}px;
  box-shadow: 0 0 0 4px ${color.bg};
`

// Never a scrollbar: what does not fit across wraps downwards
const Card = styled.section<{ $top: boolean; $wide: boolean }>`
  ${(p) => overBoard(p.$top, p.$wide)}
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.sm}px ${space.md}px;
`

const Banner = styled.p<{ $top: boolean; $wide: boolean }>`
  ${(p) => overBoard(p.$top, p.$wide)}
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

// Buying office: as many posts to a row as fit, each its name over its price, the rest on the next
// row; on a phone held upright two or three to a row rather than one
const Answers = styled.div<{ $wrap?: boolean }>`
  display: ${(p) => (p.$wrap ? 'grid' : 'flex')};
  grid-template-columns: repeat(auto-fill, minmax(min(100%, max(96px, 14%)), 1fr));
  gap: ${space.xs}px;

  & > button {
    min-height: 44px;
    ${(p) => (p.$wrap ? `padding-inline: ${space.xs}px; overflow-wrap: anywhere;` : 'flex: 1;')}
  }
`

const Post = styled.span`
  display: grid;
  justify-items: center;
  line-height: 1.15;
`

const Price = styled.span`
  font-size: ${fontSize.sm}px;
`

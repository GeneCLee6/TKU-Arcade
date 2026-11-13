import type { SeatId } from '../../../shared/games/types.ts'
import type { BluffView } from '../../../shared/games/bluff/types.ts'
import { Avatar } from '../../components/Avatar.tsx'
import { Heading, List, Row, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { seatColor } from '../../styles/tokens.ts'
import { Body, Choice, Choices, Count, Muted, Name, Pill, Tag, Top } from './bluffParts.ts'
import './messages.ts'
import { deciders } from './screenState.ts'

/** A seat to vote for or give the sticker to; `null` is "no sticker"; `undefined`, nothing picked yet */
export type Pick = SeatId | null | undefined

interface VotePanelProps {
  view: BluffView
  nameOf(seat: SeatId): string
  /** The judge, before voting */
  canVote: boolean
  /** A reader, before giving a sticker or none */
  canSticker: boolean
  picked: Pick
  onPick(pick: Pick): void
  disabled: boolean
}

/**
 * The vote: the judge picks the honest reader, every reader may give one heckle sticker. What is
 * picked here is only sent from the dock's button, so that a slip of the thumb is not a vote. Under
 * it, who has decided (never what: the view does not say until the reveal).
 */
export function VotePanel({ view, nameOf, canVote, canSticker, picked, onPick, disabled }: VotePanelProps) {
  const t = useT()
  const you = view.you
  const toggle = (pick: Pick) => {
    if (!disabled) onPick(picked === pick ? undefined : pick)
  }
  const everyone = deciders(view)

  return (
    <>
      {canVote && (
        <Section aria-labelledby="bluff-vote-heading" data-testid="vote">
          <Heading id="bluff-vote-heading">{t('games.bluff.ui.voteHeading')}</Heading>
          <Body>{t('games.bluff.ui.voteHint')}</Body>
          <Choices>
            {view.order.map((seat) => (
              <li key={seat}>
                <Choice
                  type="button"
                  aria-pressed={picked === seat}
                  aria-disabled={disabled}
                  onClick={() => toggle(seat)}
                >
                  <Avatar name={nameOf(seat)} tint={seatColor(seat)} />
                  {nameOf(seat)}
                </Choice>
              </li>
            ))}
          </Choices>
        </Section>
      )}

      {canSticker && (
        <Section aria-labelledby="bluff-sticker-heading" data-testid="sticker">
          <Heading id="bluff-sticker-heading">{t('games.bluff.ui.stickerHeading')}</Heading>
          <Body>{t('games.bluff.ui.stickerHint')}</Body>
          <Choices>
            {view.order
              .filter((seat) => seat !== you)
              .map((seat) => (
                <li key={seat}>
                  <Choice
                    type="button"
                    aria-pressed={picked === seat}
                    aria-disabled={disabled}
                    onClick={() => toggle(seat)}
                  >
                    <Avatar name={nameOf(seat)} tint={seatColor(seat)} />
                    {nameOf(seat)}
                  </Choice>
                </li>
              ))}
            <li>
              <Choice
                type="button"
                aria-pressed={picked === null}
                aria-disabled={disabled}
                onClick={() => toggle(null)}
              >
                {t('games.bluff.ui.noSticker')}
              </Choice>
            </li>
          </Choices>
        </Section>
      )}

      {you !== null && view.decided.includes(you) && <Own view={view} nameOf={nameOf} />}

      <Section aria-labelledby="bluff-decided-heading" data-testid="decided">
        <Top>
          <Heading id="bluff-decided-heading">{t('games.bluff.ui.step.voting')}</Heading>
          <Count>
            {t('games.bluff.ui.decidedCount', { done: view.decided.length, total: everyone.length })}
          </Count>
        </Top>
        <List>
          {everyone.map((seat) => {
            const name = nameOf(seat)
            const decided = view.decided.includes(seat)
            return (
              <Row key={seat} $mark={seatColor(seat)}>
                <Avatar name={name} tint={seatColor(seat)} />
                <Name>
                  {name}
                  {seat === you && <Muted> · {t('room.waiting.badge.you')}</Muted>}
                  {seat === view.judge && (
                    <Tag>
                      <span>{t('games.bluff.ui.tag.judge')}</span>
                    </Tag>
                  )}
                </Name>
                <Pill $on={decided}>
                  {t(decided ? 'games.bluff.ui.status.decided' : 'games.bluff.ui.status.deciding')}
                </Pill>
              </Row>
            )
          })}
        </List>
      </Section>
    </>
  )
}

/** What you sent, back to you: your vote, or your sticker */
function Own({ view, nameOf }: { view: BluffView; nameOf(seat: SeatId): string }) {
  const t = useT()
  if (view.role === 'judge' && view.vote !== null) {
    return <Body role="status">{t('games.bluff.ui.yourVote', { name: nameOf(view.vote) })}</Body>
  }
  if (view.sticker === undefined) return null
  return (
    <Body role="status">
      {view.sticker === null
        ? t('games.bluff.ui.yourNoSticker')
        : t('games.bluff.ui.yourSticker', { name: nameOf(view.sticker) })}
    </Body>
  )
}

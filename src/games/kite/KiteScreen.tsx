import { useEffect, useState } from 'react'
import styled, { css } from 'styled-components'
import { MAX_BURNS, MAX_NOTES } from '../../../shared/games/kite/info.ts'
import type {
  KiteAction,
  KiteRank,
  KiteSuit,
  KiteView,
  KiteViewCard,
} from '../../../shared/games/kite/types.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { EmptySlot, KiteCard } from './KiteCard.tsx'
import './messages.ts'
import {
  ALL_RANKS,
  discardsBySuit,
  faceName,
  hintChoices,
  hintTargets,
  knowsText,
  kiteColors,
  lastHinted,
  logLine,
  otherHands,
  ownHand,
  suitFill,
  suitName,
} from './screenState.ts'

/** If the room never answers a press, the buttons come back after this */
const ANSWER_WAIT_MS = 4000
/** Log lines shown before "show all" */
const LOG_SHORT = 6

type Choice = { kind: 'player'; seat: SeatId } | { kind: 'card'; id: number } | null

/**
 * 放風箏's screen (e16). Phone first: everyone else's kites are the board, read at a glance; a
 * note is two taps (a friend, then a colour or number in the dock), and a card of your own is two
 * taps too (the card, then fly it or set it aside), so that no line snaps from one stray tap. The rules
 * stay on the server: this draws `view` and sends actions.
 */
export default function KiteScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as KiteView
  const legal = game.legal as unknown as KiteAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  // A choice belongs to one turn: the next turn starts with none
  const [choiceAt, setChoiceAt] = useState<{ turn: number; choice: Choice }>({ turn: 0, choice: null })
  const choice = choiceAt.turn === view.turnNumber ? choiceAt.choice : null
  const choose = (next: Choice) => setChoiceAt({ turn: view.turnNumber, choice: next })

  // A press waits for the room's answer, so that a double tap does not play two cards
  const key = JSON.stringify([view.turnNumber, legal.length])
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: KiteAction) => {
    setAskedAt(key)
    choose(null)
    room.act(action)
  }

  const yourTurn = view.you !== null && view.you === view.current && !game.over
  const targets = hintTargets(legal)
  const mine = ownHand(view)
  const hinted = new Set(lastHinted(view))
  const canThrow = legal.some((action) => action.type === 'discard')

  const prompt = (() => {
    if (game.over) return t('games.kite.ui.prompt.over')
    if (!yourTurn) return t('games.kite.ui.prompt.turn', { name: nameOf(view.current) })
    if (choice?.kind === 'player') return t('games.kite.ui.prompt.hint', { name: nameOf(choice.seat) })
    if (choice?.kind === 'card' && mine) {
      const slot = mine.cards.findIndex((card) => card.id === choice.id) + 1
      return t('games.kite.ui.prompt.card', { slot })
    }
    return t(targets.length > 0 ? 'games.kite.ui.prompt.yours' : 'games.kite.ui.prompt.yoursNoNotes')
  })()

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={game.over ? null : view.current}
      resultUnranked
      dock={
        <DockColumn>
          <MainLine>{prompt}</MainLine>
          {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          {yourTurn && choice?.kind === 'player' && (
            <HintPad
              choices={hintChoices(legal, choice.seat)}
              suits={view.suits}
              disabled={asked}
              onSuit={(suit) => send({ type: 'hintSuit', to: choice.seat, suit })}
              onRank={(rank) => send({ type: 'hintRank', to: choice.seat, rank })}
              onCancel={() => choose(null)}
            />
          )}
          {yourTurn && choice?.kind === 'card' && (
            <Buttons>
              <Button disabled={asked} onClick={() => send({ type: 'play', card: choice.id })}>
                {t('games.kite.ui.hang')}
              </Button>
              <Button
                $variant="secondary"
                disabled={asked || !canThrow}
                onClick={() => send({ type: 'discard', card: choice.id })}
              >
                {t('games.kite.ui.throw')}
              </Button>
              <Button $variant="ghost" onClick={() => choose(null)}>
                {t('games.kite.ui.cancel')}
              </Button>
            </Buttons>
          )}
        </DockColumn>
      }
    >
      <Stage>
        <Facts view={view} />
        {game.chatLocked && <Notice role="note">{t('games.kite.ui.chatLocked')}</Notice>}
        <Strings view={view} />

        <Hands>
          {otherHands(view).map((hand) => {
            const canHint = yourTurn && targets.includes(hand.seat)
            const picked = choice?.kind === 'player' && choice.seat === hand.seat
            const name = nameOf(hand.seat)
            return (
              <HandRow key={hand.seat} $picked={picked} data-testid={`hand-${hand.seat}`}>
                <HandHead>
                  <SeatDot style={{ background: seatColor(hand.seat) }} aria-hidden="true" />
                  {canHint ? (
                    <NameButton
                      type="button"
                      aria-pressed={picked}
                      onClick={() => choose(picked ? null : { kind: 'player', seat: hand.seat })}
                    >
                      {t('games.kite.ui.noteTo', { name })}
                    </NameButton>
                  ) : (
                    <Name>{t('games.kite.ui.handOf', { name })}</Name>
                  )}
                  {hand.seat === view.current && !game.over && <TurnMark>{t('games.kite.ui.turnMark')}</TurnMark>}
                </HandHead>
                <CardRow>
                  {hand.cards.map((card, slot) => (
                    <CardItem key={card.id}>
                      <OtherCard
                        card={card}
                        slot={slot}
                        holder={name}
                        suits={view.suits}
                        marked={hinted.has(card.id)}
                      />
                    </CardItem>
                  ))}
                </CardRow>
              </HandRow>
            )
          })}

          {mine && (
            <HandRow $picked={false} $own data-testid="own-hand">
              <HandHead>
                <SeatDot style={{ background: seatColor(mine.seat) }} aria-hidden="true" />
                <Name>{t('games.kite.ui.yourHand')}</Name>
                {mine.seat === view.current && !game.over && <TurnMark>{t('games.kite.ui.yourTurnMark')}</TurnMark>}
              </HandHead>
              <SmallLine>{t('games.kite.ui.yourHandHelp')}</SmallLine>
              <CardRow>
                {mine.cards.map((card, slot) => {
                  const picked = choice?.kind === 'card' && choice.id === card.id
                  const label = t('games.kite.ui.ownCardLabel', {
                    slot: slot + 1,
                    knows: knowsText(t, card.knows, view.suits),
                  })
                  return (
                    <CardItem key={card.id}>
                      {yourTurn ? (
                        <CardButton
                          type="button"
                          aria-label={label}
                          aria-pressed={picked}
                          data-testid="own-card"
                          onClick={() => choose(picked ? null : { kind: 'card', id: card.id })}
                        >
                          <KiteCard
                            suit={null}
                            rank={null}
                            knows={card.knows}
                            suits={view.suits}
                            size="large"
                            selected={picked}
                            marked={hinted.has(card.id)}
                          />
                        </CardButton>
                      ) : (
                        <span role="img" aria-label={label} data-testid="own-card">
                          <KiteCard
                            suit={null}
                            rank={null}
                            knows={card.knows}
                            suits={view.suits}
                            size="large"
                            marked={hinted.has(card.id)}
                          />
                        </span>
                      )}
                    </CardItem>
                  )
                })}
              </CardRow>
            </HandRow>
          )}
        </Hands>

        <Lower>
          <Discards view={view} />
          <Log view={view} nameOf={nameOf} />
        </Lower>
      </Stage>
    </GameLayout>
  )
}

/** Score, notes, burns, deck, and the last round once it is on */
function Facts({ view }: { view: KiteView }) {
  const t = useT()
  return (
    <FactRow>
      <Fact $strong>
        <span>{t('games.kite.ui.score', { score: view.score, max: view.maxScore })}</span>
      </Fact>
      <Fact data-testid="notes">
        <span>{t('games.kite.ui.notes', { count: view.notes, max: MAX_NOTES })}</span>
        <Pips aria-hidden="true">
          {Array.from({ length: MAX_NOTES }, (_, index) => (
            <Pip key={index} $on={index < view.notes} />
          ))}
        </Pips>
      </Fact>
      <Fact $danger={view.burns > 0} data-testid="burns">
        <span>{t('games.kite.ui.burns', { count: view.burns, max: MAX_BURNS })}</span>
      </Fact>
      <Fact>
        <span>{t('games.kite.ui.deck', { count: view.deckCount })}</span>
      </Fact>
      {view.finalTurns !== null && view.ending === null && (
        <Fact $danger>
          <span>{t('games.kite.ui.lastRound', { count: view.finalTurns })}</span>
        </Fact>
      )}
    </FactRow>
  )
}

/** The kite trains: each colour's top kite, or an empty outline */
function Strings({ view }: { view: KiteView }) {
  const t = useT()
  return (
    <Section aria-labelledby="kite-strings">
      <SectionTitle id="kite-strings">{t('games.kite.ui.strings')}</SectionTitle>
      <StringRow data-testid="strings">
        <Wire aria-hidden="true" />
        {view.suits.map((suit) => {
          const height = view.stacks[suit] ?? 0
          return (
            <StringItem key={suit} aria-label={t('games.kite.ui.stringLabel', { suit: suitName(t, suit), height })}>
              {height === 0 ? (
                <EmptySlot suit={suit} />
              ) : (
                <KiteCard suit={suit} rank={height as KiteRank} suits={view.suits} />
              )}
              <StringName aria-hidden="true">{suitName(t, suit)}</StringName>
            </StringItem>
          )
        })}
      </StringRow>
    </Section>
  )
}

function OtherCard({
  card,
  slot,
  holder,
  suits,
  marked,
}: {
  card: KiteViewCard
  slot: number
  holder: string
  suits: readonly KiteSuit[]
  marked: boolean
}) {
  const t = useT()
  const knows = knowsText(t, card.knows, suits)
  const label =
    card.suit === null || card.rank === null
      ? t('games.kite.ui.hiddenCardLabel', { slot: slot + 1, name: holder, knows })
      : t('games.kite.ui.cardLabel', { card: faceName(t, { suit: card.suit, rank: card.rank }), name: holder, knows })
  return (
    <span role="img" aria-label={label} title={marked ? t('games.kite.ui.justHinted') : undefined}>
      <KiteCard suit={card.suit} rank={card.rank} knows={card.knows} suits={suits} marked={marked} />
    </span>
  )
}

function HintPad({
  choices,
  suits,
  disabled,
  onSuit,
  onRank,
  onCancel,
}: {
  choices: { suits: KiteSuit[]; ranks: KiteRank[] }
  suits: readonly KiteSuit[]
  disabled: boolean
  onSuit(suit: KiteSuit): void
  onRank(rank: KiteRank): void
  onCancel(): void
}) {
  const t = useT()
  return (
    <Pad data-testid="hint-pad">
      <PadRow role="group" aria-label={t('games.kite.ui.colours')}>
        {suits
          .filter((suit) => suit !== 'rainbow')
          .map((suit) => (
            <SuitButton
              key={suit}
              type="button"
              $fill={suitFill(suit)}
              disabled={disabled || !choices.suits.includes(suit)}
              aria-label={t('games.kite.ui.hintSuit', { suit: suitName(t, suit) })}
              onClick={() => onSuit(suit)}
            >
              {suitName(t, suit)}
            </SuitButton>
          ))}
      </PadRow>
      <PadRow role="group" aria-label={t('games.kite.ui.numbers')}>
        {ALL_RANKS.map((rank) => (
          <RankButton
            key={rank}
            type="button"
            disabled={disabled || !choices.ranks.includes(rank)}
            aria-label={t('games.kite.ui.hintRank', { rank })}
            onClick={() => onRank(rank)}
          >
            {rank}
          </RankButton>
        ))}
        <Button $variant="ghost" $size="sm" onClick={onCancel}>
          {t('games.kite.ui.cancel')}
        </Button>
      </PadRow>
    </Pad>
  )
}

function Discards({ view }: { view: KiteView }) {
  const t = useT()
  const groups = discardsBySuit(view)
  return (
    <Section aria-labelledby="kite-discards" data-testid="discards">
      <SectionTitle id="kite-discards">{t('games.kite.ui.discards')}</SectionTitle>
      {groups.length === 0 && <SmallLine>{t('games.kite.ui.noDiscards')}</SmallLine>}
      <DiscardList>
        {groups.map((group) => (
          <DiscardGroup key={group.suit}>
            <DiscardSuit>{suitName(t, group.suit)}</DiscardSuit>
            {group.ranks.map((rank, index) => (
              <span
                key={index}
                role="img"
                aria-label={faceName(t, { suit: group.suit, rank })}
              >
                <KiteCard suit={group.suit} rank={rank} suits={view.suits} size="small" />
              </span>
            ))}
          </DiscardGroup>
        ))}
      </DiscardList>
    </Section>
  )
}

function Log({ view, nameOf }: { view: KiteView; nameOf(seat: SeatId): string }) {
  const t = useT()
  const [all, setAll] = useState(false)
  const lines = [...view.log].reverse()
  const shown = all ? lines : lines.slice(0, LOG_SHORT)
  return (
    <Section aria-labelledby="kite-log">
      <SectionTitle id="kite-log">{t('games.kite.ui.log')}</SectionTitle>
      {lines.length === 0 && <SmallLine>{t('games.kite.ui.noLog')}</SmallLine>}
      <LogList data-testid="log">
        {shown.map((entry) => (
          <LogLine key={entry.turn} $kind={entry.kind === 'play' && !entry.ok ? 'burn' : entry.kind}>
            <TurnNo aria-hidden="true">{entry.turn}</TurnNo>
            <span>{logLine(t, entry, nameOf)}</span>
          </LogLine>
        ))}
      </LogList>
      {lines.length > LOG_SHORT && (
        <Button $variant="ghost" $size="sm" onClick={() => setAll(!all)}>
          {all ? t('games.kite.ui.showFewer') : t('games.kite.ui.showAll', { count: lines.length })}
        </Button>
      )}
    </Section>
  )
}

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
`

const FactRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Fact = styled.span<{ $strong?: boolean; $danger?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  padding: ${space.xs}px ${space.md}px;
  color: ${({ $strong }) => ($strong ? color.onAccent : color.text)};
  background: ${({ $strong }) => ($strong ? color.accent : color.raised)};
  box-shadow: ${({ $danger }) => ($danger ? `inset 3px 0 0 ${color.danger}` : 'none')};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > * {
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Pips = styled.span`
  display: inline-flex;
  gap: 2px;
`

const Pip = styled.span<{ $on: boolean }>`
  width: 6px;
  height: 10px;
  background: ${({ $on }) => ($on ? kiteColors.glow : 'transparent')};
  border: 1px solid ${color.muted};
`

const Notice = styled.p`
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.warning};
  font-size: ${fontSize.sm}px;
  font-weight: 600;
`

const Section = styled.section`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.sm}px ${space.md}px;
  min-width: 0;
`

const SectionTitle = styled.h2`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const StringRow = styled.ul`
  position: relative;
  display: flex;
  justify-content: space-around;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Wire = styled.span`
  position: absolute;
  top: 1px;
  right: 0;
  left: 0;
  height: 2px;
  background: ${kiteColors.frame};
`

const StringItem = styled.li`
  position: relative;
  display: grid;
  justify-items: center;
  gap: 2px;
`

const StringName = styled.span`
  color: ${color.muted};
  font-size: 12px;
  font-weight: 700;
`

const Hands = styled.div`
  display: grid;
  gap: ${space.sm}px;
`

const HandRow = styled.section<{ $picked: boolean; $own?: boolean }>`
  ${glass}
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.sm}px ${space.md}px;
  min-width: 0;
  ${({ $picked }) =>
    $picked &&
    css`
      box-shadow: inset 0 0 0 2px ${color.accent};
    `}
  ${({ $own }) =>
    $own &&
    css`
      border-top: 2px solid ${color.accent};
    `}
`

const HandHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
  min-width: 0;
`

const SeatDot = styled.span`
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
`

const Name = styled.span`
  font-weight: 700;
  overflow-wrap: anywhere;
`

const NameButton = styled.button`
  min-height: 36px;
  padding: ${space.xs}px ${space.md}px;
  color: ${color.text};
  background: ${color.raised};
  border: 1px solid ${color.border};
  border-radius: 4px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  overflow-wrap: anywhere;

  &:hover {
    background: ${color.raisedHover};
  }

  &[aria-pressed='true'] {
    color: ${color.onAccent};
    background: ${color.accent};
    border-color: ${color.accent};
  }
`

const TurnMark = styled.span`
  ${monoType}
  padding: 0 ${space.sm}px;
  color: ${color.onAccent};
  background: ${color.accent};
  font-size: 12px;
  font-weight: 700;
`

const CardRow = styled.ul`
  display: flex;
  flex-wrap: nowrap;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const CardItem = styled.li`
  display: block;
`

const CardButton = styled.button`
  display: block;
  padding: 0;
  color: inherit;
  background: none;
  border: 0;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${color.accent};
    outline-offset: 2px;
  }
`

const Lower = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
  gap: ${space.md}px;
`

const DiscardList = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const DiscardGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
`

const DiscardSuit = styled.span`
  min-width: 4em;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const LogList = styled.ol`
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const LogLine = styled.li<{ $kind: string }>`
  display: flex;
  gap: ${space.sm}px;
  padding: 2px ${space.sm}px;
  font-size: ${fontSize.sm}px;
  line-height: 1.4;
  box-shadow: inset 3px 0 0
    ${({ $kind }) => ($kind === 'burn' ? color.danger : $kind === 'hint' ? color.accent : color.line)};
  overflow-wrap: anywhere;
`

const TurnNo = styled.span`
  ${monoType}
  min-width: 2ch;
  color: ${color.muted};
  text-align: right;
`

const DockColumn = styled.div`
  display: grid;
  gap: ${space.sm}px;
`

const MainLine = styled.p`
  margin: 0;
  font-weight: 600;
  line-height: 1.3;
`

const SmallLine = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const Pad = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const PadRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const padButton = css`
  min-width: 44px;
  min-height: 44px;
  padding: 0 ${space.sm}px;
  border: 2px solid ${kiteColors.frame};
  border-radius: 4px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid ${color.accent};
    outline-offset: 2px;
  }
`

// Ink on rice paper, the colour as a thick band along the bottom: the text reads on every colour
const SuitButton = styled.button<{ $fill: string }>`
  ${padButton}
  flex: 1 1 0;
  color: ${kiteColors.ink};
  background: ${kiteColors.paper};
  box-shadow: inset 0 -10px 0 ${({ $fill }) => $fill};
  padding-bottom: 8px;
`

const RankButton = styled.button`
  ${padButton}
  flex: 1 1 0;
  color: ${kiteColors.ink};
  background: ${kiteColors.paper};
  font-size: ${fontSize.lg}px;
`

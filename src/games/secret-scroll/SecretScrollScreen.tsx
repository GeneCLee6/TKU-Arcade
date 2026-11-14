import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { deckList } from '../../../shared/games/secret-scroll/deck.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import type {
  ScrollAction,
  ScrollCard,
  ScrollPlayerView,
  ScrollView,
} from '../../../shared/games/secret-scroll/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import './messages.ts'
import { ScrollCardBack, ScrollCardFace } from './ScrollCardFace.tsx'
import { chosenPlay, eventLines, guessesOf, playableCards, promptOf, targetsOf } from './screenState.ts'

/** If the room never answers a press, the button comes back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 奪祕笈's screen. Phone first: your hand is two big cards under your thumb, the others are compact
 * tiles above, and the log says what happened (and what only you saw). The rules stay on the server:
 * this draws `view` and sends one of the legal moves.
 */
export default function SecretScrollScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as ScrollView
  const legal = game.legal as unknown as ScrollAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })
  const cardName = (card: ScrollCard) =>
    t('games.secret-scroll.cardLabel', { name: t(`games.secret-scroll.card.${card}`), value: card })
  const list = (items: string[]) => items.join(t('games.secret-scroll.ui.nameSeparator'))

  // The choice being made: reset whenever the moves on offer change
  const legalKey = JSON.stringify([view.round, view.events.length, legal])
  const [choice, setChoice] = useState<{
    key: string
    card: ScrollCard | null
    target: SeatId | null | undefined
    guess: ScrollCard | null
  }>({ key: legalKey, card: null, target: undefined, guess: null })
  const current = choice.key === legalKey ? choice : { key: legalKey, card: null, target: undefined, guess: null }
  const pick = (change: Partial<typeof current>) => setChoice({ ...current, ...change, key: legalKey })

  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === legalKey
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: ScrollAction) => {
    setAskedAt(legalKey)
    room.act(action)
  }

  const me = view.players.find((player) => player.seat === view.you) ?? null
  const playable = playableCards(legal)
  const myTurn = playable.length > 0
  const targets = current.card === null ? [] : targetsOf(legal, current.card)
  const aimed = targets.length === 1 && current.target === undefined ? targets[0] : current.target
  const guesses = current.card === null || aimed === undefined ? [] : guessesOf(legal, current.card, aimed)
  const action = chosenPlay(legal, current.card, current.target, current.guess)
  const canNext = legal.some((move) => move.type === 'next')
  const prompt = promptOf(view, nameOf)
  const forced = myTurn && playable.length === 1 && playable[0] === 7 && (me?.hand?.length ?? 0) === 2 &&
    me?.hand?.some((card) => card === 5 || card === 6)

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={view.phase === 'turn' ? view.current : null}
      dock={
        <DockRow>
          <DockText>
            <MainLine>{t(prompt.key, prompt.params)}</MainLine>
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
            {current.card === 8 && <Warn>{t('games.secret-scroll.ui.scrollWarning')}</Warn>}
          </DockText>
          {myTurn && (
            <Button disabled={action === null || asked} onClick={() => action && send(action)}>
              {t('games.secret-scroll.ui.play')}
            </Button>
          )}
          {canNext && (
            <Button disabled={asked} onClick={() => send({ type: 'next' })}>
              {t('games.secret-scroll.ui.next')}
            </Button>
          )}
        </DockRow>
      }
    >
      <Stage data-testid="scroll-stage">
        <Header>
          <Round>{t('games.secret-scroll.ui.round', { round: view.round })}</Round>
          <Facts>
            <Fact>
              <span>{t('games.secret-scroll.ui.goal', { goal: view.goal })}</span>
            </Fact>
            <Fact data-testid="deck-count">
              <span>{t('games.secret-scroll.ui.deck', { count: view.deckCount })}</span>
            </Fact>
            <Fact>
              <span>{t('games.secret-scroll.ui.setAside', { count: view.hiddenCount })}</span>
            </Fact>
          </Facts>
        </Header>

        {view.faceUp.length > 0 && (
          <Row role="group" aria-label={t('games.secret-scroll.ui.faceUp')}>
            <Label>{t('games.secret-scroll.ui.faceUp')}</Label>
            {view.faceUp.map((card, index) => (
              <ScrollCardFace key={index} card={card} small />
            ))}
          </Row>
        )}

        <Tiles>
          {view.players
            .filter((player) => player.seat !== view.you)
            .map((player) => (
              <PlayerTile
                key={player.seat}
                player={player}
                name={nameOf(player.seat)}
                goal={view.goal}
                turn={view.phase === 'turn' && view.current === player.seat}
              />
            ))}
        </Tiles>

        {view.lastRound !== null && view.phase !== 'turn' && (
          <RoundPanel data-testid="round-end" aria-live="polite">
            <PanelTitle>
              {t('games.secret-scroll.ui.roundWon', {
                round: view.lastRound.round,
                names: list(view.lastRound.winners.map(nameOf)),
              })}
            </PanelTitle>
            <p>{t(`games.secret-scroll.ui.reason.${view.lastRound.reason}`)}</p>
            {view.lastRound.hands.length > 1 && (
              <Row>
                <Label>{t('games.secret-scroll.ui.finalHands')}</Label>
                {view.lastRound.hands.map((hand) => (
                  <HandPair key={hand.seat}>
                    {nameOf(hand.seat)} <ScrollCardFace card={hand.card} small />
                  </HandPair>
                ))}
              </Row>
            )}
            {view.phase === 'roundEnd' && <SmallLine>{t('games.secret-scroll.ui.nextSoon')}</SmallLine>}
          </RoundPanel>
        )}

        {me !== null && (
          <HandPanel aria-labelledby="scroll-hand" data-testid="your-hand">
            <PanelTitle id="scroll-hand">
              {t('games.secret-scroll.ui.yourHand')} · {t('games.secret-scroll.ui.tokens', { tokens: me.tokens })}
            </PanelTitle>
            {me.out && view.phase === 'turn' && <p>{t('games.secret-scroll.ui.outYou')}</p>}
            <Hand>
              {(me.hand ?? []).map((card, index) => {
                const can = playable.includes(card)
                const selected = current.card === card
                return (
                  <CardButton
                    key={`${index}-${card}`}
                    type="button"
                    disabled={!can || asked}
                    aria-pressed={selected}
                    $selected={selected}
                    $dim={myTurn && !can}
                    onClick={() => pick({ card, target: undefined, guess: null })}
                    data-testid={`hand-card-${card}`}
                  >
                    <ScrollCardFace card={card} />
                  </CardButton>
                )
              })}
            </Hand>
            {myTurn && current.card === null && <SmallLine>{t('games.secret-scroll.ui.pickCard')}</SmallLine>}
            {forced && <SmallLine>{t('games.secret-scroll.ui.mustStrategist')}</SmallLine>}
            {current.card !== null && targets.length > 0 && (targets.length > 1 || targets[0] !== null) && (
              <Choices role="group" aria-label={t('games.secret-scroll.ui.pickTarget')}>
                <Label>{t('games.secret-scroll.ui.pickTarget')}</Label>
                {targets.map((target) =>
                  target === null ? null : (
                    <Chip
                      key={target}
                      type="button"
                      aria-pressed={aimed === target}
                      $on={aimed === target}
                      onClick={() => pick({ target, guess: null })}
                    >
                      {target === view.you
                        ? t('games.secret-scroll.ui.yourself', { name: nameOf(target) })
                        : nameOf(target)}
                    </Chip>
                  ),
                )}
              </Choices>
            )}
            {current.card !== null && targets.length === 1 && targets[0] === null && current.card !== 4 &&
              current.card !== 7 && current.card !== 8 && current.card !== 0 && (
                <SmallLine>{t('games.secret-scroll.ui.noTarget')}</SmallLine>
              )}
            {guesses.length > 0 && (
              <Choices role="group" aria-label={t('games.secret-scroll.ui.pickGuess')}>
                <Label>{t('games.secret-scroll.ui.pickGuess')}</Label>
                {guesses.map((guess) => (
                  <Chip
                    key={guess}
                    type="button"
                    aria-pressed={current.guess === guess}
                    $on={current.guess === guess}
                    onClick={() => pick({ target: aimed, guess })}
                  >
                    {cardName(guess)}
                  </Chip>
                ))}
              </Choices>
            )}
          </HandPanel>
        )}
        {me === null && <SmallLine>{t('games.secret-scroll.ui.spectating')}</SmallLine>}

        <LogPanel aria-labelledby="scroll-log" data-testid="scroll-log">
          <PanelTitle id="scroll-log">{t('games.secret-scroll.ui.log')}</PanelTitle>
          {view.events.length === 0 && <SmallLine>{t('games.secret-scroll.ui.logEmpty')}</SmallLine>}
          <Log>
            {[...view.events].reverse().map((event, index) =>
              eventLines(event, nameOf, cardName, list).map((line, at) => (
                <LogLine key={`${view.events.length - index}-${at}`} $mine={line.mine === true} $sub={at > 0}>
                  {t(line.key, line.params)}
                </LogLine>
              )),
            )}
          </Log>
        </LogPanel>

        <Reference>
          <summary>{t('games.secret-scroll.ui.reference')}</summary>
          <RefList>
            {deckList(view.beggars).map(([card, count]) => (
              <li key={card}>
                <ScrollCardFace card={card} small /> <Copies>{t('games.secret-scroll.ui.copies', { count })}</Copies>{' '}
                {t(`games.secret-scroll.text.${card}`)}
              </li>
            ))}
          </RefList>
        </Reference>
      </Stage>
    </GameLayout>
  )
}

function PlayerTile({
  player,
  name,
  goal,
  turn,
}: {
  player: ScrollPlayerView
  name: string
  goal: number
  turn: boolean
}) {
  const t = useT()
  return (
    <Tile $out={player.out} $turn={turn} data-testid={`tile-${player.seat}`}>
      <TileHead>
        <Dot style={{ background: seatColor(player.seat) }} aria-hidden="true" />
        <TileName>{name}</TileName>
        {turn && <Tag $tone="turn">{t('games.secret-scroll.ui.turn')}</Tag>}
        {player.out && <Tag $tone="out">{t('games.secret-scroll.ui.out')}</Tag>}
        {player.shielded && <Tag $tone="shield">{t('games.secret-scroll.ui.shielded')}</Tag>}
      </TileHead>
      <TileRow>
        <Pips role="img" aria-label={t('games.secret-scroll.ui.tokens', { tokens: player.tokens })}>
          {Array.from({ length: goal }, (_, index) => (
            <Pip key={index} $on={index < player.tokens} />
          ))}
        </Pips>
        <Backs role="img" aria-label={t('games.secret-scroll.ui.cards', { count: player.handCount })}>
          {Array.from({ length: player.handCount }, (_, index) => (
            <ScrollCardBack key={index} small />
          ))}
        </Backs>
      </TileRow>
      <Discards role="group" aria-label={t('games.secret-scroll.ui.played')}>
        {player.discards.length === 0 && <Muted>{t('games.secret-scroll.ui.nothingPlayed')}</Muted>}
        {player.discards.map((card, index) => (
          <ScrollCardFace key={index} card={card} small />
        ))}
      </Discards>
    </Tile>
  )
}

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
`

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px ${space.md}px;
`

const Round = styled.span`
  ${monoType}
  font-weight: 700;
`

const Facts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Fact = styled.span`
  padding: ${space.xs}px ${space.md}px;
  color: ${color.text};
  background: ${color.raised};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
`

const Label = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: ${space.sm}px;
`

const Tile = styled.section<{ $out: boolean; $turn: boolean }>`
  ${glass}
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.sm}px;
  opacity: ${({ $out }) => ($out ? 0.6 : 1)};
  box-shadow: ${({ $turn }) => ($turn ? `inset 0 0 0 2px ${color.accent}` : 'none')};
`

const TileHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px;
  min-width: 0;
`

const Dot = styled.span`
  flex: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
`

const TileName = styled.span`
  min-width: 0;
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Tag = styled.span<{ $tone: 'turn' | 'out' | 'shield' }>`
  padding: 0 ${space.xs}px;
  color: ${({ $tone }) => ($tone === 'turn' ? color.onAccent : color.text)};
  background: ${({ $tone }) =>
    $tone === 'turn' ? color.accent : $tone === 'out' ? color.raised : color.sunken};
  box-shadow: ${({ $tone }) => ($tone === 'shield' ? `inset 0 0 0 1px ${color.success}` : 'none')};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const TileRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const Pips = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
`

const Pip = styled.span<{ $on: boolean }>`
  width: 10px;
  height: 10px;
  background: ${({ $on }) => ($on ? color.accent : 'transparent')};
  border: 1px solid ${color.accent};
  transform: rotate(45deg);
`

const Backs = styled.span`
  display: flex;
  gap: 2px;
`

const Discards = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
`

const Muted = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const panel = `
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.md}px;
`

const HandPanel = styled.section`
  ${glass}
  ${panel}
`

const RoundPanel = styled.section`
  ${glass}
  ${panel}

  & > p {
    margin: 0;
  }
`

const LogPanel = styled.section`
  ${glass}
  ${panel}
`

const PanelTitle = styled.h2`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const Hand = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 170px));
  gap: ${space.md}px;
`

const CardButton = styled.button<{ $selected: boolean; $dim: boolean }>`
  display: block;
  padding: 0;
  background: none;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  opacity: ${({ $dim }) => ($dim ? 0.55 : 1)};
  outline: ${({ $selected }) => ($selected ? `3px solid ${color.accent}` : 'none')};
  outline-offset: 3px;
  transform: ${({ $selected }) => ($selected ? 'translateY(-6px)' : 'none')};
  transition: transform 0.15s ease;

  &:disabled {
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`

const Choices = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px;
`

const Chip = styled.button<{ $on: boolean }>`
  min-height: 36px;
  padding: ${space.xs}px ${space.md}px;
  color: ${({ $on }) => ($on ? color.onAccent : color.text)};
  background: ${({ $on }) => ($on ? color.accent : color.raised)};
  border: 1px solid ${({ $on }) => ($on ? color.accent : color.border)};
  font: inherit;
  font-weight: 700;
  cursor: pointer;

  @media (pointer: coarse) {
    min-height: 44px;
  }
`

const HandPair = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  font-weight: 600;
`

const Log = styled.ol`
  display: grid;
  gap: ${space.xs}px;
  max-height: 260px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
`

const LogLine = styled.li<{ $mine: boolean; $sub: boolean }>`
  padding: ${space.xs}px ${space.sm}px;
  padding-left: ${({ $sub }) => ($sub ? space.xl : space.sm)}px;
  background: ${({ $mine }) => ($mine ? color.sunken : 'transparent')};
  box-shadow: ${({ $mine }) => ($mine ? `inset 3px 0 0 ${color.accent}` : 'none')};
  font-size: ${fontSize.sm}px;
  font-weight: ${({ $mine }) => ($mine ? 700 : 400)};
`

const Reference = styled.details`
  ${glass}
  padding: ${space.sm}px ${space.md}px;

  & > summary {
    font-weight: 700;
    cursor: pointer;
  }
`

const RefList = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: ${space.sm}px 0 0;
  padding: 0;
  font-size: ${fontSize.sm}px;
  list-style: none;
`

const Copies = styled.span`
  ${monoType}
  font-weight: 700;
`

const DockRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px ${space.md}px;
`

const DockText = styled.div`
  flex: 1 1 12em;
  min-width: 0;
  overflow-wrap: anywhere;
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

const Warn = styled.p`
  margin: 0;
  color: ${color.danger};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { HoldemAction, HoldemCategory, HoldemStreet, HoldemView } from '../../../shared/games/holdem/types.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import type { Card } from '../../../shared/poker/hand.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { Heading } from '../../components/roomParts.ts'
import { TableCaption } from '../../components/LateParts.tsx'
import { digits, tablePanel } from '../../components/table/tableKit.ts'
import { useT } from '../../i18n/useT.ts'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { BetBar } from './BetBar.tsx'
import { HandLog } from './HandLog.tsx'
import { CardFace } from './PokerCard.tsx'
import { answerKey, categoryKey, madeHand, playerOf, promptOf, winningCards, type Names } from './screenState.ts'
import { Table } from './Table.tsx'

/** If the room never answers a press, the buttons come back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 德州撲克's screen. Phone first: the table with every seat, the board and the pot; your two cards big
 * under it; and your turn's buttons in the dock under your thumb (fold, check or call, bet or raise
 * with a slider). The hand's result, the log and the recent hands scroll below. The rules stay on the
 * server: this draws `view` and sends actions.
 */
export default function HoldemScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as HoldemView
  const legal = game.legal as unknown as HoldemAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })
  const names: Names = {
    name: nameOf,
    category: (category: HoldemCategory) => t(categoryKey(category)),
    street: (street: HoldemStreet) => t(`games.holdem.street.${street}`),
  }

  // A button waits for the room's answer, so that a double tap does not bet twice
  const key = answerKey(view)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: HoldemAction) => {
    setAskedAt(key)
    room.act(action)
  }

  const myTurn = legal.length > 0
  const toAct = view.phase.kind === 'bet' ? view.phase.toAct : null
  const prompt = promptOf(view, myTurn, names)
  const winning = winningCards(view)
  // The broadcast's caption (DESIGN §3.9): whoever is all in, then who took the pot
  const allIn = view.players.filter((player) => player.allIn && !player.folded && !player.out)
  const lastPot = view.last !== null && view.last.hand === view.hand ? view.last.pots[0] : undefined
  const caption =
    view.phase.kind === 'handEnd' && lastPot !== undefined && lastPot.winners.length > 0
      ? {
          id: `win-${view.hand}`,
          text: t('games.holdem.ui.wins', { name: nameOf(lastPot.winners[0].seat), chips: lastPot.winners[0].amount }),
          tone: 'accent' as const,
        }
      : allIn.length > 0
        ? {
            id: `allin-${view.hand}-${allIn.map((player) => player.seat).join(',')}`,
            text: `${allIn.map((player) => nameOf(player.seat)).join(' · ')} — ${t('games.holdem.ui.allIn')}`,
            tone: 'magenta' as const,
          }
        : null

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={game.over ? null : toAct}
      dock={
        <Dock>
          <MainLine data-testid="holdem-prompt">{t(prompt.key, prompt.params)}</MainLine>
          {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          {myTurn && <BetBar key={key} view={view} legal={legal} disabled={asked} onAct={send} />}
        </Dock>
      }
    >
      <Stage>
        <TableCaption id={caption?.id ?? null} text={caption?.text ?? ''} tone={caption?.tone} />
        <Table view={view} nameOf={nameOf} toAct={toAct} winning={winning} />
        <YourHand view={view} winning={winning} over={game.over} onAct={send} />
        {view.last !== null && view.last.hand === view.hand && <HandResult view={view} names={names} winning={winning} />}
        <HandLog view={view} names={names} />
        <Note>{t('games.holdem.ui.playChips')}</Note>
      </Stage>
    </GameLayout>
  )
}

/** Your two cards, big; what they make with the board; sitting out and stopping the game */
function YourHand({
  view,
  winning,
  over,
  onAct,
}: {
  view: HoldemView
  winning: ReadonlySet<Card>
  over: boolean
  onAct(action: HoldemAction): void
}) {
  const t = useT()
  const you = view.you === null ? undefined : playerOf(view, view.you)
  if (you === undefined) return null
  const made = madeHand(view)
  const live = view.players.filter((player) => !player.out)
  const voted = view.you !== null && view.endVotes.includes(view.you)
  const votes = live.filter((player) => view.endVotes.includes(player.seat)).length
  const showdown = winning.size > 0
  return (
    <Panel aria-labelledby="holdem-hand-heading" data-testid="your-hand">
      <Heading id="holdem-hand-heading">{t('games.holdem.ui.yourCards')}</Heading>
      <HandRow>
        {view.hole.length === 2 && !you.out ? (
          <Hole $folded={you.folded}>
            {view.hole.map((card) => (
              <CardFace key={card} card={card} size="large" win={winning.has(card)} dim={showdown && !winning.has(card)} />
            ))}
          </Hole>
        ) : (
          <Muted>{t('games.holdem.ui.noCards')}</Muted>
        )}
        <Facts>
          <Chips data-testid="your-stack">{t('games.holdem.ui.yourStack', { chips: you.stack })}</Chips>
          {made !== null && !you.folded && (
            <span data-testid="your-made">{t('games.holdem.ui.youHave', { hand: t(categoryKey(made.category)) })}</span>
          )}
          {you.folded && <Muted>{t('games.holdem.ui.folded')}</Muted>}
        </Facts>
      </HandRow>
      {!you.out && !over && (
        <Controls>
          <Button $variant="secondary" $size="sm" onClick={() => onAct({ type: 'away', away: !you.away })}>
            {you.away ? t('games.holdem.ui.comeBack') : t('games.holdem.ui.sitOut')}
          </Button>
          <Button $variant="ghost" $size="sm" aria-pressed={voted} onClick={() => onAct({ type: 'endVote', on: !voted })}>
            {voted ? t('games.holdem.ui.unstopVote') : t('games.holdem.ui.stopVote')}
          </Button>
        </Controls>
      )}
      {votes > 0 && !over && <Muted>{t('games.holdem.ui.stopVotes', { votes, players: live.length })}</Muted>}
      {view.nextBlinds !== null && !over && (
        <Muted data-testid="blinds-up">
          {t('games.holdem.ui.blindsUp', { level: view.level, hand: view.nextBlinds.hand, sb: view.nextBlinds.sb, bb: view.nextBlinds.bb })}
        </Muted>
      )}
    </Panel>
  )
}

/** How the hand ended: each pot and who took it, the hands shown with their best five lit up */
function HandResult({ view, names, winning }: { view: HoldemView; names: Names; winning: ReadonlySet<Card> }) {
  const t = useT()
  const last = view.last
  if (last === null) return null
  const mucked = last.mucked.map((seat) => names.name(seat))
  return (
    <ResultPanel aria-labelledby="holdem-result-heading" data-testid="hand-result">
      <Heading id="holdem-result-heading">{t('games.holdem.ui.result', { hand: last.hand })}</Heading>
      {!last.showdown ? (
        <Big>{t('games.holdem.ui.winsFold', { name: names.name(last.pots[0].winners[0].seat), chips: last.pots[0].amount })}</Big>
      ) : (
        <>
          {last.pots.map((pot, index) => (
            <PotLine key={index}>
              <PotName>
                {index === 0
                  ? t('games.holdem.ui.mainPot', { chips: pot.amount })
                  : t('games.holdem.ui.sidePot', { n: index, chips: pot.amount })}
              </PotName>
              <Big>
                {pot.winners.map((win) => t('games.holdem.ui.wins', { name: names.name(win.seat), chips: win.amount })).join(' · ')}
                {pot.category !== null && <HandName> {t('games.holdem.ui.withHand', { hand: names.category(pot.category) })}</HandName>}
              </Big>
            </PotLine>
          ))}
          <Shown>
            {last.shown.map((one) => (
              <li key={one.seat}>
                <span>{t('games.holdem.ui.shows', { name: names.name(one.seat), hand: names.category(one.category) })}</span>
                <Cards>
                  {one.hole.map((card) => (
                    <CardFace key={card} card={card} size="small" win={winning.has(card)} />
                  ))}
                </Cards>
              </li>
            ))}
          </Shown>
          {mucked.length > 0 && <Muted>{t('games.holdem.ui.mucked', { names: mucked.join(', ') })}</Muted>}
        </>
      )}
    </ResultPanel>
  )
}

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
`

const Panel = styled.section`
  ${tablePanel}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.md}px ${space.lg}px;
`

const ResultPanel = styled(Panel)`
  box-shadow: inset 4px 0 0 ${color.accent};

  &::before {
    box-shadow:
      inset 0 0 0 1px ${color.line},
      inset 0 3px 0 ${color.accent};
  }
`

const HandRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.md}px;
`

const Hole = styled.div<{ $folded: boolean }>`
  display: flex;
  gap: ${space.sm}px;
  opacity: ${(p) => (p.$folded ? 0.5 : 1)};
`

const Facts = styled.div`
  display: grid;
  gap: 2px;
  font-weight: 700;
`

const Chips = styled.span`
  ${digits}
  font-size: ${fontSize.lg}px;
`

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const Muted = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Note = styled(Muted)`
  text-align: center;
`

const PotLine = styled.div`
  display: grid;
  gap: 2px;
`

const PotName = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Big = styled.p`
  margin: 0;
  font-size: ${fontSize.lg}px;
  font-weight: 800;
  overflow-wrap: anywhere;
`

const HandName = styled.span`
  color: ${color.accent};
`

const Shown = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;

  & > li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${space.sm}px;
  }
`

const Cards = styled.span`
  display: inline-flex;
  gap: 3px;
`

const Dock = styled.div`
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

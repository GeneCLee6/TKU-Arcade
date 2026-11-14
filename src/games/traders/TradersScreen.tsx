import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { RoomMember } from '../../../shared/protocol.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import type { TradersAction, TradersMoveView, TradersView } from '../../../shared/games/traders/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { Market } from './Market.tsx'
import './messages.ts'
import { Cost } from './pieces.tsx'
import { answerKey, findCard, isLegal, mine, netCost, NOTHING, promptOf, takeOf, tapGood, type Selection } from './screenState.ts'
import { MyStock, Rivals } from './Stock.tsx'
import { Wharf } from './Wharf.tsx'

/** If the room never answers a press, the buttons come back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 滬尾商行's screen. Phone first: the market, the wharf, your stock and your rivals stack in one
 * column, and the move you are building (goods picked, a card or a deck) is confirmed in the dock
 * under the thumb. A button is enabled only for a move the room listed in `legal`, so an illegal
 * move is never sent; the rules stay on the server.
 */
export default function TradersScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const language = useLanguage()
  const view = game.view as unknown as TradersView
  const legal = game.legal as unknown as TradersAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  // A pick belongs to one turn: a new turn (or phase) starts with nothing picked
  const key = answerKey(view, legal)
  const [picked, setPicked] = useState<{ key: string; selection: Selection }>({ key, selection: NOTHING })
  const selection = picked.key === key ? picked.selection : NOTHING
  const select = (next: Selection) => setPicked({ key, selection: next })

  // A button waits for the room's answer, so that a double tap does not send twice
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: TradersAction) => {
    if (!isLegal(legal, action)) return
    setAskedAt(key)
    room.act(action)
  }

  const me = mine(view)
  const yourTurn = !game.over && view.you !== null && view.turn === view.you
  const active = yourTurn && view.phase === 'play' && !asked
  const returning = yourTurn && view.phase === 'return' && !asked
  const prompt = promptOf(view, legal, selection, nameOf)

  const take = selection.kind === 'goods' ? takeOf(selection.goods) : null
  const card = selection.kind === 'card' ? findCard(view, selection.id) : null
  const buy: TradersAction | null = card === null ? null : { type: 'buy', card: card.id }
  const reserve: TradersAction | null = card === null ? null : { type: 'reserve', card: card.id }
  const reserveTop: TradersAction | null = selection.kind === 'deck' ? { type: 'reserveTop', tier: selection.tier } : null
  const pass: TradersAction = { type: 'pass' }

  const seatDetail = (member: RoomMember) => {
    const player = view.players.find((other) => other.seat === member.seat)
    return player ? t('games.traders.ui.points', { points: player.points }) : null
  }
  const others = view.players.filter((player) => player.seat !== view.you)

  return (
    <GameLayout
      room={room}
      seatTint
      seatDetail={seatDetail}
      turnSeat={game.over ? null : view.turn}
      dock={
        <DockRow>
          <DockText>
            <MainLine>{t(prompt.key, prompt.params)}</MainLine>
            {card !== null && me !== null && (
              <SmallLine>
                <span>{t(`games.traders.card.${card.tier}.${card.bonus}`)} · </span>
                <span>{t('games.traders.ui.youPay')}</span>
                <InlineCost>
                  {netCost(card, me.bonuses).some((value) => value > 0) ? (
                    <Cost cost={netCost(card, me.bonuses)} size={18} />
                  ) : (
                    <span>{t('games.traders.ui.free')}</span>
                  )}
                </InlineCost>
              </SmallLine>
            )}
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          </DockText>
          <Buttons>
            {selection.kind === 'goods' && (
              <>
                <Button $variant="secondary" onClick={() => select(NOTHING)}>
                  {t('games.traders.ui.clear')}
                </Button>
                <Button disabled={!active || !isLegal(legal, take)} onClick={() => take && send(take)}>
                  {t('games.traders.ui.take')}
                </Button>
              </>
            )}
            {card !== null && (
              <>
                <Button $variant="secondary" disabled={!active || !isLegal(legal, reserve)} onClick={() => reserve && send(reserve)}>
                  {t('games.traders.ui.reserve')}
                </Button>
                <Button disabled={!active || !isLegal(legal, buy)} onClick={() => buy && send(buy)}>
                  {t('games.traders.ui.buy')}
                </Button>
              </>
            )}
            {selection.kind === 'deck' && (
              <>
                <Button $variant="secondary" onClick={() => select(NOTHING)}>
                  {t('games.traders.ui.cancel')}
                </Button>
                <Button disabled={!active || !isLegal(legal, reserveTop)} onClick={() => reserveTop && send(reserveTop)}>
                  {t('games.traders.ui.reserveTop')}
                </Button>
              </>
            )}
            {active && isLegal(legal, pass) && <Button onClick={() => send(pass)}>{t('games.traders.ui.pass')}</Button>}
          </Buttons>
        </DockRow>
      }
    >
      <Stage>
        <Header>
          <Round>{t('games.traders.ui.round', { round: view.round })}</Round>
          {view.finalRound && !game.over ? (
            <Final role="status">{t('games.traders.ui.finalRound', { target: view.target })}</Final>
          ) : (
            <Target>{t('games.traders.ui.target', { target: view.target })}</Target>
          )}
        </Header>
        {view.last !== null && (
          <Last role="status" data-testid="last-move">
            {lastLines(view.last, nameOf, t, language).join(' ')}
          </Last>
        )}
        <Market view={view} selection={selection} active={active} onSelect={select} />
        <Wharf view={view} selection={selection} active={active} onTap={(good) => select(tapGood(selection, good))} />
        {me !== null && (
          <MyStock
            player={me}
            returning={returning}
            selection={selection}
            active={active}
            onSelect={select}
            onReturn={(good) => send({ type: 'return', good })}
          />
        )}
        <Rivals players={others} turn={view.turn} nameOf={nameOf} />
      </Stage>
    </GameLayout>
  )
}

type Translate = ReturnType<typeof useT>

/** The last turn in words: the move, what went back, the patron who came */
function lastLines(last: TradersMoveView, nameOf: (seat: SeatId) => string, t: Translate, language: string): string[] {
  const name = nameOf(last.seat)
  const goods = (list: readonly number[]) => list.map((good) => t(`games.traders.good.${good}`)).join(t('games.traders.ui.separator'))
  const cardName = last.card === null ? '' : t(`games.traders.card.${last.card.tier}.${last.card.bonus}`)
  const lines: string[] = []
  switch (last.kind) {
    case 'take':
      lines.push(t('games.traders.ui.last.take', { name, goods: goods(last.taken) }))
      break
    case 'double':
      lines.push(t('games.traders.ui.last.double', { name, good: goods([last.taken[0]]) }))
      break
    case 'reserve':
      lines.push(t('games.traders.ui.last.reserve', { name, card: cardName }))
      break
    case 'reserveTop':
      lines.push(t('games.traders.ui.last.reserveTop', { name, tier: t(`games.traders.tier.${last.tier ?? 1}`) }))
      break
    case 'buy':
      lines.push(t('games.traders.ui.last.buy', { name, card: cardName }))
      break
    case 'pass':
      lines.push(t('games.traders.ui.last.pass', { name }))
      break
    case 'skip':
      lines.push(t('games.traders.ui.last.skip', { name }))
      break
  }
  if (last.returned !== null) {
    const back = last.returned.flatMap((count, good) => Array<number>(count).fill(good))
    if (back.length > 0) lines.push(t('games.traders.ui.last.returned', { goods: goods(back) }))
  }
  if (last.patron !== null) {
    lines.push(t('games.traders.ui.last.patron', { name, patron: language === 'zh-TW' ? last.patron.zh : last.patron.en }))
  }
  return lines
}

// The cards are phone-sized: on a wide screen the column stays narrow enough to read as a table
const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.lg}px;
  max-width: 640px;
`

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.xs}px ${space.md}px;
`

const Round = styled.span`
  ${monoType}
  font-weight: 700;
`

const Target = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 600;
`

const Final = styled.span`
  padding: 2px ${space.sm}px;
  color: ${color.onAccent};
  background: ${color.accent};
  border-radius: 3px;
  font-size: ${fontSize.sm}px;
  font-weight: 800;
`

const Last = styled.p`
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 600;
  line-height: 1.4;
`

const DockRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px ${space.md}px;
`

const DockText = styled.div`
  flex: 1 1 14em;
  min-width: 0;
  overflow-wrap: anywhere;
`

const Buttons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const MainLine = styled.p`
  margin: 0;
  font-weight: 600;
  line-height: 1.3;
`

const SmallLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin: 2px 0 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

const InlineCost = styled.span`
  display: inline-flex;
  margin-left: ${space.xs}px;
`

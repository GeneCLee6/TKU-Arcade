import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { WasabiAction, WasabiPlayerView, WasabiView } from '../../../shared/games/wasabi/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { Dumpling } from './Dumpling.tsx'
import './messages.ts'
import { dumpling } from './palette.ts'
import { promptOf, roundLines } from './screenState.ts'

/** If the room never answers a press, the buttons come back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 芥末餃子's screen: a steamer per player round the table, the bid ladder, and your own hand under
 * your thumb. Eaten dumplings flip face up. The rules stay on the server: this draws `view` and
 * sends one of the legal moves.
 */
export default function WasabiScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as WasabiView
  const legal = game.legal as unknown as WasabiAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  const key = JSON.stringify([view.phase, view.round, view.current, view.bid, view.bites.length, legal])
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: WasabiAction) => {
    setAskedAt(key)
    room.act(action)
  }

  const find = <T extends WasabiAction['type']>(type: T, test: (action: Extract<WasabiAction, { type: T }>) => boolean = () => true) =>
    legal.find((action): action is Extract<WasabiAction, { type: T }> => action.type === type && test(action as Extract<WasabiAction, { type: T }>))

  const me = view.players.find((player) => player.seat === view.you) ?? null
  const prompt = promptOf(view, legal, nameOf)
  const bids = legal.filter((action): action is Extract<WasabiAction, { type: 'bid' }> => action.type === 'bid')
  const takes = legal.filter((action) => action.type === 'take') as Extract<WasabiAction, { type: 'take' }>[]
  const placePlain = find('place', (action) => action.disc === 'plain')
  const placeWasabi = find('place', (action) => action.disc === 'wasabi')
  const pass = find('pass')
  const next = find('next')
  const discardPlain = find('discard', (action) => action.disc === 'plain')
  const discardWasabi = find('discard', (action) => action.disc === 'wasabi')
  const handPlain = me && me.plain !== null ? me.plain - me.stack.filter((disc) => disc === 'plain').length : 0
  const handWasabi = me && me.wasabi !== null ? me.wasabi - me.stack.filter((disc) => disc === 'wasabi').length : 0
  const showLadder = view.phase !== 'opening'
  const lines = view.phase === 'roundEnd' || view.phase === 'over' ? roundLines(view, nameOf) : []

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={view.phase === 'opening' || view.phase === 'roundEnd' || game.over ? null : view.current}
      dock={
        <DockRow>
          <DockText>
            <MainLine>{t(prompt.key, prompt.params)}</MainLine>
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          </DockText>
          <Buttons>
            {placePlain && (
              <Button disabled={asked} onClick={() => send(placePlain)}>
                {t('games.wasabi.ui.placePlain')}
              </Button>
            )}
            {placeWasabi && (
              <Button $variant="secondary" disabled={asked} onClick={() => send(placeWasabi)}>
                {t('games.wasabi.ui.placeWasabi')}
              </Button>
            )}
            {pass && (
              <Button $variant="secondary" disabled={asked} onClick={() => send(pass)}>
                {t('games.wasabi.ui.pass')}
              </Button>
            )}
            {next && (
              <Button disabled={asked} onClick={() => send(next)}>
                {t('games.wasabi.ui.next')}
              </Button>
            )}
          </Buttons>
        </DockRow>
      }
    >
      <Stage>
        <Header>
          <Round>{t('games.wasabi.ui.round', { round: view.round })}</Round>
          <Facts>
            <Fact>
              <span>{t('games.wasabi.ui.goal', { goal: view.goal })}</span>
            </Fact>
            <Fact data-testid="on-table">
              <span>{t('games.wasabi.ui.onTable', { count: view.total })}</span>
            </Fact>
            {view.phase === 'eating' && (
              <Fact>
                <span>{t('games.wasabi.ui.eaten', { done: view.bites.length, bid: view.bid })}</span>
              </Fact>
            )}
          </Facts>
        </Header>

        {lines.length > 0 && (
          <RoundPanel data-testid="round-end" aria-live="polite">
            {lines.map((line, index) => (
              <p key={index}>{t(line.key, line.params)}</p>
            ))}
            {view.phase === 'roundEnd' && <SmallLine>{t('games.wasabi.ui.nextSoon')}</SmallLine>}
          </RoundPanel>
        )}

        <Table role="group" aria-label={t('games.wasabi.ui.table')} data-testid="table">
          {view.players.map((player) => {
            const eat = find('eat', (action) => action.seat === player.seat)
            return (
              <Steamer
                key={player.seat}
                player={player}
                view={view}
                name={nameOf(player.seat)}
                you={player.seat === view.you}
                onEat={eat && !asked ? () => send(eat) : null}
              />
            )
          })}
        </Table>

        {showLadder && (
          <LadderPanel aria-labelledby="wasabi-ladder" data-testid="ladder">
            <PanelTitle id="wasabi-ladder">{t('games.wasabi.ui.ladder')}</PanelTitle>
            <SmallLine>
              {view.bidder === null
                ? t('games.wasabi.ui.noBid')
                : t('games.wasabi.ui.bidBy', { name: nameOf(view.bidder), count: view.bid })}
            </SmallLine>
            <Ladder>
              {Array.from({ length: view.total }, (_, index) => index + 1).map((count) => {
                const bid = bids.find((action) => action.count === count)
                const height = 28 + Math.round((count / Math.max(1, view.total)) * 36)
                return (
                  <li key={count}>
                    <Rung
                      type="button"
                      disabled={bid === undefined || asked}
                      $current={count === view.bid}
                      $below={count < view.bid}
                      $open={bid !== undefined}
                      style={{ height }}
                      aria-label={t('games.wasabi.ui.bidCount', { count })}
                      aria-current={count === view.bid ? 'true' : undefined}
                      onClick={() => bid && send(bid)}
                    >
                      {count}
                    </Rung>
                  </li>
                )
              })}
            </Ladder>
          </LadderPanel>
        )}

        {me !== null && !me.out && (
          <HandPanel aria-labelledby="wasabi-hand" data-testid="your-hand">
            <PanelTitle id="wasabi-hand">{t('games.wasabi.ui.yourHand')}</PanelTitle>
            {handPlain + handWasabi === 0 ? (
              <SmallLine>{t('games.wasabi.ui.handEmpty')}</SmallLine>
            ) : (
              <HandRow>
                {Array.from({ length: handPlain }, (_, index) => (
                  <HandDisc key={`p${index}`}>
                    <Dumpling disc="plain" open={false} label={t('games.wasabi.ui.plain')} />
                  </HandDisc>
                ))}
                {Array.from({ length: handWasabi }, (_, index) => (
                  <HandDisc key={`w${index}`}>
                    <Dumpling disc="wasabi" open={false} label={t('games.wasabi.ui.wasabi')} />
                  </HandDisc>
                ))}
                <SmallLine>{t('games.wasabi.ui.handCounts', { plain: handPlain, wasabi: handWasabi })}</SmallLine>
              </HandRow>
            )}
            {takes.length > 0 && (
              <>
                <SmallLine>{t('games.wasabi.ui.takeHelp', { name: nameOf(view.bidder as SeatId) })}</SmallLine>
                <HandRow role="group" aria-label={t('games.wasabi.ui.take')}>
                  {takes.map((action) => (
                    <TakeButton
                      key={action.index}
                      type="button"
                      disabled={asked}
                      onClick={() => send(action)}
                      aria-label={t('games.wasabi.ui.takeOne', { n: action.index + 1 })}
                      data-testid="take"
                    >
                      <Dumpling disc={null} open={false} label="" />
                    </TakeButton>
                  ))}
                </HandRow>
              </>
            )}
            {(discardPlain || discardWasabi) && (
              <>
                <SmallLine>{t('games.wasabi.ui.discardHelp')}</SmallLine>
                <Buttons>
                  {discardPlain && (
                    <Button $variant="secondary" disabled={asked} onClick={() => send(discardPlain)}>
                      {t('games.wasabi.ui.discardPlain')}
                    </Button>
                  )}
                  {discardWasabi && (
                    <Button $variant="secondary" disabled={asked} onClick={() => send(discardWasabi)}>
                      {t('games.wasabi.ui.discardWasabi')}
                    </Button>
                  )}
                </Buttons>
              </>
            )}
          </HandPanel>
        )}
        {me !== null && me.out && <SmallLine>{t('games.wasabi.ui.outYou')}</SmallLine>}
        {me === null && <SmallLine>{t('games.wasabi.ui.spectating')}</SmallLine>}
      </Stage>
    </GameLayout>
  )
}

function Steamer({
  player,
  view,
  name,
  you,
  onEat,
}: {
  player: WasabiPlayerView
  view: WasabiView
  name: string
  you: boolean
  onEat: (() => void) | null
}) {
  const t = useT()
  const turn = view.phase !== 'opening' && view.phase !== 'roundEnd' && view.phase !== 'over' && view.current === player.seat
  const tags: string[] = []
  if (player.out) tags.push(t('games.wasabi.ui.out'))
  else {
    if (view.bidder === player.seat) tags.push(t('games.wasabi.ui.bidder'))
    if (view.phase === 'bidding' && player.passed) tags.push(t('games.wasabi.ui.passed'))
    if (view.phase === 'opening') tags.push(t(player.placed ? 'games.wasabi.ui.ready' : 'games.wasabi.ui.thinking'))
  }
  const firstOpen = player.stack.length - player.eaten
  const body = (
    <>
      <SteamerHead>
        <Dot style={{ background: seatColor(player.seat) }} aria-hidden="true" />
        <SteamerName>{you ? t('games.wasabi.ui.ownSteamer', { name }) : name}</SteamerName>
      </SteamerHead>
      <Tags>
        {tags.map((tag) => (
          <Tag key={tag}>{tag}</Tag>
        ))}
      </Tags>
      <Basket role="group" aria-label={t('games.wasabi.ui.steamer', { name, count: player.stack.length })}>
        {/* Top of the stack first */}
        {player.stack
          .map((disc, index) => ({ disc, index }))
          .reverse()
          .map(({ disc, index }) => {
            const open = index >= firstOpen
            return (
              <StackDisc key={index} data-testid={`disc-${player.seat}-${index}`}>
                <Dumpling
                  disc={disc}
                  open={open}
                  label={t(
                    disc === null
                      ? 'games.wasabi.ui.hidden'
                      : disc === 'wasabi'
                        ? 'games.wasabi.ui.wasabi'
                        : 'games.wasabi.ui.plain',
                  )}
                />
              </StackDisc>
            )
          })}
      </Basket>
      <SteamerFoot>
        <Chopsticks role="img" aria-label={t('games.wasabi.ui.points', { points: player.points })}>
          {Array.from({ length: view.goal }, (_, index) => (
            <Chopstick key={index} $on={index < player.points} />
          ))}
        </Chopsticks>
        <Owned>{t('games.wasabi.ui.owned', { count: player.owned })}</Owned>
      </SteamerFoot>
    </>
  )
  return (
    <SteamerBox $turn={turn} $out={player.out} data-testid={`steamer-${player.seat}`}>
      {onEat ? (
        <EatButton type="button" onClick={onEat} aria-label={t('games.wasabi.ui.eatHere', { name })}>
          {body}
        </EatButton>
      ) : (
        body
      )}
    </SteamerBox>
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

const Table = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: ${space.sm}px;
`

const SteamerBox = styled.section<{ $turn: boolean; $out: boolean }>`
  ${glass}
  display: grid;
  padding: ${space.sm}px;
  opacity: ${({ $out }) => ($out ? 0.55 : 1)};
  box-shadow: ${({ $turn }) => ($turn ? `inset 0 0 0 2px ${color.accent}` : 'none')};
`

const EatButton = styled.button`
  display: grid;
  gap: ${space.xs}px;
  padding: 0;
  color: inherit;
  background: none;
  border: 0;
  font: inherit;
  text-align: inherit;
  cursor: pointer;
  outline: 2px dashed ${color.accent};
  outline-offset: 2px;
`

const SteamerHead = styled.div`
  display: flex;
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

const SteamerName = styled.span`
  min-width: 0;
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Tags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
  min-height: 20px;
`

const Tag = styled.span`
  padding: 0 ${space.xs}px;
  background: ${color.raised};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Basket = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  gap: 2px;
  min-height: 112px;
  margin: ${space.xs}px 0;
  padding: ${space.sm}px ${space.md}px;
  background: repeating-linear-gradient(90deg, ${dumpling.steamer} 0 6px, ${dumpling.steamerDeep} 6px 7px);
  border: 3px solid ${dumpling.steamerDeep};
  border-radius: 10px 10px 40% 40% / 10px 10px 18px 18px;
  perspective: 300px;
`

const StackDisc = styled.div`
  width: 64px;
`

const SteamerFoot = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.xs}px;
`

const Chopsticks = styled.span`
  display: flex;
  gap: 3px;
`

const Chopstick = styled.span<{ $on: boolean }>`
  width: 5px;
  height: 20px;
  background: ${({ $on }) => ($on ? color.gamePromotion : 'transparent')};
  border: 1px solid ${({ $on }) => ($on ? color.gamePromotion : color.border)};
  border-radius: 2px 2px 1px 1px;
`

const Owned = styled.span`
  ${monoType}
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  letter-spacing: 0;
  white-space: nowrap;
`

const panel = `
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.md}px;
`

const LadderPanel = styled.section`
  ${glass}
  ${panel}
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
    font-weight: 700;
  }
`

const PanelTitle = styled.h2`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const Ladder = styled.ol`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Rung = styled.button<{ $current: boolean; $below: boolean; $open: boolean }>`
  ${monoType}
  min-width: 40px;
  padding: 0 ${space.xs}px;
  color: ${({ $current }) => ($current ? color.onAccent : color.text)};
  background: ${({ $current, $open }) => ($current ? color.accent : $open ? color.raisedHover : color.sunken)};
  border: 1px solid ${({ $open, $current }) => ($open || $current ? color.accent : color.line)};
  font-weight: 700;
  opacity: ${({ $below }) => ($below ? 0.45 : 1)};
  cursor: ${({ $open }) => ($open ? 'pointer' : 'default')};

  &:disabled {
    cursor: default;
  }
`

const HandRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
`

const HandDisc = styled.span`
  width: 56px;
`

const TakeButton = styled.button`
  width: 64px;
  min-height: 44px;
  padding: ${space.xs}px;
  background: ${color.raised};
  border: 1px solid ${color.accent};
  cursor: pointer;
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

const SmallLine = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  line-height: 1.3;
`

import { useEffect, useState } from 'react'
import styled, { keyframes } from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { LanternAction, LanternHow, LanternView } from '../../../shared/games/lantern/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { Lantern, type LanternLook } from './Lantern.tsx'
import './messages.ts'
import { answerKey, moonVotes, newsLines, promptOf, unlit } from './screenState.ts'

/** If the room never answers a press, the button comes back after this */
const ANSWER_WAIT_MS = 4000

const HOW_LOOK: Record<LanternHow, LanternLook> = { lit: 'lit', early: 'early', burned: 'burned', moon: 'moon' }

/**
 * 宮燈點點's screen. Phone first, and all about timing: who still holds how many lanterns, the
 * avenue so far, your own lanterns, and one big button under the thumb that lights your lowest. The
 * rules stay on the server: this draws `view` and sends actions.
 */
export default function LanternScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as LanternView
  const legal = game.legal as unknown as LanternAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  // A button waits for the room's answer, so that a double tap does not light two lanterns
  const key = answerKey(view)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: LanternAction) => {
    setAskedAt(key)
    room.act(action)
  }

  const lightAction = legal.find((action) => action.type === 'light')
  const moonAction = legal.find((action) => action.type === 'moon')
  const readyAction = legal.find((action) => action.type === 'ready')
  const prompt = promptOf(view)
  const votes = moonVotes(view)
  const top = view.pile.at(-1)
  const lines = newsLines(t, view.news, nameOf)

  return (
    <GameLayout
      room={room}
      seatTint
      resultUnranked
      dock={
        <Dock>
          <MainLine>{prompt.count === undefined ? t(prompt.key) : t(prompt.key, { count: prompt.count })}</MainLine>
          {readyAction && (
            <BigButton disabled={asked} onClick={() => send({ type: 'ready' })}>
              {t('games.lantern.ui.raiseHand')}
            </BigButton>
          )}
          {lightAction?.type === 'light' && (
            <BigButton disabled={asked} onClick={() => send(lightAction)} data-testid="light">
              {t('games.lantern.ui.light', { card: lightAction.card })}
            </BigButton>
          )}
          {moonAction?.type === 'moon' && (
            <Button
              $variant="secondary"
              aria-pressed={!moonAction.on}
              aria-describedby="lantern-moon-help"
              disabled={asked}
              onClick={() => send(moonAction)}
            >
              {t(moonAction.on ? 'games.lantern.ui.moonOn' : 'games.lantern.ui.moonOff', {
                votes,
                players: view.players.length,
              })}
            </Button>
          )}
          {moonAction && <SmallLine id="lantern-moon-help">{t('games.lantern.ui.moonHelp')}</SmallLine>}
          {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
        </Dock>
      }
    >
      <Stage data-phase={view.phase}>
        <Header>
          <Level>{t('games.lantern.ui.level', { level: view.level, levels: view.totalLevels })}</Level>
          <Facts>
            <Fact data-testid="matches">
              <span>{t('games.lantern.ui.matches', { count: view.lives })}</span>
            </Fact>
            <Fact data-testid="moons">
              <span>{t('games.lantern.ui.moons', { count: view.moons })}</span>
            </Fact>
            <Fact>
              <span>{t('games.lantern.ui.unlit', { count: unlit(view) })}</span>
            </Fact>
            {view.reward !== null && view.phase !== 'over' && (
              <Fact>
                <span>
                  {t(view.reward === 'life' ? 'games.lantern.ui.reward.life' : 'games.lantern.ui.reward.moon')}
                </span>
              </Fact>
            )}
          </Facts>
        </Header>

        {game.chatLocked && <Notice role="note">{t('games.lantern.ui.noTalking')}</Notice>}

        <News role="status" data-testid="news">
          {lines.length > 0 && (
            <NewsCard key={view.newsId} $bad={view.news.some((item) => item.kind === 'early')}>
              {lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </NewsCard>
          )}
        </News>

        {view.phase === 'focus' && (
          <Panel aria-labelledby="lantern-focus">
            <h2 id="lantern-focus">{t('games.lantern.ui.focusTitle', { level: view.level })}</h2>
            <Muted>{t('games.lantern.ui.focusHelp')}</Muted>
          </Panel>
        )}

        <Panel aria-labelledby="lantern-hand" data-testid="hand">
          <h2 id="lantern-hand">{t('games.lantern.ui.yourHand')}</h2>
          {view.hand === null && <Muted>{t('games.lantern.ui.spectator')}</Muted>}
          {view.hand !== null && view.hand.length === 0 && view.phase !== 'over' && (
            <Muted>{t('games.lantern.ui.handEmpty')}</Muted>
          )}
          {view.hand !== null && view.hand.length > 0 && (
            <Row>
              {view.hand.map((card, index) => (
                <li key={card}>
                  <Lantern $look={index === 0 ? 'next' : 'dark'} data-testid="hand-lantern">
                    {card}
                  </Lantern>
                  {index === 0 && <Under>{t('games.lantern.ui.lowest')}</Under>}
                </li>
              ))}
            </Row>
          )}
        </Panel>

        <Panel aria-labelledby="lantern-avenue" data-testid="avenue">
          <h2 id="lantern-avenue">{t('games.lantern.ui.avenue')}</h2>
          {top === undefined ? (
            <Muted>{t('games.lantern.ui.avenueEmpty')}</Muted>
          ) : (
            <AvenueTop>
              <Lantern $look={HOW_LOOK[top.how]} $size="lg" data-testid="top-lantern">
                {top.card}
              </Lantern>
              <Muted>{t('games.lantern.ui.lastLit')}</Muted>
            </AvenueTop>
          )}
          {view.pile.length > 0 && (
            <Row aria-label={t('games.lantern.ui.avenue')}>
              {view.pile.map((entry) => (
                <li key={entry.card}>
                  <Lantern
                    $look={HOW_LOOK[entry.how]}
                    $size="sm"
                    aria-label={t(`games.lantern.ui.how.${entry.how}`, { card: entry.card, name: nameOf(entry.seat) })}
                  >
                    {entry.card}
                  </Lantern>
                </li>
              ))}
            </Row>
          )}
        </Panel>

        <Panel aria-labelledby="lantern-table">
          <h2 id="lantern-table">{t('games.lantern.ui.table')}</h2>
          <Seats>
            {view.players.map((player) => (
              <SeatRow key={player.seat} data-testid={`seat-${player.seat}`} $you={player.seat === view.you}>
                <Dot style={{ background: seatColor(player.seat) }} aria-hidden="true" />
                <SeatName>{nameOf(player.seat)}</SeatName>
                <Pips aria-hidden="true">
                  {Array.from({ length: Math.min(player.count, 12) }, (_, index) => (
                    <Pip key={index} />
                  ))}
                </Pips>
                <Count>{t('games.lantern.ui.holds', { count: player.count })}</Count>
                {view.phase === 'focus' && (
                  <Tag $on={player.ready}>
                    {t(player.ready ? 'games.lantern.ui.handUp' : 'games.lantern.ui.focusing')}
                  </Tag>
                )}
                {view.phase === 'play' && player.moonVote && <Tag $on>{t('games.lantern.ui.wantsMoon')}</Tag>}
              </SeatRow>
            ))}
          </Seats>
        </Panel>

        {view.leftover !== null && view.leftover.length > 0 && (
          <Panel aria-labelledby="lantern-leftover">
            <h2 id="lantern-leftover">{t('games.lantern.ui.leftover')}</h2>
            <Row>
              {view.leftover.flatMap(({ seat, cards }) =>
                cards.map((card) => (
                  <li key={card}>
                    <Lantern $look="dark" $size="sm" aria-label={t('games.lantern.ui.cardOf', { card, name: nameOf(seat) })}>
                      {card}
                    </Lantern>
                  </li>
                )),
              )}
            </Row>
          </Panel>
        )}
      </Stage>
    </GameLayout>
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

const Level = styled.span`
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

const Notice = styled.p`
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.warning};
  font-weight: 600;
`

const News = styled.div`
  &:empty {
    display: none;
  }
`

const flash = keyframes`
  from {
    transform: scale(1.04);
  }

  to {
    transform: none;
  }
`

const NewsCard = styled.div<{ $bad: boolean }>`
  padding: ${space.sm}px ${space.md}px;
  background: ${color.surface};
  box-shadow: inset 4px 0 0 ${(p) => (p.$bad ? color.danger : color.accent)};
  font-weight: 700;
  animation: ${flash} 0.35s ease-out;

  & > p {
    margin: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

const Panel = styled.section`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.md}px;

  & > h2 {
    margin: 0;
    color: ${color.muted};
    font-size: ${fontSize.sm}px;
    font-weight: 700;
  }
`

const Muted = styled.p`
  margin: 0;
  color: ${color.muted};
`

const AvenueTop = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
  padding: ${space.sm}px 0;
`

const Row = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.md}px ${space.sm}px;
  margin: 0;
  padding: 6px 0;
  list-style: none;

  & > li {
    display: grid;
    justify-items: center;
    gap: 6px;
  }
`

const Under = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Seats = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const SeatRow = styled.li<{ $you: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  padding: ${space.xs}px ${space.sm}px;
  background: ${color.sunken};
  box-shadow: ${(p) => (p.$you ? `inset 3px 0 0 ${color.accent}` : 'none')};
`

const Dot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: 50%;
`

const SeatName = styled.span`
  flex: 1 1 6em;
  min-width: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const Pips = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  max-width: 120px;
`

const Pip = styled.span`
  width: 7px;
  height: 10px;
  border-radius: 45%;
  background: ${color.accent};
`

const Count = styled.span`
  ${monoType}
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Tag = styled.span<{ $on: boolean }>`
  padding: 0 ${space.sm}px;
  color: ${(p) => (p.$on ? color.onAccent : color.muted)};
  background: ${(p) => (p.$on ? color.accent : color.raised)};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
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

// The one button the game is about: as big as the dock allows
const BigButton = styled(Button)`
  width: 100%;
  min-height: 64px;
  font-size: ${fontSize.xl}px;
`

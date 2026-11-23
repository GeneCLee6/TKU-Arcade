import styled from 'styled-components'
import type { HoldemPublicPlayer, HoldemView } from '../../../shared/games/holdem/types.ts'
import type { SeatId } from '../../../shared/games/types.ts'
import type { Card } from '../../../shared/poker/hand.ts'
import { useT } from '../../i18n/useT.ts'
import { digits, mix, turnGlow } from '../../components/table/tableKit.ts'
import { clippedFill, monoType, slantClip } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import { CardBack, CardFace, CardSlot } from './PokerCard.tsx'
import { seatSpots } from './screenState.ts'

const BOARD_SIZE = 5

/**
 * The felt, drawn in CSS: every seat round an oval with its stack, its bet in front of it and the
 * dealer button, the board and the pot in the middle. You sit at the bottom; your own two cards are
 * drawn big under the table, not here.
 */
export function Table({
  view,
  nameOf,
  toAct,
  winning,
}: {
  view: HoldemView
  nameOf(seat: SeatId): string
  toAct: SeatId | null
  winning: ReadonlySet<Card>
}) {
  const t = useT()
  const spots = seatSpots(
    view.players.map((player) => player.seat),
    view.you,
  )
  const showdown = winning.size > 0
  // Between hands the chips have gone to the winners: show what the pot was
  const pot =
    view.phase.kind === 'handEnd' && view.last !== null
      ? view.last.pots.reduce((sum, one) => sum + one.amount, 0)
      : view.pot
  const slots = Array.from({ length: BOARD_SIZE - view.board.length }, (_, index) => index)
  return (
    <Felt aria-labelledby="holdem-table-heading" data-testid="table">
      <Hidden id="holdem-table-heading">{t('games.holdem.ui.table')}</Hidden>
      <Middle>
        <Board data-testid="board">
          {view.board.map((card) => (
            <CardFace key={card} card={card} win={winning.has(card)} dim={showdown && !winning.has(card)} />
          ))}
          {slots.map((slot) => (
            <CardSlot key={slot} $size="medium" aria-hidden="true" />
          ))}
        </Board>
        <Pot data-testid="pot">{t('games.holdem.ui.pot', { chips: pot })}</Pot>
        <Blinds>{t('games.holdem.ui.blinds', { hand: view.hand, sb: view.sb, bb: view.bb })}</Blinds>
      </Middle>
      {spots.map((spot) => {
        const player = view.players.find((one) => one.seat === spot.seat) as HoldemPublicPlayer
        return (
          <SeatSpot key={spot.seat} style={{ left: `${spot.x}%`, top: `${spot.y}%` }}>
            <SeatBox
              player={player}
              name={nameOf(player.seat)}
              you={player.seat === view.you}
              turn={toAct === player.seat}
              badge={
                player.seat === view.button
                  ? null
                  : player.seat === view.sbSeat && view.phase.kind === 'bet'
                    ? t('games.holdem.ui.sb')
                    : player.seat === view.bbSeat && view.phase.kind === 'bet'
                      ? t('games.holdem.ui.bb')
                      : null
              }
              winning={winning}
            />
          </SeatSpot>
        )
      })}
      {spots.map((spot) => {
        const player = view.players.find((one) => one.seat === spot.seat) as HoldemPublicPlayer
        return (
          <Fragmentless key={`bet-${spot.seat}`}>
            {player.bet > 0 && (
              <BetSpot style={{ left: `${spot.betX}%`, top: `${spot.betY}%` }} data-testid={`bet-${spot.seat}`}>
                <Chip aria-hidden="true" />
                <span>{player.bet}</span>
              </BetSpot>
            )}
            {player.seat === view.button && (
              <Dealer
                style={{ left: `${spot.buttonX}%`, top: `${spot.buttonY}%` }}
                role="img"
                aria-label={t('games.holdem.ui.buttonName')}
              >
                {t('games.holdem.ui.button')}
              </Dealer>
            )}
          </Fragmentless>
        )
      })}
    </Felt>
  )
}

function SeatBox({
  player,
  name,
  you,
  turn,
  badge,
  winning,
}: {
  player: HoldemPublicPlayer
  name: string
  you: boolean
  turn: boolean
  badge: string | null
  winning: ReadonlySet<Card>
}) {
  const t = useT()
  const status = player.out
    ? t('games.holdem.ui.out')
    : player.folded
      ? t('games.holdem.ui.folded')
      : player.allIn
        ? t('games.holdem.ui.allIn')
        : player.away
          ? t('games.holdem.ui.away')
          : null
  return (
    <Box
      $turn={turn}
      $you={you}
      $faded={player.out || player.folded}
      data-testid={`seat-${player.seat}`}
      aria-current={turn ? 'step' : undefined}
      style={{ ['--seat' as string]: seatColor(player.seat) }}
    >
      <Name>
        <Dot style={{ background: seatColor(player.seat) }} aria-hidden="true" />
        <NameText>{name}</NameText>
      </Name>
      <Stack>{player.out ? status : player.stack}</Stack>
      <Holes data-holes="">
        {player.shown.length > 0
          ? player.shown.map((card) => <CardFace key={card} card={card} size="tiny" win={winning.has(card)} />)
          : player.inHand && !you && (
              <>
                <CardBack size="tiny" />
                <CardBack size="tiny" />
              </>
            )}
        {badge !== null && <Badge>{badge}</Badge>}
      </Holes>
      {status !== null && !player.out && <Status data-status="">{status}</Status>}
    </Box>
  )
}

const Fragmentless = styled.div`
  display: contents;
`

const Hidden = styled.h2`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  margin: 0;
`

const Felt = styled.section`
  position: relative;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  aspect-ratio: 3 / 4;
  border-radius: 50% / 42%;
  /* The felt under a broadcast's lights (DESIGN §3.9): a spot from above, a fine weave, a dark edge */
  background:
    radial-gradient(ellipse at 50% 30%, ${mix(color.onFelt, 12)}, transparent 55%),
    repeating-linear-gradient(45deg, ${mix(color.onFelt, 3)} 0 1px, transparent 1px 6px),
    radial-gradient(ellipse at 50% 40%, ${color.feltClimbing} -60%, ${color.feltPlain} 70%);
  box-shadow:
    inset 0 0 0 6px ${color.chipInk},
    inset 0 0 0 9px ${color.chipFace},
    inset 0 0 60px ${mix(color.chipInk, 55)},
    0 0 0 1px ${mix(color.accent, 50)},
    0 0 36px ${mix(color.accent, 22)};
  color: ${color.onFelt};

  @media (min-width: 720px) {
    aspect-ratio: 16 / 10;
    border-radius: 50%;
  }
`

const Middle = styled.div`
  position: absolute;
  left: 50%;
  top: 46%;
  transform: translate(-50%, -50%);
  display: grid;
  justify-items: center;
  gap: ${space.xs}px;
`

const Board = styled.div`
  display: flex;
  gap: 4px;
`

// The pot: a slanted plate, a broadcast's score
const Pot = styled.p`
  ${clippedFill(slantClip(8), color.chipInk)}
  ${digits}
  margin: 0;
  padding: 2px ${space.lg}px;
  color: ${color.chipFace};
  font-size: ${fontSize.md}px;

  &::before {
    box-shadow: inset 0 -2px 0 ${color.chipFace};
  }
`

const Blinds = styled.p`
  margin: 0;
  font-size: 12px;
  opacity: 0.85;
  white-space: nowrap;
`

const SeatSpot = styled.div`
  position: absolute;
  transform: translate(-50%, -50%);
  z-index: 1;
`

const Box = styled.div<{ $turn: boolean; $you: boolean; $faded: boolean }>`
  display: grid;
  justify-items: center;
  width: 70px;
  padding: 3px 4px;
  /* A nameplate: the seat's colour along the top, the game's hue round whoever is to act */
  border-radius: 2px;
  /* Plain surface under the words: a folded seat's faded text keeps its contrast */
  background: ${color.surface};
  color: ${color.text};
  border: 2px solid ${(p) => (p.$you ? color.brand : color.line)};
  border-top: 3px solid var(--seat);
  ${(p) => (p.$turn ? turnGlow : '')}
  /* Folded or out: the seat's words fade, never cards it shows (2026-11-23: a shown 10 of diamonds in a
     faded seat was 1.9:1 against the dimmed card, axe serious in the phone sweep), nor the word that
     says why (a faded muted "Folded" was 3.75:1) */
  & > :not([data-holes], [data-status]) {
    opacity: ${(p) => (p.$faded ? 0.6 : 1)};
  }
  font-size: 12px;
  line-height: 1.2;

  @media (min-width: 720px) {
    width: 96px;
    font-size: ${fontSize.sm}px;
  }
`

const Name = styled.span`
  display: flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  font-weight: 700;
`

// Two lines at most (2026-11-23): a phone's 70 px seat cut "Heron (CPU)" to "Heron (C", the
// computer's tag lost; a long name still ends in an ellipsis on its second line
const NameText = styled.span`
  display: -webkit-box;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  text-align: center;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
`

const Dot = styled.span`
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
`

const Stack = styled.span`
  ${digits}
`

const Holes = styled.span`
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 4px;
`

const Badge = styled.span`
  margin-left: 2px;
  padding: 0 3px;
  border-radius: 3px;
  background: ${color.raised};
  font-size: 10px;
  font-weight: 800;
`

const Status = styled.span`
  color: ${color.muted};
  font-size: 11px;
  font-weight: 700;
`

const BetSpot = styled.div`
  ${monoType}
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 800;
  color: ${color.onFelt};
  z-index: 2;
`

const Chip = styled.span`
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: ${color.chipFace};
  border: 3px dashed ${color.chipInk};
`

const Dealer = styled.span`
  position: absolute;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: ${color.cardFace};
  color: ${color.cardInk};
  font-size: 11px;
  font-weight: 900;
  box-shadow: 0 1px 3px ${color.overlay};
  z-index: 2;
`

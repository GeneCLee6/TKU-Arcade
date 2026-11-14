import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import type { WbAction, WbView } from '../../../shared/games/word-bridge/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { useT } from '../../i18n/useT.ts'
import { monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import { ClueForm } from './ClueForm.tsx'
import { ClueLog } from './ClueLog.tsx'
import { Grid } from './Grid.tsx'
import './messages.ts'
import { answerKey, cellLooks, clueCount, giverOf, picksLeft, promptOf } from './screenState.ts'
import { Setup } from './Setup.tsx'

/** If the room never answers a press, the buttons come back after this */
const ANSWER_WAIT_MS = 4000

/**
 * 搭橋's screen. Phone first: the grid fills the width, five words a row; the clue-giver types in a
 * form above it, and the pickers select a word and turn it from the dock under the thumb. The rules
 * stay on the server: this draws `view` and sends actions.
 */
export default function WordBridgeScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as WbView
  const legal = game.legal as unknown as WbAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  const key = answerKey(view, legal)
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])
  const send = (action: WbAction) => {
    setAskedAt(key)
    room.act(action)
  }

  const pickable = useMemo(
    () => new Set(legal.flatMap((action) => (action.type === 'pick' ? [action.index] : []))),
    [legal],
  )
  const [selectedAt, setSelectedAt] = useState<{ index: number; key: string } | null>(null)
  const selected = selectedAt !== null && selectedAt.key === key && pickable.has(selectedAt.index) ? selectedAt.index : null
  const canStop = legal.some((action) => action.type === 'stop')
  const canClue = legal.some((action) => action.type === 'clue')

  const prompt = promptOf(view, legal, nameOf)
  const giver = giverOf(view)
  const left = picksLeft(view)
  const sideNames: [string, string] | undefined =
    view.mode === 'duo' ? [nameOf(view.holders[0]), nameOf(view.holders[1])] : undefined
  const open = view.words.filter((_, index) =>
    view.mode === 'teams' ? !view.revealed[index] : !view.found[index],
  )
  const turnSeat = game.over ? null : view.phase === 'clue' ? giver : null

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={turnSeat}
      resultUnranked={view.mode === 'duo'}
      dock={
        <DockRow>
          <DockText>
            <MainLine>{t(prompt.key, prompt.params)}</MainLine>
            {left !== null && <SmallLine>{t('games.word-bridge.ui.picksLeft', { count: left })}</SmallLine>}
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          </DockText>
          <Buttons>
            {canStop && (
              <Button $variant="secondary" disabled={asked} onClick={() => send({ type: 'stop' })}>
                {t('games.word-bridge.ui.stop')}
              </Button>
            )}
            {pickable.size > 0 && (
              <Button
                disabled={asked || selected === null}
                onClick={() => selected !== null && send({ type: 'pick', index: selected })}
              >
                {selected === null
                  ? t('games.word-bridge.ui.selectFirst')
                  : t('games.word-bridge.ui.turn', { word: view.words[selected] })}
              </Button>
            )}
          </Buttons>
        </DockRow>
      }
    >
      <Stage>
        <Header>
          <Title>{t(view.mode === 'teams' ? 'games.word-bridge.ui.modeTeams' : 'games.word-bridge.ui.modeDuo')}</Title>
          {view.phase !== 'setup' && <Score view={view} />}
        </Header>

        {view.phase === 'setup' && (
          <Setup view={view} legal={legal} nameOf={nameOf} disabled={asked} send={send} />
        )}

        {view.phase !== 'setup' && (
          <>
            <RoleLine view={view} nameOf={nameOf} />
            {view.clue !== null && view.phase === 'guess' && (
              <ClueBanner data-testid="clue-banner">
                <ClueWord>{view.clue.text}</ClueWord>
                <ClueNumber>{t(clueCount(view.clue.count).key, clueCount(view.clue.count).params)}</ClueNumber>
                {giver !== null && <ClueBy>{t('games.word-bridge.ui.clueBy', { name: nameOf(giver) })}</ClueBy>}
              </ClueBanner>
            )}
            <Grid
              words={view.words}
              looks={cellLooks(view)}
              pickable={pickable}
              selected={selected}
              onSelect={(index) => setSelectedAt(selected === index ? null : { index, key })}
              sideNames={sideNames}
            />
            {canClue && (
              <ClueForm
                key={view.turn}
                open={open}
                disabled={asked}
                onSend={(text, count) => send({ type: 'clue', text, count })}
              />
            )}
            <ClueLog view={view} nameOf={nameOf} />
          </>
        )}
      </Stage>
    </GameLayout>
  )
}

/** What is left: each partnership's words, or co-op's words and clues */
function Score({ view }: { view: WbView }) {
  const t = useT()
  if (view.mode === 'teams') {
    return (
      <Facts data-testid="wb-score">
        <Fact $color={color.seat1}>
          <span>{t('games.word-bridge.ui.left', { team: t('games.word-bridge.ui.team.ns'), count: view.left.ns })}</span>
        </Fact>
        <Fact $color={color.seat0}>
          <span>{t('games.word-bridge.ui.left', { team: t('games.word-bridge.ui.team.ew'), count: view.left.ew })}</span>
        </Fact>
      </Facts>
    )
  }
  return (
    <Facts data-testid="wb-score">
      <Fact $color={color.seat2}>
        <span>{t('games.word-bridge.ui.duoLeft', { count: view.left })}</span>
      </Fact>
      <Fact $color={color.border}>
        <span>{t('games.word-bridge.ui.turnsLeft', { count: Math.max(0, view.turnsLeft) })}</span>
      </Fact>
    </Facts>
  )
}

/** Who you are this game and whose turn it is */
function RoleLine({ view, nameOf }: { view: WbView; nameOf(seat: SeatId): string }) {
  const t = useT()
  if (view.mode === 'teams') {
    const team = view.yourTeam
    const you =
      team === null
        ? t('games.word-bridge.ui.youWatch')
        : t(view.role === 'giver' ? 'games.word-bridge.ui.youGiver' : 'games.word-bridge.ui.youPicker', {
            team: t(`games.word-bridge.ui.team.${team}`),
          })
    return (
      <Line>
        <span>{you}</span>
        {view.phase !== 'over' && (
          <Turn $color={view.active === 'ns' ? color.seat1 : color.seat0}>
            {t('games.word-bridge.ui.turnOf', { team: t(`games.word-bridge.ui.team.${view.active}`) })}
          </Turn>
        )}
      </Line>
    )
  }
  const side = view.yourSide
  return (
    <Line>
      <span>
        {side === null
          ? t(view.you === null ? 'games.word-bridge.ui.youWatch' : 'games.word-bridge.ui.youDuoPicker')
          : t('games.word-bridge.ui.youHolder', { side: side === 0 ? 'A' : 'B' })}
      </span>
      <span>
        {t('games.word-bridge.ui.holders', { a: nameOf(view.holders[0]), b: nameOf(view.holders[1]) })}
      </span>
    </Line>
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

const Title = styled.span`
  ${monoType}
  font-weight: 700;
`

const Facts = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Fact = styled.span<{ $color: string }>`
  padding: ${space.xs}px ${space.md}px;
  color: ${color.text};
  background: ${color.raised};
  box-shadow: inset 4px 0 0 ${(p) => p.$color};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Line = styled.p`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: ${space.xs}px ${space.md}px;
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 600;
`

const Turn = styled.span<{ $color: string }>`
  padding: 0 ${space.sm}px;
  color: ${color.onSeat};
  background: ${(p) => p.$color};
`

const ClueBanner = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${space.xs}px ${space.md}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.accent};
`

const ClueWord = styled.strong`
  font-size: ${fontSize.xl}px;
  overflow-wrap: anywhere;
`

const ClueNumber = styled.span`
  ${monoType}
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  color: ${color.accent};
`

const ClueBy = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
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

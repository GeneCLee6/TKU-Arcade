import { useEffect, useState, type DragEvent } from 'react'
import styled, { css } from 'styled-components'
import type { SeatId } from '../../../shared/games/types.ts'
import { checkTurn, displayOrder, isValidSet, openingPoints, OPENING_POINTS } from '../../../shared/games/tiles/tiles.ts'
import type { TileId, TilesAction, TilesView, TileTable } from '../../../shared/games/tiles/types.ts'
import { Button } from '../../components/Button.tsx'
import { GameLayout } from '../../components/GameLayout.tsx'
import { SegmentedSwitch } from '../../components/SegmentedSwitch.tsx'
import { useT } from '../../i18n/useT.ts'
import { monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, seatColor, space } from '../../styles/tokens.ts'
import type { GameScreenProps } from '../screens.ts'
import './messages.ts'
import { RoundScore } from './RoundScore.tsx'
import {
  canPick,
  canTarget,
  eventOf,
  laidThisTurn,
  moveTiles,
  promptOf,
  rackLeft,
  sortRack,
  turnKey,
  type MoveTarget,
  type RackSort,
} from './screenState.ts'
import { TileFace } from './Tile.tsx'

/** If the room never answers a press, the button comes back after this */
const ANSWER_WAIT_MS = 4000

/** What a drag carries: the tiles, as JSON */
const DRAG_TYPE = 'text/plain'

/** This turn's draft as this screen has it, ahead of the room's echo, and how to undo it */
type Local = { key: string; draft: TileTable; undo: TileTable[] }

const sameTable = (a: TileTable, b: TileTable) => JSON.stringify(a) === JSON.stringify(b)

/**
 * 社辦牌陣's screen. Phone first: the table's sets wrap down the page, your rack is under them, and
 * what to press is in the dock. Tap tiles to select them (from the rack or, once you have opened,
 * from the table), then tap a set's "+" or "New set" to put them there; on a computer they can be
 * dragged too. Every move is sent as the whole draft, so everyone sees the table change as it
 * happens; the server checks the draft's tiles on every move and its sets when you press Done.
 */
export default function TilesScreen({ room, game }: GameScreenProps) {
  const t = useT()
  const view = game.view as unknown as TilesView
  const legal = game.legal as unknown as TilesAction[]

  const members = Object.values(room.view.members)
  const nameOf = (seat: SeatId) =>
    members.find((member) => member.seat === seat)?.name ?? t('room.waiting.seat', { seat: seat + 1 })

  const key = turnKey(view)
  const myTurn = view.phase === 'play' && view.you !== null && view.you === view.turn && !game.over
  const mine = view.seats.find((seat) => seat.seat === view.you)
  const melded = mine?.melded ?? false
  const start = view.table

  const [local, setLocal] = useState<Local | null>(null)
  const [selection, setSelection] = useState<{ key: string; tiles: TileId[] }>({ key, tiles: [] })
  const [sort, setSort] = useState<RackSort>('number')

  const table = myTurn && local?.key === key ? local.draft : (view.draft ?? view.table)
  const fresh = laidThisTurn(table, start)
  const rack = view.rack === null ? null : sortRack(rackLeft(view.rack, table), sort)
  const selected = selection.key === key && myTurn ? selection.tiles : []

  // A press waits for the room's answer, so that a double tap does not draw twice
  const [askedAt, setAskedAt] = useState<string | null>(null)
  const asked = askedAt === key
  useEffect(() => {
    if (!asked) return undefined
    const timer = setTimeout(() => setAskedAt(null), ANSWER_WAIT_MS)
    return () => clearTimeout(timer)
  }, [asked])

  const can = (type: TilesAction['type']) => legal.some((action) => action.type === type)
  const send = (action: TilesAction) => room.act(action)

  /** A new draft: kept here at once, sent to the room, the one before it kept for undo */
  const arrange = (draft: TileTable) => {
    if (sameTable(draft, table)) return
    const undo = [...(local?.key === key ? local.undo : []), table]
    setLocal({ key, draft, undo })
    send(sameTable(draft, start) ? { type: 'reset' } : { type: 'arrange', sets: draft })
  }

  const pick = (tile: TileId) => {
    if (!myTurn) return
    const tiles = selected.includes(tile) ? selected.filter((other) => other !== tile) : [...selected, tile]
    setSelection({ key, tiles })
  }

  const place = (target: MoveTarget, tiles: readonly TileId[] = selected) => {
    if (!myTurn || tiles.length === 0) return
    if (typeof target === 'number' && !canTarget(table[target] ?? [], start, melded)) return
    arrange(moveTiles(table, start, tiles, target))
    setSelection({ key, tiles: [] })
  }

  const undo = () => {
    if (local?.key !== key || local.undo.length === 0) return
    const previous = local.undo[local.undo.length - 1]
    setLocal({ key, draft: previous, undo: local.undo.slice(0, -1) })
    send(sameTable(previous, start) ? { type: 'reset' } : { type: 'arrange', sets: previous })
    setSelection({ key, tiles: [] })
  }

  const reset = () => {
    setLocal({ key, draft: start, undo: [] })
    setSelection({ key, tiles: [] })
    send({ type: 'reset' })
  }

  const finish = (action: TilesAction) => {
    setAskedAt(key)
    send(action)
  }

  // Dragging, where the browser has it: the dragged tile, with the rest of the selection if it is in it
  const dragStart = (tile: TileId) => (event: DragEvent) => {
    const tiles = selected.includes(tile) ? selected : [tile]
    setSelection({ key, tiles })
    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(tiles))
    event.dataTransfer.effectAllowed = 'move'
  }
  const dropOn = (target: MoveTarget) => ({
    onDragOver: (event: DragEvent) => {
      if (myTurn) event.preventDefault()
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      try {
        const tiles: unknown = JSON.parse(event.dataTransfer.getData(DRAG_TYPE))
        if (Array.isArray(tiles) && tiles.every((tile) => Number.isInteger(tile))) place(target, tiles as TileId[])
      } catch {
        // Something else was dropped here
      }
    },
  })

  const check = myTurn && view.rack !== null ? checkTurn(start, table, view.rack, melded) : null
  // The first play's points have a line of their own
  const problem = check !== null && !check.ok && fresh.size > 0 && check.problem !== 'openingLow' ? check.problem : null
  const prompt = promptOf(view, nameOf)
  const event = eventOf(view, nameOf)
  const lastRound = view.phase !== 'play' ? view.history.at(-1) : undefined
  const undoable = local?.key === key && local.undo.length > 0

  return (
    <GameLayout
      room={room}
      seatTint
      turnSeat={view.phase === 'play' && !game.over ? view.turn : null}
      seatDetail={(member) => {
        const seat = view.seats.find((entry) => entry.seat === member.seat)
        return seat ? t('games.tiles.ui.seat.tiles', { count: seat.tiles }) : null
      }}
      dock={
        <DockRow>
          <DockText>
            <MainLine>{prompt.name === undefined ? t(prompt.key) : t(prompt.key, { name: prompt.name })}</MainLine>
            {view.you === null && !game.over && <SmallLine>{t('room.spectating')}</SmallLine>}
          </DockText>
          <Buttons>
            {myTurn && (
              <>
                <Button $variant="ghost" $size="sm" disabled={!undoable || asked} onClick={undo}>
                  {t('games.tiles.ui.undo')}
                </Button>
                <Button $variant="secondary" $size="sm" disabled={fresh.size === 0 && view.draft === null && !undoable} onClick={reset}>
                  {t('games.tiles.ui.reset')}
                </Button>
                <Button $variant="secondary" disabled={asked || !can('draw')} onClick={() => finish({ type: 'draw' })}>
                  {view.pool > 0 ? t('games.tiles.ui.draw') : t('games.tiles.ui.pass')}
                </Button>
                <Button disabled={asked || check === null || !check.ok} onClick={() => finish({ type: 'commit', sets: table })}>
                  {t('games.tiles.ui.done')}
                </Button>
              </>
            )}
            {can('next') && (
              <Button disabled={asked} onClick={() => finish({ type: 'next' })}>
                {t('games.tiles.ui.scored.next')}
              </Button>
            )}
          </Buttons>
        </DockRow>
      }
    >
      <Stage data-testid="tiles-stage">
        <Header>
          <Round>{t('games.tiles.ui.round', { round: view.round, rounds: view.totalRounds })}</Round>
          <Fact data-testid="pool">
            <span>
              {view.pool > 0
                ? t('games.tiles.ui.pool', { count: view.pool })
                : t('games.tiles.ui.poolEmpty', { passes: view.passes, players: view.players.length })}
            </span>
          </Fact>
        </Header>
        <SeatStrip>
          {view.seats.map((seat) => (
            <SeatChip key={seat.seat} $mark={seatColor(seat.seat)} $turn={view.phase === 'play' && seat.seat === view.turn}>
              <SeatName>{nameOf(seat.seat)}</SeatName>
              <SeatFacts>
                {t('games.tiles.ui.seat.tiles', { count: seat.tiles })}
                {seat.melded && ` · ${t('games.tiles.ui.seat.opened')}`}
                {view.totalRounds > 1 && ` · ${t('games.tiles.ui.seat.score', { score: seat.score })}`}
              </SeatFacts>
            </SeatChip>
          ))}
        </SeatStrip>
        {event && (
          <EventLine role="status" data-testid="event">
            {t(event.key, event.params)}
          </EventLine>
        )}
        {lastRound && <RoundScore view={view} round={lastRound} nameOf={nameOf} />}

        <TableArea aria-label={t('games.tiles.ui.table')} data-testid="table">
          {table.length === 0 && !myTurn && <Empty>{t('games.tiles.ui.tableEmpty')}</Empty>}
          {table.map((set, index) => {
            const valid = isValidSet(set)
            const target = myTurn && selected.length > 0 && canTarget(set, start, melded)
            const label = valid
              ? t('games.tiles.ui.set', { number: index + 1 })
              : t('games.tiles.ui.setInvalid', { number: index + 1 })
            return (
              <SetBox
                key={index}
                role="group"
                aria-label={label}
                data-testid="table-set"
                data-valid={valid}
                $invalid={!valid}
                $target={target}
                onClick={target ? () => place(index) : undefined}
                {...dropOn(index)}
              >
                {displayOrder(set).map((tile) => (
                  <TileFace
                    key={tile}
                    tile={tile}
                    fresh={fresh.has(tile)}
                    selected={selected.includes(tile)}
                    onPick={myTurn && canPick(tile, start, melded) ? () => pick(tile) : undefined}
                    onDragStart={myTurn && canPick(tile, start, melded) ? dragStart(tile) : undefined}
                  />
                ))}
                {target && (
                  <PutHere
                    type="button"
                    aria-label={t('games.tiles.ui.putHere', { number: index + 1 })}
                    onClick={(event) => {
                      event.stopPropagation()
                      place(index)
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </PutHere>
                )}
              </SetBox>
            )
          })}
          {myTurn && (
            <NewSet
              type="button"
              data-testid="new-set"
              disabled={selected.length === 0}
              onClick={() => place('new')}
              {...dropOn('new')}
            >
              <strong>{t('games.tiles.ui.newSet')}</strong>
              <small>{t('games.tiles.ui.newSetHint')}</small>
            </NewSet>
          )}
        </TableArea>

        {myTurn && (
          <TurnStatus data-testid="turn-status">
            {!melded && (
              <StatusItem $ok={openingPoints(start, table) >= OPENING_POINTS}>
                {t('games.tiles.ui.opening', { points: openingPoints(start, table) })}
              </StatusItem>
            )}
            {problem !== null && <StatusItem $ok={false}>{t(`games.tiles.error.${problem}`)}</StatusItem>}
          </TurnStatus>
        )}

        {rack !== null && view.phase === 'play' && (
          <RackArea aria-labelledby="tiles-rack-heading" data-testid="rack" {...dropOn('rack')}>
            <RackHeader>
              <RackTitle id="tiles-rack-heading">{t('games.tiles.ui.rack')}</RackTitle>
              <SegmentedSwitch<RackSort>
                label={t('games.tiles.ui.sort')}
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'number', label: t('games.tiles.ui.sortNumber') },
                  { value: 'suit', label: t('games.tiles.ui.sortSuit') },
                ]}
              />
            </RackHeader>
            <RackTiles>
              {rack.length === 0 && <Empty>{t('games.tiles.ui.rackEmpty')}</Empty>}
              {rack.map((tile) => (
                <TileFace
                  key={tile}
                  tile={tile}
                  selected={selected.includes(tile)}
                  onPick={myTurn ? () => pick(tile) : undefined}
                  onDragStart={myTurn ? dragStart(tile) : undefined}
                />
              ))}
            </RackTiles>
            {myTurn && selected.length > 0 && (
              <SelectionRow>
                <span>{t('games.tiles.ui.selected', { count: selected.length })}</span>
                {selected.some((tile) => fresh.has(tile)) && (
                  <Button $variant="secondary" $size="sm" onClick={() => place('rack')}>
                    {t('games.tiles.ui.toRack')}
                  </Button>
                )}
                <Button $variant="ghost" $size="sm" onClick={() => setSelection({ key, tiles: [] })}>
                  {t('games.tiles.ui.clear')}
                </Button>
              </SelectionRow>
            )}
          </RackArea>
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

const Round = styled.span`
  ${monoType}
  font-weight: 700;
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

const SeatStrip = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const SeatChip = styled.li<{ $mark: string; $turn: boolean }>`
  display: grid;
  min-width: 0;
  padding: ${space.xs}px ${space.sm}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => p.$mark};
  ${(p) =>
    p.$turn &&
    css`
      outline: 2px solid ${color.accent};
      outline-offset: -2px;
    `}
`

const SeatName = styled.span`
  max-width: 10em;
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const SeatFacts = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const EventLine = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const TableArea = styled.section`
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: ${space.sm}px;
  min-height: 120px;
  padding: ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 0 0 0 1px ${color.line};
`

const SetBox = styled.div<{ $invalid: boolean; $target: boolean }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  max-width: 100%;
  padding: ${space.xs}px ${space.xs}px ${space.sm}px;
  background: ${color.raised};
  box-shadow: inset 0 0 0 2px ${(p) => (p.$invalid ? color.danger : 'transparent')};
  ${(p) =>
    p.$target &&
    css`
      cursor: pointer;
      box-shadow: inset 0 0 0 2px ${p.$invalid ? color.danger : color.accent};
    `}
`

const PutHere = styled.button`
  width: 34px;
  height: 46px;
  color: ${color.accent};
  background: transparent;
  border: 2px dashed ${color.accent};
  cursor: pointer;

  svg {
    width: 18px;
    height: 18px;
  }
`

const NewSet = styled.button`
  display: grid;
  align-content: center;
  gap: 2px;
  min-width: 120px;
  min-height: 58px;
  padding: ${space.xs}px ${space.md}px;
  color: ${color.text};
  background: transparent;
  border: 2px dashed ${color.border};
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:enabled {
    border-color: ${color.accent};
  }

  &:disabled {
    color: ${color.muted};
    cursor: default;
  }

  small {
    color: ${color.muted};
    font-size: ${fontSize.sm}px;
  }
`

const Empty = styled.p`
  margin: 0;
  color: ${color.muted};
`

const TurnStatus = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.md}px;
  font-size: ${fontSize.sm}px;
  font-weight: 600;

  &:empty {
    display: none;
  }
`

const StatusItem = styled.span<{ $ok: boolean }>`
  color: ${(p) => (p.$ok ? color.success : color.warning)};
`

const RackArea = styled.section`
  display: grid;
  gap: ${space.sm}px;
`

const RackHeader = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const RackTitle = styled.h2`
  margin: 0;
  font-size: ${fontSize.md}px;
`

const RackTiles = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px 3px;
  min-height: 58px;
  padding: ${space.sm}px;
  background: ${color.sunken};
  box-shadow: inset 0 -4px 0 ${color.line};
`

const SelectionRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
  font-size: ${fontSize.sm}px;
  font-weight: 600;
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

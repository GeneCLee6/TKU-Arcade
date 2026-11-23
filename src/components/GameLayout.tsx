import { createElement, Fragment, useLayoutEffect, useState, type ReactNode } from 'react'
import styled from 'styled-components'
import type { ChatMessage } from '../../shared/chat.ts'
import type { Standing } from '../../shared/games/types.ts'
import type { JsonValue } from '../../shared/patch.ts'
import type { RoomMember } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import type { RoomRealtime } from '../lib/useRoom.ts'
import { unreadCount } from '../lib/chatState.ts'
import { resultPanelChunk } from '../lib/lateParts.ts'
import { useCompact } from '../lib/useMediaQuery.ts'
import { color, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import type { ChatPanelProps } from './ChatPanel.tsx'
import { Countdown } from './Countdown.tsx'
import {
  LateChatPanel as ChatPanel,
  LateCoverSection as CoverSection,
  LateDrawer as Drawer,
  LateTabs as Tabs,
} from './LateParts.tsx'
import { RoomInPlay, type RoomInPlayProps } from './RoomInPlay.tsx'
import { seatedMembers } from './roomParts.ts'

export type RoomChat = Pick<ChatPanelProps, 'messages' | 'locked' | 'onSend' | 'draftStore'>

/** Everything of the room that the game's screen does not draw itself */
export type RoomParts = Omit<
  RoomInPlayProps,
  'seatDetail' | 'turnSeat' | 'seatTint' | 'urgentElsewhere' | 'hidePlaying' | 'resultElsewhere'
> & {
  chat: RoomChat
  act(action: JsonValue): void
  /** A real-time game's channel (the kart, e2-t11); absent in tests of turn-based screens */
  realtime?: RoomRealtime
  /** e10-t05: this member's cosmetic pick (the kart's garage); absent in tests */
  onSetLook?(look: string | null): void
  /** 2026-11-17: the host's browser acting for a computer seat (the kart); absent in tests */
  actFor?(seat: number, action: JsonValue): boolean
  /** 2026-11-22: going back to the lobby on purpose (shared/protocol.ts 17.); absent in tests */
  onLeave?(): void
}

export interface GameLayoutProps {
  room: RoomParts
  /** The game: the main column. Without one the room's panels are all there is */
  children?: ReactNode
  /** Stays in reach at the bottom of a phone's screen: whose turn it is and what to press */
  dock?: ReactNode
  seatDetail?(member: RoomMember): ReactNode
  turnSeat?: number | null
  /** Members' avatars take their seat's colour, as the pieces do */
  seatTint?: boolean
  /** See `ResultPanel` */
  resultHeadline?: ReactNode
  resultDetail?(standing: Standing): ReactNode
  /** The game's screen is still playing out the last move: the result would give away its end */
  resultHeld?: boolean
  /** See `ResultPanel` */
  resultUnranked?: boolean
  /** See `ResultPanel` */
  resultExtra?: ReactNode
  /**
   * The screen shows the game's countdowns itself, over its board (promotion's full edition, C8): a
   * phone then shows none above the game, where one appearing would push the board down
   */
  ownCountdown?: boolean
  /**
   * 2026-11-23 (app shell): what the game has beside its board that nobody needs at every moment (a
   * hand's log, the scores, a reference card): in the side column of a wide screen, between the
   * members and the chat; on a phone behind a button of its own in the dock, so that the board keeps
   * the screen
   */
  panels?: readonly GamePanel[]
}

export interface GamePanel {
  id: string
  label: string
  content: ReactNode
}

type PanelId = string

/**
 * The room around a game (DESIGN §4). Wide: the game, with members and chat in a column to its right.
 * On a phone it is one column; members and chat wait in a drawer so that the board keeps the screen,
 * and only what cannot wait stays out: a countdown, a game stuck on an absent seat, and once the game
 * is over everything the host decides next.
 */
export function GameLayout({
  room,
  children,
  dock,
  seatDetail,
  turnSeat,
  seatTint,
  resultHeadline,
  resultDetail,
  resultHeld,
  resultUnranked,
  resultExtra,
  ownCountdown,
  panels = NO_PANELS,
}: GameLayoutProps) {
  const compact = useCompact()
  const ResultPanel = resultPanelChunk.use()
  const hasGame = children !== undefined
  const status = room.view.room.status
  const result = status === 'ended' ? (room.view.game?.result ?? null) : null
  const panelProps = {
    ...room,
    seatDetail,
    turnSeat,
    seatTint,
    hidePlaying: hasGame,
    resultElsewhere: result !== null,
  }
  // Fitted to the screen while it is played; a result is read at its own size, scrolled if need be
  const { onStage, onBox } = useFitZoom(status === 'playing' && hasGame)
  // 2026-11-23: its code loads after the game's first paint (src/lib/lateParts.ts)
  const resultPanel =
    result &&
    !resultHeld &&
    ResultPanel &&
    createElement(ResultPanel, {
      view: room.view,
      you: room.you,
      result,
      headline: resultHeadline,
      detail: resultDetail,
      unranked: resultUnranked,
      extra: resultExtra,
      onRematch: room.onRematch,
      onReopen: room.onReopen,
      onDissolve: room.onDissolve,
      onLeave: room.onLeave,
    })

  if (!compact) {
    return (
      <Wide data-wide-room={hasGame ? '' : undefined} data-room-body="" $columns={hasGame}>
        {hasGame && (
          <GameColumn>
            <Stage data-game-stage="" ref={onStage}>
              <Fit ref={onBox}>
                {resultPanel}
                {children}
              </Fit>
            </Stage>
            <Dock $stuck data-dock="">{dock}</Dock>
          </GameColumn>
        )}
        <SideColumn data-side-panel="">
          {!hasGame && resultPanel}
          <RoomInPlay {...panelProps} />
          {/* The game's panels too: the side column has room for all of them, one under another */}
          {panels.map((panel) => (
            <Fragment key={panel.id}>{panel.content}</Fragment>
          ))}
          <ChatPanel {...room.chat} you={room.you} />
        </SideColumn>
      </Wide>
    )
  }

  // Once it is over, what comes next must not hide behind a button
  const panelInline = status !== 'playing' || !hasGame
  return (
    <Narrow data-wide-room="" data-room-body="">
      <Urgent>{!panelInline && <UrgentParts room={room} countdowns={!ownCountdown} />}</Urgent>
      <Stage data-game-stage="" ref={onStage}>
        <Fit ref={onBox}>
          {resultPanel}
          {children}
          {panelInline && <RoomInPlay {...panelProps} />}
        </Fit>
      </Stage>
      <PhoneDock
        room={room}
        dock={dock}
        players={panelInline ? null : <RoomInPlay {...panelProps} urgentElsewhere />}
        panels={panels}
      />
    </Narrow>
  )
}

const NO_PANELS: readonly GamePanel[] = []

/**
 * The smallest the game is drawn to fit the screen: below it, its buttons get too small to click. A
 * phone held upright keeps its finger-sized buttons (44 px) and scrolls the stage instead; one on its
 * side has too little height for that, and gets the same as a mouse
 */
const MIN_ZOOM = 0.75
const minZoom = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse) and (min-height: 561px)').matches
    ? 1
    : MIN_ZOOM

/**
 * 2026-11-23 (app shell): the game drawn smaller where the screen is short, so that all of it is in
 * sight (as promotion's board fits itself, e3-t10, which keeps its own: `data-fit-screen`). CSS zoom,
 * not a transform: the game lays itself out again in the width it gets, and taps land where they
 * look. Never under MIN_ZOOM; what is still too tall scrolls inside the stage. Set on the element, not
 * through React, so that a new card or a longer line refits without a render. A wider layout can be
 * shorter, so a few tries settle it; more within a second would be a fit chasing itself, and stop.
 * Outside the app shell (a replay) the stage is as tall as the game, which then never needs it
 */
function useFitZoom(enabled: boolean) {
  const [stage, stageRef] = useState<HTMLElement | null>(null)
  const [box, boxRef] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    if (!stage || !box || typeof ResizeObserver !== 'function') return undefined
    let zoom = 1
    let tries: number[] = []
    let later = 0
    const fit = () => {
      // A stage that scrolls takes the focus, so that a keyboard can scroll it too (axe); one that
      // does not stays out of the way (promotion's focus mode keeps the Tab key inside its board)
      if (stage.scrollHeight > stage.clientHeight + 1) stage.tabIndex = 0
      else stage.removeAttribute('tabindex')
      if (!enabled || box.querySelector('[data-fit-screen]')) return
      const room = stage.clientHeight
      const tall = box.getBoundingClientRect().height
      if (room <= 0 || tall <= 0) return
      const want = Math.max(minZoom(), Math.min(1, Math.floor((zoom * room * 100) / tall) / 100))
      const shrink = tall > room + 1 && want < zoom
      const grow = tall < room && want > zoom + 0.04
      if (!shrink && !grow) return
      const now = performance.now()
      tries = tries.filter((at) => now - at < 1000)
      if (tries.length >= 10) {
        // Settled or not, one more look once the second is over
        window.clearTimeout(later)
        later = window.setTimeout(fit, 1000)
        return
      }
      tries.push(now)
      zoom = want
      box.style.zoom = zoom === 1 ? '' : String(zoom)
      if (stage.scrollHeight <= stage.clientHeight + 1) stage.removeAttribute('tabindex')
    }
    const observer = new ResizeObserver(fit)
    observer.observe(stage)
    observer.observe(box)
    return () => {
      observer.disconnect()
      window.clearTimeout(later)
      box.style.zoom = ''
    }
  }, [enabled, stage, box])
  return { onStage: stageRef, onBox: boxRef }
}

function UrgentParts({ room, countdowns }: { room: RoomParts; countdowns: boolean }) {
  const seated = seatedMembers(room.view)
  const me = room.view.members[room.you]
  return (
    <>
      {countdowns && room.timers.map((timer) => <Countdown key={timer.id} timer={timer} />)}
      {room.view.coverable.length > 0 && (
        <CoverSection
          seated={seated}
          coverable={room.view.coverable}
          isHost={me?.host === true}
          onCover={room.onCover}
        />
      )}
    </>
  )
}

/** Marks new messages as seen once the chat has been open: the count on the button */
function useUnread(messages: readonly ChatMessage[], you: string, reading: boolean): number {
  const last = messages.at(-1)?.id ?? null
  const [seen, setSeen] = useState(last)
  if (reading && seen !== last) setSeen(last)
  return reading ? 0 : unreadCount(messages, seen, you)
}

interface PhoneDockProps {
  room: RoomParts
  dock?: ReactNode
  /** The members' panel for the drawer; null when the page shows it already */
  players: ReactNode
  /** The game's own panels (GameLayoutProps.panels), or the waiting room's invitation and setup */
  panels?: readonly GamePanel[]
}

/** The bar stuck to the bottom of a phone's screen, and the drawer its buttons open */
export function PhoneDock({ room, dock, players, panels = NO_PANELS }: PhoneDockProps) {
  const t = useT()
  const [open, setOpen] = useState<PanelId | null>(null)
  const unread = useUnread(room.chat.messages, room.you, open === 'chat')
  const chatLabel = unread > 0 ? t('room.panel.chatUnread', { count: unread }) : t('chat.heading')
  const close = () => setOpen(null)
  const chat = <ChatPanel {...room.chat} you={room.you} />
  const tabs: GamePanel[] = [
    ...(players === null ? [] : [{ id: 'players', label: t('room.panel.members'), content: players }]),
    ...panels,
    { id: 'chat', label: t('chat.heading'), content: chat },
  ]
  // Someone gone while the drawer was open on them: the panel falls back to the chat
  const panel: PanelId = open !== null && tabs.some((tab) => tab.id === open) ? open : 'chat'

  return (
    <>
      <Dock $stuck data-dock="">
        {dock}
        <DockButtons>
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              $variant="secondary"
              $size="sm"
              aria-haspopup="dialog"
              onClick={() => setOpen(tab.id)}
            >
              {tab.id === 'chat' ? chatLabel : tab.label}
            </Button>
          ))}
        </DockButtons>
      </Dock>
      <Drawer
        open={open !== null}
        onClose={close}
        title={tabs.length === 1 ? t('chat.heading') : t('room.panel.title')}
      >
        {tabs.length === 1 ? (
          chat
        ) : (
          <Tabs<PanelId> label={t('room.panel.title')} value={panel} onChange={setOpen} tabs={tabs} />
        )}
      </Drawer>
    </>
  )
}

/**
 * The chat of a room with no game on screen: inline when wide, in a drawer on a phone, where the
 * waiting room's invitation and setup wait behind buttons beside it (`panels`)
 */
export function RoomChatPanel({ room, panels }: { room: RoomParts; panels?: readonly GamePanel[] }) {
  const compact = useCompact()
  if (compact) return <PhoneDock room={room} players={null} panels={panels} />
  return <ChatPanel {...room.chat} you={room.you} />
}

// In the app shell (src/pages/RoomPage.tsx) each part below is held to the screen: the game's stage
// and the side column scroll inside themselves, the dock stays under the stage, the page never moves
const shellPanel = `
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
`

const Wide = styled.div<{ $columns: boolean }>`
  display: grid;
  grid-template-columns: ${(p) => (p.$columns ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr)')};
  align-items: start;
  gap: ${space.xl}px;

  :root[data-app-shell] & {
    grid-template-rows: minmax(0, 1fr);
    align-items: stretch;
    gap: ${space.lg}px;
  }
`

const GameColumn = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;

  :root[data-app-shell] & {
    grid-template-rows: minmax(0, 1fr) auto;
    min-height: 0;
    gap: ${space.sm}px;
  }
`

const Stage = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: ${space.md}px;

  :root[data-app-shell] & {
    ${shellPanel}
  }
`

const SideColumn = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: ${space.xl}px;

  :root[data-app-shell] & {
    ${shellPanel}
    gap: ${space.lg}px;
  }
`

// What the stage fits to the screen (useFitZoom)
const Fit = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: ${space.md}px;
`

const Urgent = styled.div`
  display: grid;
  gap: ${space.sm}px;

  &:empty {
    display: none;
  }
`

// The app shell on a phone on its side: the dock is a rail at the right, as a game's controls are,
// and the stage has the whole height
const Narrow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;

  :root[data-app-shell] & {
    display: flex;
    flex-direction: column;
    gap: ${space.sm}px;

    & > * {
      flex: none;
    }

    & > [data-game-stage] {
      flex: 1 1 0;
    }

    @media (orientation: landscape) and (max-height: 560px) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(200px, 32%);
      grid-template-rows: auto minmax(0, 1fr);

      & > [data-game-stage] {
        grid-column: 1;
        grid-row: 2;
      }

      & > [data-dock] {
        grid-column: 2;
        grid-row: 1 / span 2;
        grid-template-columns: minmax(0, 1fr);
        align-content: start;
        overflow-y: auto;
        overscroll-behavior: contain;
      }

      & [data-dock] > div:last-child {
        flex-wrap: wrap;
      }
    }
  }
`

const Dock = styled.div<{ $stuck?: boolean }>`
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.surface};
  box-shadow:
    inset 0 2px 0 ${color.accent},
    inset 0 0 0 1px ${color.line};
  ${(p) =>
    p.$stuck
      ? `
    position: sticky;
    bottom: 0;
    z-index: 1;
    padding-bottom: calc(${space.sm}px + env(safe-area-inset-bottom));
  `
      : ''}

  &:empty {
    display: none;
  }

  /* A phone on its side has little height to give: one row, beside what is pressed most */
  @media (max-height: 500px) {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
  }
`

// Three buttons and more (a game's own panels): side by side on the narrowest phone
const DockButtons = styled.div`
  display: flex;
  gap: ${space.sm}px;

  & > button {
    flex: 1;
  }

  &:has(> button:nth-child(3)) > button {
    min-width: 0;
    padding-inline: ${space.sm}px;
  }
`

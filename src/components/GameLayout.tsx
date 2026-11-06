import { useState, type ReactNode } from 'react'
import styled from 'styled-components'
import type { ChatMessage } from '../../shared/chat.ts'
import type { JsonValue } from '../../shared/patch.ts'
import type { RoomMember } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { unreadCount } from '../lib/chatState.ts'
import { useCompact } from '../lib/useMediaQuery.ts'
import { color, radius, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { ChatPanel, type ChatPanelProps } from './ChatPanel.tsx'
import { Countdown } from './Countdown.tsx'
import { Drawer } from './Drawer.tsx'
import { CoverSection, RoomInPlay, type RoomInPlayProps } from './RoomInPlay.tsx'
import { seatedMembers } from './roomParts.ts'
import { Tabs } from './Tabs.tsx'

export type RoomChat = Pick<ChatPanelProps, 'messages' | 'locked' | 'onSend' | 'draftStore'>

/** Everything of the room that the game's screen does not draw itself */
export type RoomParts = Omit<
  RoomInPlayProps,
  'seatDetail' | 'turnSeat' | 'seatTint' | 'urgentElsewhere' | 'hidePlaying'
> & {
  chat: RoomChat
  act(action: JsonValue): void
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
}

type PanelId = 'players' | 'chat'

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
}: GameLayoutProps) {
  const compact = useCompact()
  const hasGame = children !== undefined
  const status = room.view.room.status
  const panelProps = { ...room, seatDetail, turnSeat, seatTint, hidePlaying: hasGame }

  if (!compact) {
    return (
      <Wide data-wide-room={hasGame ? '' : undefined} $columns={hasGame}>
        {hasGame && (
          <GameColumn>
            {children}
            <Dock $stuck>{dock}</Dock>
          </GameColumn>
        )}
        <SideColumn>
          <RoomInPlay {...panelProps} />
          <ChatPanel {...room.chat} you={room.you} />
        </SideColumn>
      </Wide>
    )
  }

  // Once it is over, what comes next must not hide behind a button
  const panelInline = status !== 'playing' || !hasGame
  return (
    <Narrow data-wide-room="">
      {!panelInline && <UrgentParts room={room} />}
      {children}
      {panelInline && <RoomInPlay {...panelProps} />}
      <PhoneDock
        room={room}
        dock={dock}
        players={panelInline ? null : <RoomInPlay {...panelProps} urgentElsewhere />}
      />
    </Narrow>
  )
}

function UrgentParts({ room }: { room: RoomParts }) {
  const seated = seatedMembers(room.view)
  const me = room.view.members[room.you]
  return (
    <>
      {room.timers.map((timer) => (
        <Countdown key={timer.id} timer={timer} />
      ))}
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
}

/** The bar stuck to the bottom of a phone's screen, and the drawer its buttons open */
export function PhoneDock({ room, dock, players }: PhoneDockProps) {
  const t = useT()
  const [open, setOpen] = useState<PanelId | null>(null)
  const unread = useUnread(room.chat.messages, room.you, open === 'chat')
  const chatLabel = unread > 0 ? t('room.panel.chatUnread', { count: unread }) : t('chat.heading')
  const close = () => setOpen(null)
  const chat = <ChatPanel {...room.chat} you={room.you} />
  // Someone gone while the drawer was open on them: there is only chat left to show
  const panel: PanelId = players === null ? 'chat' : (open ?? 'chat')

  return (
    <>
      <Dock $stuck>
        {dock}
        <DockButtons>
          {players !== null && (
            <Button $variant="secondary" $size="sm" onClick={() => setOpen('players')}>
              {t('room.panel.members')}
            </Button>
          )}
          <Button $variant="secondary" $size="sm" onClick={() => setOpen('chat')}>
            {chatLabel}
          </Button>
        </DockButtons>
      </Dock>
      <Drawer
        open={open !== null}
        onClose={close}
        title={players === null ? t('chat.heading') : t('room.panel.title')}
      >
        {players === null ? (
          chat
        ) : (
          <Tabs<PanelId>
            label={t('room.panel.title')}
            value={panel}
            onChange={setOpen}
            tabs={[
              { id: 'players', label: t('room.panel.members'), content: players },
              { id: 'chat', label: t('chat.heading'), content: chat },
            ]}
          />
        )}
      </Drawer>
    </>
  )
}

/** The chat of a room with no game on screen: inline when wide, in a drawer on a phone */
export function RoomChatPanel({ room }: { room: RoomParts }) {
  const compact = useCompact()
  if (compact) return <PhoneDock room={room} players={null} />
  return <ChatPanel {...room.chat} you={room.you} />
}

const Wide = styled.div<{ $columns: boolean }>`
  display: grid;
  grid-template-columns: ${(p) => (p.$columns ? 'minmax(0, 1fr) 340px' : 'minmax(0, 1fr)')};
  align-items: start;
  gap: ${space.xl}px;
`

const GameColumn = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
`

const SideColumn = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.xl}px;
`

const Narrow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.md}px;
`

const Dock = styled.div<{ $stuck?: boolean }>`
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
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
`

const DockButtons = styled.div`
  display: flex;
  gap: ${space.sm}px;

  & > button {
    flex: 1;
  }
`

// 2026-11-21 (owner: "the waiting room should show everyone's character from the front and what
// they drive, with a background picture, and everyone has to press Ready"): the race room's waiting
// room, its own lazy chunk (WaitingRoom.tsx loads it only for a kart room; the board games keep
// theirs).
//
// 2026-11-22 (owner: "like the racing games, the whole screen is the host and the racers; one page,
// wide, full; esports, professional"): the waiting room covers the screen, one page that never
// scrolls (1280 x 720 up, and a phone on its side at 844 x 390), and the racers are what it is about.
// The idea of a full-screen line-up of racers before a race is common to racing games; the layout,
// the drawing and the words are ours, in the kart's broadcast style (src/kart/ui/broadcast.ts,
// docs/DESIGN.md §3.6).
//
//   - The top bar: the way back, the title, the count of racers, and the tools behind buttons:
//     Invite, Chat (with what is unread), Teams in a team race, Room (the host's settings and
//     computer karts, everyone's own "full screen when a race starts"), How to play, Full screen.
//   - The eight places, big: four by two, or one row of eight on a screen wide enough. Each is the
//     racer from the front in 3D (one renderer for all, lobbyStage.ts; flat art without WebGL,
//     KartArt.tsx) over their kart's glow, and under it their name plate: name, kart and driver,
//     series, tier, a computer's level, team, the host's crown and, big, whether they are ready.
//   - The side rail: the track (TrackCard.tsx), the garage, and the big Ready (or, for the host,
//     Start, which waits on everyone and says for whom).
//   - A phone held upright gets a list instead, and is asked to turn sideways.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import styled, { css, keyframes } from 'styled-components'
import type { ChatMessage } from '../../../shared/chat.ts'
import type { BotLevel } from '../../../shared/games/kart/bots.ts'
import { fullscreenMessages } from '../../../shared/games/i18n.fullscreen.ts'
import { kartLobbyMessages } from '../../../shared/games/kart/i18n.lobby.ts'
import { kartTeamMessages } from '../../../shared/games/kart/i18n.team.ts'
import { kartSpec, parseLook } from '../../../shared/kart/karts.ts'
import { assignTeams, isTeamId, TEAM_NAMES } from '../../../shared/kart/team.ts'
import { KICK_BAN_MS, type RoomMember, type RoomView } from '../../../shared/protocol.ts'
import { Button } from '../../components/Button.tsx'
import { ConfirmButton } from '../../components/ConfirmButton.tsx'
import { Dialog } from '../../components/Dialog.tsx'
import { HowToPlay } from '../../components/HowToPlay.tsx'
import { registerMessages } from '../../i18n/t.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import {
  autoFullscreen,
  enterFullscreen,
  fullscreenMode,
  lockLandscape,
  setAutoFullscreen,
  useAutoFullscreen,
} from '../../lib/fullscreen.ts'
import { inertOthers } from '../../lib/inertOthers.ts'
import { memberName } from '../../lib/memberName.ts'
import { nameFit } from './nameFit.ts'
import { Link } from '../../lib/router.tsx'
import { displayType, monoType } from '../../styles/esports.ts'
import { kartBodies } from '../../styles/kartTokens.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { themeNameOf } from '../art/themeName.ts'
import { randomLook } from '../bots/botLook.ts'
import RoomBots from '../bots/RoomBots.tsx'
import { RoomGarage } from '../roster/RoomGarage.tsx'
import { useRoomLook } from '../roster/useRoomLook.ts'
import { teamColor } from '../team/teamColor.ts'
import { broadcast, broadcastSolid, cutClip, slam, ticker } from '../ui/broadcast.ts'
import { KartArt } from './KartArt.tsx'
import { LobbyBackdrop } from './LobbyBackdrop.tsx'
import type { LobbyStage } from './lobbyStage.ts'
import { seatState, waitingOn } from './readiness.ts'
import { raceTrackId, useLobbyTrack } from './lobbyTrack.ts'
import { TrackCard } from './TrackCard.tsx'

registerMessages(kartLobbyMessages)
registerMessages(kartTeamMessages)
registerMessages(fullscreenMessages)

const RoomTeams = lazy(() => import('../team/RoomTeams.tsx'))
const FullscreenButton = lazy(() => import('../../components/FullscreenButton.tsx'))

export interface KartLobbyProps {
  view: RoomView
  you: string
  onSit(seat: number | null): void
  onReady(ready: boolean): void
  onStart(): void
  onKick(memberId: string): void
  onTransfer(memberId: string): void
  onSetLook(look: string | null): void
  onAddBot(level: string, look?: string): void
  onSetTeam(team: 0 | 1 | null, member?: string): void
  /** Sharing the room (its number, link, QR code, listing, password): behind the Invite button */
  invite?: ReactNode
  /** The game's options and the host's way to end the room: behind the Room button */
  setup?: ReactNode
  /** The room's chat behind the Chat button, and its messages for the count of unread; absent in tests */
  chat?: LobbyChat
  /** Leaving the room on purpose (shared/protocol.ts 17.) */
  onLeave?(): void
}

type Panel = 'garage' | 'invite' | 'room' | 'teams' | 'chat'

/**
 * Made by the room's page, whose chunk has the chat's code already: importing it here (two lazy
 * chunks down) would split it out of the room's chunk and cost every game's first screen 3 kB
 */
export interface LobbyChat {
  panel: ReactNode
  messages: readonly ChatMessage[]
  unreadCount(messages: readonly ChatMessage[], seen: number | null, you: string): number
}

/** The 3D pictures: three.js comes after the cards are up, and only where it can draw */
function useLobbyStage(): { stage: LobbyStage | null; failed: boolean } {
  const [state, setState] = useState<{ stage: LobbyStage | null; failed: boolean }>({ stage: null, failed: false })
  useEffect(() => {
    let live = true
    let made: LobbyStage | null = null
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const slow =
      (window.matchMedia?.('(pointer: coarse)').matches ?? false) ||
      Math.min(window.innerWidth, window.innerHeight) < 500
    void import('./lobbyStage.ts').then(
      ({ createLobbyStage }) => {
        if (!live) return
        made = createLobbyStage({ still, slow })
        setState({ stage: made, failed: made === null })
      },
      () => {
        if (live) setState({ stage: null, failed: true })
      },
    )
    return () => {
      live = false
      made?.dispose()
    }
  }, [])
  return state
}

/** The waiting room covers the page: what is behind it is out of reach and does not scroll */
function useCover(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current
    if (!element) return undefined
    const undo = inertOthers([element])
    const page = document.documentElement
    const overflow = page.style.overflow
    page.style.overflow = 'hidden'
    return () => {
      undo()
      page.style.overflow = overflow
    }
  }, [root])
}

/** New messages since the chat was last open */
function useUnread(chat: LobbyChat | undefined, you: string, reading: boolean): number {
  const messages = chat?.messages ?? NO_MESSAGES
  const last = messages.at(-1)?.id ?? null
  const [seen, setSeen] = useState(last)
  if (reading && seen !== last) setSeen(last)
  return reading || !chat ? 0 : chat.unreadCount(messages, seen, you)
}

/** With the setting on, Ready and Start are the tap a browser wants before full screen */
function goFullscreenIfAsked() {
  if (!autoFullscreen() || fullscreenMode() !== 'off') return
  void enterFullscreen().then((mode) => {
    if (mode === 'fullscreen' && window.matchMedia?.('(pointer: coarse)').matches) void lockLandscape()
  })
}

const NO_MESSAGES: readonly ChatMessage[] = []

export default function KartLobby({
  view,
  you,
  onSit,
  onReady,
  onStart,
  onKick,
  onTransfer,
  onSetLook,
  onAddBot,
  onSetTeam,
  invite,
  setup,
  chat,
  onLeave,
}: KartLobbyProps) {
  const t = useT()
  const language = useLanguage()
  const { room, members } = view
  const me = members[you]
  const isHost = me?.host === true
  const trackId = raceTrackId(room.options)
  const track = useLobbyTrack(trackId)
  const look = useRoomLook(members, you, onSetLook, trackId)
  const { stage } = useLobbyStage()
  const [open, setOpen] = useState<Panel | null>(null)
  const [managing, setManaging] = useState<string | null>(null)
  const [level, setLevel] = useState<BotLevel>('normal')
  const root = useRef<HTMLDivElement>(null)
  useCover(root)
  const unread = useUnread(chat, you, open === 'chat')
  const close = () => setOpen(null)

  const seated = Object.values(members)
    .filter((member) => member.seat !== null)
    .sort((a, b) => (a.seat as number) - (b.seat as number))
  const spectators = Object.values(members).filter((member) => member.seat === null)
  const teams = room.options.teams === 'teams'
  const sides = useMemo(
    () => assignTeams(seated.map((member, id) => (isTeamId(member.team) ? { id, team: member.team } : { id }))),
    [seated],
  )
  const waiting = waitingOn(members)
  const names = new Intl.ListFormat(language, { type: 'conjunction' }).format(
    waiting.map((member) => memberName(member, 'kart')),
  )
  const enough = seated.length >= room.minPlayers
  const canStart = enough && waiting.length === 0
  const firstFree = Array.from({ length: room.maxSeats }, (_, seat) => seat).find(
    (seat) => !seated.some((member) => member.seat === seat),
  )
  const theme = themeNameOf({ id: String(room.options.track ?? ''), theme: track?.theme })
  const managed = managing ? members[managing] : undefined
  const myPick = parseLook(me?.look)
  const chatLabel = unread > 0 ? t('room.panel.chatUnread', { count: unread }) : t('chat.heading')

  return (
    <Stage ref={root} data-room-columns="" data-kart-lobby="" data-testid="kart-lobby">
      <LobbyBackdrop seed={trackId} theme={theme} road={track?.road} />
      <Lights aria-hidden="true" />

      <TopBar>
        <Leave to="/" onClick={onLeave}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
            <path d="M12 3 5 10l7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
          </svg>
          <ToolLabel>{t('room.backToLobby')}</ToolLabel>
        </Leave>
        <TitleBlock>
          <Title id="kart-lobby-title">{t('games.kart.lobby.title')}</Title>
          <Count data-testid="kart-lobby-count">
            {t('games.kart.lobby.racers', { count: seated.length, max: room.maxSeats })}
          </Count>
        </TitleBlock>
        <Tools>
          {invite && (
            <Tool onClick={() => setOpen('invite')} data-testid="kart-lobby-invite">
              <ToolIcon d="M8 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8c0-3 3-5 6-5s6 2 6 5M16 6v6M13 9h6" />
              <ToolLabel>{t('room.waiting.invite')}</ToolLabel>
            </Tool>
          )}
          {chat && (
            <Tool onClick={() => setOpen('chat')} data-testid="kart-lobby-chat">
              <ToolIcon d="M3 4h14v9H8l-4 3v-3H3Z" />
              <ToolLabel>{chatLabel}</ToolLabel>
              {unread > 0 && <Unread aria-hidden="true">{unread}</Unread>}
            </Tool>
          )}
          {teams && me && (
            <Tool onClick={() => setOpen('teams')} data-testid="kart-lobby-teams">
              <ToolIcon d="M4 17V3l6 3-6 3M12 17V3l6 3-6 3" />
              <ToolLabel>{t('games.kart.team.title')}</ToolLabel>
            </Tool>
          )}
          <Tool onClick={() => setOpen('room')} data-testid="kart-lobby-settings">
            <ToolIcon d="M3 5h14M3 10h14M3 15h14M7 3v4M13 8v4M9 13v4" />
            <ToolLabel>{isHost ? t('games.kart.lobby.roomTitle') : t('games.kart.lobby.room')}</ToolLabel>
          </Tool>
          <HowToPlay gameId="kart" />
          <Suspense>
            <FullscreenButton iconOnly landscape />
          </Suspense>
        </Tools>
      </TopBar>

      <Body>
        <Line aria-labelledby="kart-lobby-line">
          <LineHeading id="kart-lobby-line">{t('games.kart.lobby.lineUp')}</LineHeading>
          <Places data-testid="kart-picks">
            {Array.from({ length: room.maxSeats }, (_, seat) => {
              const member = seated.find((other) => other.seat === seat)
              const index = member ? seated.indexOf(member) : -1
              return member ? (
                <PlaceCard
                  key={member.id}
                  seat={seat}
                  member={member}
                  isYou={member.id === you}
                  viewerIsHost={isHost}
                  team={teams ? sides[index] : undefined}
                  stage={stage}
                  onManage={() => setManaging(member.id)}
                />
              ) : (
                <OpenPlace
                  key={`open-${seat}`}
                  seat={seat}
                  stage={stage}
                  canSit={me !== undefined}
                  onSit={onSit}
                  onAddBot={
                    isHost && seat === firstFree ? () => onAddBot(level, randomLook()) : undefined
                  }
                />
              )
            })}
          </Places>
        </Line>

        <Rail>
          <TrackCard options={room.options} track={track} />
          {me && (
            <Garage type="button" onClick={() => setOpen('garage')} data-testid="kart-lobby-garage">
              <GarageTag>{t('games.kart.lobby.garage')}</GarageTag>
              <GarageKart>
                {myPick
                  ? `${t(`kart.body.${myPick.kart}`)} · ${t(`kart.driver.${myPick.driver}`)}`
                  : t('games.kart.lobby.picking')}
              </GarageKart>
            </Garage>
          )}
          <StartPanel data-testid="kart-lobby-start">
            {me && me.seat !== null && !isHost && (
              <BigButton
                $variant={me.ready ? 'secondary' : 'primary'}
                $live={!me.ready}
                aria-pressed={me.ready}
                onClick={() => {
                  if (!me.ready) goFullscreenIfAsked()
                  onReady(!me.ready)
                }}
                data-testid="kart-lobby-ready"
              >
                {me.ready ? t('games.kart.lobby.unready') : t('games.kart.lobby.readyButton')}
              </BigButton>
            )}
            {isHost && (
              <BigButton
                $variant="primary"
                $live={canStart}
                disabled={!canStart}
                aria-describedby="kart-lobby-start-hint"
                onClick={() => {
                  goFullscreenIfAsked()
                  onStart()
                }}
              >
                {t('room.waiting.start')}
              </BigButton>
            )}
            {isHost ? (
              <Status id="kart-lobby-start-hint" role="status" data-testid="kart-lobby-waiting">
                {!enough
                  ? t('room.waiting.needPlayers', { count: room.minPlayers })
                  : waiting.length > 0
                    ? t('games.kart.lobby.waitingFor', { names })
                    : t('games.kart.lobby.allReady')}
              </Status>
            ) : me?.seat === null || !me ? (
              <Status>{t('room.waiting.pickSeat')}</Status>
            ) : (
              <Status role="status">
                {me.ready ? t('games.kart.lobby.waitingHost') : t('games.kart.lobby.readyHint')}
              </Status>
            )}
            {me && me.seat !== null && (
              <StandUp $variant="ghost" $size="sm" onClick={() => onSit(null)}>
                {t('room.waiting.standUp')}
              </StandUp>
            )}
          </StartPanel>
          {spectators.length > 0 && (
            <Watchers data-testid="kart-lobby-spectators">
              {t('games.kart.lobby.watchingList', {
                names: spectators.map((member) => memberName(member, 'kart')).join(', '),
              })}
            </Watchers>
          )}
        </Rail>
      </Body>

      <Sideways>{t('games.kart.lobby.sideways')}</Sideways>

      <Dialog open={open === 'garage'} onClose={close} title={t('kart.roster.title')}>
        <RoomGarage look={look} track={trackId} />
      </Dialog>
      {invite && (
        <Dialog open={open === 'invite'} onClose={close} title={t('room.waiting.invite')}>
          {invite}
        </Dialog>
      )}
      <Dialog
        open={open === 'room'}
        onClose={close}
        title={isHost ? t('games.kart.lobby.roomTitle') : t('games.kart.lobby.room')}
      >
        <DialogStack>
          {setup}
          {isHost && (
            <RoomBots free={room.maxSeats - seated.length} onAdd={onAddBot} level={level} onLevel={setLevel} />
          )}
          <AutoFullscreen />
        </DialogStack>
      </Dialog>
      {teams && me && (
        <Dialog open={open === 'teams'} onClose={close} title={t('games.kart.team.title')}>
          <Suspense>
            <RoomTeams members={members} you={you} onSetTeam={onSetTeam} />
          </Suspense>
        </Dialog>
      )}
      {chat && (
        <Dialog open={open === 'chat'} onClose={close} title={t('chat.heading')}>
          {chat.panel}
        </Dialog>
      )}
      <Dialog
        open={managed !== undefined}
        onClose={() => setManaging(null)}
        title={managed ? t('games.kart.lobby.manage', { name: memberName(managed, 'kart') }) : ''}
      >
        {managed && (
          <Manage
            member={managed}
            onKick={(id) => {
              setManaging(null)
              onKick(id)
            }}
            onTransfer={(id) => {
              setManaging(null)
              onTransfer(id)
            }}
          />
        )}
      </Dialog>
    </Stage>
  )
}

/** Everyone's own: full screen by itself on the way into a race (src/lib/fullscreen.ts) */
function AutoFullscreen() {
  const t = useT()
  const on = useAutoFullscreen()
  return (
    <Check>
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => setAutoFullscreen(event.target.checked)}
        data-testid="kart-lobby-auto-fullscreen"
      />
      <span>{t('room.extra.fullscreen.auto')}</span>
    </Check>
  )
}

/** The host's ways with someone else's place: a computer kart goes, a person is handed the room or kicked */
function Manage({
  member,
  onKick,
  onTransfer,
}: {
  member: RoomMember
  onKick(memberId: string): void
  onTransfer(memberId: string): void
}) {
  const t = useT()
  const name = memberName(member, 'kart')
  if (member.bot) {
    return (
      <ManageRow>
        <Button
          $variant="danger"
          aria-label={t('games.kart.bot.removeNamed', { name })}
          onClick={() => onKick(member.id)}
        >
          {t('games.kart.bot.remove')}
        </Button>
      </ManageRow>
    )
  }
  return (
    <ManageRow>
      {member.online && (
        <ConfirmButton
          variant="secondary"
          label={t('room.host.transfer')}
          accessibleLabel={t('room.host.transferNamed', { name })}
          title={t('room.host.transferTitle', { name })}
          body={t('room.host.transferBody', { name })}
          onConfirm={() => onTransfer(member.id)}
        />
      )}
      <ConfirmButton
        variant="danger"
        label={t('room.host.kick')}
        accessibleLabel={t('room.host.kickNamed', { name })}
        title={t('room.host.kickTitle', { name })}
        body={t('room.host.kickBody', { name, minutes: KICK_BAN_MS / 60_000 })}
        onConfirm={() => onKick(member.id)}
      />
    </ManageRow>
  )
}

/** The canvas a place's 3D picture is copied onto (lobbyStage.ts), or nothing without WebGL */
function usePicture(stage: LobbyStage | null, seat: number, member: RoomMember | null) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const pick = parseLook(member?.look)
  const ready = member ? seatState(member) === 'ready' : false
  useEffect(() => {
    if (!stage) return
    stage.attach(seat, canvas.current)
    return () => stage.attach(seat, null)
  }, [stage, seat])
  const kart = pick?.kart
  const driver = pick?.driver
  useEffect(() => {
    stage?.set(seat, kart && driver ? { kart, driver, ready } : null)
  }, [stage, seat, kart, driver, ready])
  useEffect(() => () => stage?.set(seat, null), [stage, seat])
  return canvas
}

interface PlaceCardProps {
  seat: number
  member: RoomMember
  isYou: boolean
  viewerIsHost: boolean
  team: 0 | 1 | undefined
  /** The 3D pictures; null before they come or without WebGL, when the flat drawing shows */
  stage: LobbyStage | null
  onManage(): void
}

function PlaceCard({ seat, member, isYou, viewerIsHost, team, stage, onManage }: PlaceCardProps) {
  const t = useT()
  const canvas = usePicture(stage, seat, member)
  const pick = parseLook(member.look)
  const state = seatState(member)
  const name = memberName(member, 'kart')
  const spec = pick ? kartSpec(pick.kart) : null
  const kartName = pick ? t(`kart.body.${pick.kart}`) : t('games.kart.lobby.picking')
  const stateText =
    state === 'ready'
      ? t('games.kart.lobby.ready')
      : state === 'host'
        ? t('games.kart.lobby.host')
        : state === 'offline'
          ? t('games.kart.lobby.offline')
          : t('games.kart.lobby.notReady')
  const swatch = pick ? kartBodies[pick.kart].accent : color.line
  return (
    <Place
      $state={state}
      $swatch={swatch}
      data-member={member.id}
      data-state={state}
      data-testid="kart-lobby-place"
    >
      <Picture $swatch={swatch} $seat={seat}>
        {pick && (
          <Flat $shown={stage === null} data-flat="">
            <KartArt kart={pick.kart} driver={pick.driver} />
          </Flat>
        )}
        <canvas
          ref={canvas}
          role="img"
          aria-label={t('games.kart.lobby.card', {
            name,
            kart: kartName,
            driver: pick ? t(`kart.driver.${pick.driver}`) : '',
            state: stateText,
          })}
        />
        <Badges>
          <SeatNumber aria-label={t('games.kart.lobby.seat', { seat: seat + 1 })}>
            {String(seat + 1).padStart(2, '0')}
          </SeatNumber>
          {member.host && (
            <Crown aria-label={t('games.kart.lobby.host')} role="img" data-testid="kart-lobby-crown">
              <svg viewBox="0 0 24 16" width="22" height="15" aria-hidden="true" focusable="false">
                <path d="M2 14 L4 4 L9 9 L12 2 L15 9 L20 4 L22 14 Z" fill="currentColor" />
              </svg>
            </Crown>
          )}
          {member.bot && <Chip $tone={color.text}>{t('games.kart.lobby.cpu')}</Chip>}
          {isYou && <Chip $tone={color.accent}>{t('games.kart.lobby.you')}</Chip>}
        </Badges>
        {viewerIsHost && !isYou && (
          <ManageButton
            type="button"
            onClick={onManage}
            aria-label={t('games.kart.lobby.manage', { name })}
            title={t('games.kart.lobby.manage', { name })}
            data-testid="kart-lobby-manage"
          >
            <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
              <circle cx="4" cy="10" r="2" fill="currentColor" />
              <circle cx="10" cy="10" r="2" fill="currentColor" />
              <circle cx="16" cy="10" r="2" fill="currentColor" />
            </svg>
          </ManageButton>
        )}
      </Picture>
      <Plate $team={team}>
        <Who
          $fit={nameFit(name)}
          data-testid={member.bot ? 'bot-member' : undefined}
          data-name=""
          title={name}
        >
          {name}
        </Who>
        <Kart>
          <span>{kartName}</span>
          {pick && <span> · {t(`kart.driver.${pick.driver}`)}</span>}
        </Kart>
        <Tags>
          {spec && <li>{t(`kart.series.${spec.series}`)}</li>}
          {spec && <li>{t(`kart.tier.${spec.tier}`)}</li>}
          {member.bot && <li>{t(`games.kart.bot.level.${member.bot.level}`)}</li>}
          {team !== undefined && (
            <TeamTag $team={team}>{t(`games.kart.team.${TEAM_NAMES[team]}`)}</TeamTag>
          )}
        </Tags>
        <State key={state} $state={state} data-testid="kart-lobby-state">
          {stateText}
        </State>
      </Plate>
    </Place>
  )
}

interface OpenPlaceProps {
  seat: number
  stage: LobbyStage | null
  canSit: boolean
  onSit(seat: number): void
  /** The host's way to put a computer kart here: only on the first open place, where it goes */
  onAddBot?: () => void
}

function OpenPlace({ seat, stage, canSit, onSit, onAddBot }: OpenPlaceProps) {
  const t = useT()
  usePicture(stage, seat, null)
  return (
    <Place $state="open" $swatch={color.line} data-testid="kart-lobby-open">
      <Picture $swatch={color.line}>
        <Badges>
          <SeatNumber aria-label={t('games.kart.lobby.seat', { seat: seat + 1 })}>
            {String(seat + 1).padStart(2, '0')}
          </SeatNumber>
        </Badges>
        <Empty>
          <svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true" focusable="false">
            <path d="M20 8v24M8 20h24" stroke="currentColor" strokeWidth="3" />
          </svg>
          <span>{t('games.kart.lobby.empty')}</span>
        </Empty>
      </Picture>
      <OpenActions>
        {canSit && (
          <Button
            $variant="secondary"
            $size="sm"
            aria-label={t('room.waiting.sitIn', { seat: seat + 1 })}
            onClick={() => onSit(seat)}
          >
            {t('room.waiting.sit')}
          </Button>
        )}
        {onAddBot && (
          <Button
            $variant="secondary"
            $size="sm"
            aria-label={t('games.kart.lobby.addBotIn', { seat: seat + 1 })}
            onClick={onAddBot}
            data-testid="kart-lobby-add-bot"
          >
            {t('games.kart.lobby.addBot')}
          </Button>
        )}
      </OpenActions>
    </Place>
  )
}

function ToolIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" />
    </svg>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────────────────────

/** A phone held upright: the list, and a word about turning it */
const UPRIGHT = '(orientation: portrait) and (max-width: 700px)'
/** A short screen (a phone on its side): everything a size smaller */
const SHORT = '(max-height: 520px)'
/** Too narrow for the title beside the tools: upright, or a small window */
const NARROW = `${UPRIGHT}, (max-width: 640px)`

const sweep = keyframes`
  0% { transform: translateX(-40%) skewX(-18deg); opacity: 0; }
  20% { opacity: 0.55; }
  60% { opacity: 0.35; }
  100% { transform: translateX(440%) skewX(-18deg); opacity: 0; }
`

const drift = keyframes`
  from { background-position: 0 0, 0 0; }
  to { background-position: 0 -480px, 0 -320px; }
`

/** The whole screen: under the toasts (10) and the update prompt (11), over the page (TopBar 5) */
const Stage = styled.div`
  position: fixed;
  inset: 0;
  z-index: 9;
  isolation: isolate;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: ${space.sm}px;
  padding: calc(${space.sm}px + env(safe-area-inset-top)) calc(${space.md}px + env(safe-area-inset-right))
    calc(${space.sm}px + env(safe-area-inset-bottom)) calc(${space.md}px + env(safe-area-inset-left));
  overflow: hidden;
  overscroll-behavior: contain;
  background: ${color.bg};
  color: ${color.text};

  & > svg,
  & > div[aria-hidden] {
    z-index: -1;
  }

  @media (min-width: 1200px) and (min-height: 700px) {
    gap: ${space.md}px;
    padding-left: calc(${space.xl}px + env(safe-area-inset-left));
    padding-right: calc(${space.xl}px + env(safe-area-inset-right));
  }

  /* Upright: a page of rows that scrolls, the list of racers last */
  @media ${UPRIGHT} {
    grid-template-rows: none;
    grid-auto-rows: auto;
    align-content: start;
    overflow-y: auto;
  }
`

/** Over the backdrop: a darker floor, a sweep of light now and then, sparks rising */
const Lights = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 50% 120%, color-mix(in srgb, ${color.accent} 22%, transparent), transparent 60%),
    linear-gradient(180deg, color-mix(in srgb, ${color.bg} 35%, transparent), color-mix(in srgb, ${color.bg} 80%, transparent) 70%);

  &::before {
    content: '';
    position: absolute;
    top: -20%;
    bottom: -20%;
    left: 0;
    width: 28%;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, ${color.text} 14%, transparent), transparent);
    animation: ${sweep} 7s ease-in-out infinite;
  }

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
      radial-gradient(circle, color-mix(in srgb, ${color.accent} 70%, transparent) 1.5px, transparent 2px),
      radial-gradient(circle, color-mix(in srgb, ${color.magenta} 60%, transparent) 1px, transparent 1.5px);
    background-size: 220px 240px, 160px 160px;
    opacity: 0.45;
    animation: ${drift} 24s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::before {
      display: none;
    }

    &::after {
      animation: none;
    }
  }
`

const TopBar = styled.header`
  ${broadcast}
  display: flex;
  align-items: center;
  gap: ${space.xs}px ${space.md}px;
  min-width: 0;
  padding: ${space.xs}px ${space.sm}px;

  @media ${SHORT} {
    padding: 2px ${space.xs}px;
  }

  /* Narrow: the title on a row of its own, the tools under it */
  @media ${NARROW} {
    flex-wrap: wrap;
    justify-content: space-between;
  }
`

const Leave = styled(Link)`
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: ${space.xs}px;
  min-height: 36px;
  padding: 0 ${space.xs}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-decoration: none;

  @media (pointer: coarse) {
    min-width: 44px;
    min-height: 44px;
  }
`

/** A tool's words: beside its icon on a big screen, for screen readers only on a small one */
const ToolLabel = styled.span`
  white-space: nowrap;

  @media (max-width: 1180px) {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
`

const TitleBlock = styled.div`
  display: flex;
  flex: 1 1 auto;
  align-items: baseline;
  gap: ${space.xs}px ${space.md}px;
  min-width: 0;

  @media ${NARROW} {
    order: -1;
    flex-basis: 100%;
  }
`

const Title = styled.h1`
  ${displayType}
  margin: 0;
  overflow: hidden;
  font-size: clamp(${fontSize.lg}px, 2.6vh + 8px, ${fontSize.xxl}px);
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;

  @media ${UPRIGHT} {
    font-size: ${fontSize.lg}px;
  }
`

const Count = styled.span`
  ${monoType}
  ${ticker(color.raised, 6)}
  flex: none;
  padding: 0 ${space.sm}px;
  color: ${color.text};
  font-size: 12px;
  font-weight: 700;
`

const Tools = styled.div`
  display: flex;
  flex: none;
  align-items: center;
  gap: ${space.xs}px;
`

const Tool = styled(Button).attrs({ $variant: 'secondary' as const, $size: 'sm' as const })`
  position: relative;
  padding: 0 ${space.md}px;

  @media (max-width: 1180px) {
    padding: 0 ${space.sm}px;
  }
`

const Unread = styled.span`
  ${monoType}
  position: absolute;
  top: -2px;
  right: 2px;
  min-width: 18px;
  padding: 0 4px;
  color: ${color.onAccent};
  background: ${color.magenta};
  border-radius: 9px;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
`

const Body = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) clamp(170px, 22vw, 320px);
  gap: ${space.sm}px;
  min-height: 0;

  @media (min-width: 1200px) and (min-height: 700px) {
    gap: ${space.md}px;
  }

  /* Upright: as tall as what it holds (a grid row would squeeze it to the screen), the rail first */
  @media ${UPRIGHT} {
    display: flex;
    flex-direction: column-reverse;
    justify-content: flex-end;
    min-height: auto;
  }
`

// Clipped (a little outside, for the glows): a ready card's word slamming in from three times its
// size must not make the page scroll
const Line = styled.section`
  display: grid;
  min-width: 0;
  min-height: 0;
  container-type: size;
  overflow: clip;
  overflow-clip-margin: ${space.sm}px;

  @media ${UPRIGHT} {
    container-type: normal;
    overflow: visible;
  }
`

const LineHeading = styled.h2`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
`

const Places = styled.ol`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: ${space.sm}px;
  height: 100%;
  margin: 0;
  padding: 0;
  list-style: none;

  /* Wide enough for a row of eight that are still tall: a cinema screen */
  @container (min-aspect-ratio: 3 / 1) {
    grid-template-columns: repeat(8, minmax(0, 1fr));
    grid-template-rows: minmax(0, 1fr);
  }

  @media ${UPRIGHT} {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: none;
    height: auto;
  }
`

type PlaceState = ReturnType<typeof seatState> | 'open'

const readyFlash = keyframes`
  0% { box-shadow: inset 0 0 0 2px currentColor, 0 0 0 0 currentColor; }
  40% { box-shadow: inset 0 0 0 3px currentColor, 0 0 28px 6px currentColor; }
  100% { box-shadow: inset 0 0 0 2px currentColor, 0 0 14px 0 currentColor; }
`

const Place = styled.li<{ $state: PlaceState; $swatch: string }>`
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  color: ${color.line};
  background: linear-gradient(
    180deg,
    color-mix(in srgb, ${({ $swatch }) => $swatch} 14%, transparent),
    color-mix(in srgb, ${color.bg} 70%, transparent) 75%
  );
  clip-path: ${cutClip(14)};
  box-shadow: inset 0 0 0 1px ${color.line};

  ${({ $state }) =>
    $state === 'ready' &&
    css`
      color: ${color.success};
      box-shadow: inset 0 0 0 2px ${color.success};
      animation: ${readyFlash} 700ms ease-out both;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `}
  ${({ $state }) =>
    $state === 'host' &&
    css`
      box-shadow: inset 0 0 0 2px ${color.accent};
    `}
  ${({ $state }) =>
    $state === 'open' &&
    css`
      background: color-mix(in srgb, ${color.bg} 45%, transparent);
    `}

  @media ${UPRIGHT} {
    grid-template-columns: 96px minmax(0, 1fr);
    grid-template-rows: auto;
    min-height: 88px;
  }
`

/**
 * 2026-11-23 (#151): a phone draws each picture once (lobbyStage.ts); the card sways it a little,
 * each card at its own point of the sway, which costs the compositor nothing
 */
const idleSway = keyframes`
  0%, 100% { transform: translateY(0) rotate(-0.7deg) scale(1); }
  50% { transform: translateY(-1.6%) rotate(0.7deg) scale(1.02); }
`
const SWAYED = [
  '(prefers-reduced-motion: no-preference) and (pointer: coarse)',
  '(prefers-reduced-motion: no-preference) and (max-width: 499px)',
  '(prefers-reduced-motion: no-preference) and (max-height: 499px)',
].join(', ')

const Picture = styled.div<{ $swatch: string; $seat?: number }>`
  position: relative;
  min-height: 0;
  background: radial-gradient(
    ellipse at 50% 88%,
    color-mix(in srgb, ${({ $swatch }) => $swatch} 45%, transparent),
    transparent 62%
  );

  canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }

  @media ${SWAYED} {
    canvas {
      transform-origin: 50% 92%;
      animation: ${idleSway} 5.6s ease-in-out infinite;
      animation-delay: ${({ $seat = 0 }) => -($seat * 0.9).toFixed(1)}s;
      will-change: transform;
    }
  }

  @media ${UPRIGHT} {
    canvas {
      display: none;
    }
  }
`

const Flat = styled.div<{ $shown: boolean }>`
  position: absolute;
  inset: 14% 6% 0;
  display: ${({ $shown }) => ($shown ? 'block' : 'none')};

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  @media ${UPRIGHT} {
    display: block;
    inset: 18% 4% 4%;
  }
`

const Badges = styled.div`
  position: absolute;
  top: ${space.xs}px;
  left: ${space.xs}px;
  right: 40px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px;
`

const SeatNumber = styled.span`
  ${monoType}
  ${ticker(color.raised, 6)}
  padding: 0 ${space.sm}px;
  color: ${color.text};
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
`

const Crown = styled.span`
  display: inline-flex;
  color: ${color.warning};
  filter: drop-shadow(0 0 6px ${color.warning});
`

const Chip = styled.span<{ $tone: string }>`
  ${monoType}
  padding: 0 6px;
  color: ${({ $tone }) => $tone};
  background: color-mix(in srgb, ${color.bg} 70%, transparent);
  border: 1px solid currentColor;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
`

const ManageButton = styled.button`
  position: absolute;
  top: ${space.xs}px;
  right: ${space.xs}px;
  display: grid;
  place-items: center;
  width: 32px;
  height: 28px;
  padding: 0;
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 70%, transparent);
  border: 1px solid ${color.line};
  cursor: pointer;

  &:hover {
    background: ${color.raised};
  }

  @media (pointer: coarse) {
    top: 0;
    right: 0;
    width: 44px;
    height: 44px;
  }
`

const Plate = styled.div<{ $team?: 0 | 1 }>`
  display: grid;
  gap: 1px;
  min-width: 0;
  padding: ${space.xs}px ${space.sm}px ${space.sm}px;
  color: ${color.text};
  background: linear-gradient(
    90deg,
    color-mix(in srgb, ${color.bg} 92%, transparent),
    color-mix(in srgb, ${color.surface} 85%, transparent)
  );
  box-shadow: inset 0 3px 0 ${({ $team }) => ($team === undefined ? color.accent : teamColor($team))};

  /* A phone on its side: the name and the state on one line, so that the picture keeps the height */
  @media ${SHORT} {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    column-gap: ${space.xs}px;
    padding: 2px ${space.xs}px ${space.xs}px;

    & > :not([data-testid='kart-lobby-state']) {
      grid-column: 1 / -1;
    }

    & > :first-child {
      grid-column: 1;
    }

    & > [data-testid='kart-lobby-state'] {
      grid-column: 2;
      grid-row: 1;
    }
  }

  @media ${UPRIGHT} {
    align-content: center;
  }
`

const Who = styled.span<{ $fit: number }>`
  ${displayType}
  overflow: hidden;
  font-size: calc(clamp(${fontSize.sm}px, 1.6vh + 6px, ${fontSize.lg}px) * ${({ $fit }) => $fit});
  text-overflow: ellipsis;
  white-space: nowrap;

  /* 2026-11-23 (#151): a phone on its side cut long names (and a computer's tag) off: shrunk, and
     on two lines if it still does not fit */
  @media ${SHORT} {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-height: 1.08;
    overflow-wrap: anywhere;
    white-space: normal;
  }
`


const Kart = styled.span`
  overflow: hidden;
  color: ${color.muted};
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Tags = styled.ul`
  ${monoType}
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 10px;
  text-transform: uppercase;

  li {
    padding: 0 4px;
    color: ${color.text};
    background: ${color.raised};
  }

  /* One line on a phone on its side: what does not fit goes */
  @media ${SHORT} {
    flex-wrap: nowrap;
    overflow: hidden;
    font-size: 9px;
  }
`

const TeamTag = styled.li<{ $team: 0 | 1 }>`
  && {
    color: ${color.onAccent};
    background: ${({ $team }) => teamColor($team)};
  }
`

const State = styled.span<{ $state: PlaceState }>`
  ${displayType}
  ${({ $state }) => ($state === 'ready' ? slam(360) : '')}
  white-space: nowrap;
  font-size: clamp(${fontSize.sm}px, 2.4vh + 4px, ${fontSize.xl}px);
  line-height: 1.05;
  text-transform: uppercase;
  color: ${({ $state }) =>
    $state === 'ready' ? color.success : $state === 'host' ? color.accent : color.muted};
  text-shadow: ${({ $state }) => ($state === 'ready' ? `0 0 16px ${color.success}` : 'none')};
`

const Empty = styled.span`
  ${displayType}
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: ${space.xs}px;
  color: ${color.muted};
  font-size: ${fontSize.md}px;
  text-transform: uppercase;

  @media ${SHORT} {
    font-size: ${fontSize.sm}px;

    svg {
      width: 24px;
      height: 24px;
    }
  }

  /* Upright, the place is a row: its words are the Sit button's own */
  @media ${UPRIGHT} {
    span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
`

const OpenActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: ${space.xs}px;
  min-height: 40px;
  padding: ${space.xs}px;

  @media ${UPRIGHT} {
    align-content: center;
    justify-content: flex-start;
  }
`

const Rail = styled.aside`
  display: flex;
  flex-direction: column;
  gap: ${space.sm}px;
  min-width: 0;
  min-height: 0;
  overflow: clip;
  overflow-clip-margin: ${space.sm}px;

  & > [data-testid='kart-lobby-track'] {
    flex: 1 1 auto;
  }

  @media ${UPRIGHT} {
    min-height: auto;
    overflow: visible;

    & > [data-testid='kart-lobby-track'] {
      flex: none;
    }
  }
`

const Garage = styled.button`
  ${broadcastSolid}
  display: grid;
  flex: none;
  gap: 2px;
  justify-items: start;
  padding: ${space.xs}px ${space.md}px;
  color: ${color.text};
  background: none;
  border: 0;
  text-align: start;
  cursor: pointer;

  &:hover::before {
    background: ${color.raisedHover};
  }
`

const GarageTag = styled.span`
  ${displayType}
  font-size: ${fontSize.md}px;
  text-transform: uppercase;
`

const GarageKart = styled.span`
  max-width: 100%;
  overflow: hidden;
  color: ${color.muted};
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const StartPanel = styled.div`
  ${broadcastSolid}
  display: grid;
  flex: none;
  gap: ${space.xs}px;
  padding: ${space.sm}px;
`

const pulse = keyframes`
  0%, 100% { filter: drop-shadow(0 0 0 transparent); }
  50% { filter: drop-shadow(0 0 12px currentColor); }
`

/** Ready and Start: the biggest thing beside the racers, glowing while it waits to be pressed */
const BigButton = styled(Button)<{ $live: boolean }>`
  width: 100%;
  min-height: clamp(44px, 9vh, 72px);
  font-size: clamp(${fontSize.lg}px, 3vh + 4px, ${fontSize.xxl}px);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  ${({ $live }) =>
    $live &&
    css`
      animation: ${pulse} 1.6s ease-in-out infinite;

      @media (prefers-reduced-motion: reduce) {
        animation: none;
      }
    `}
`

const Status = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: 12px;
  line-height: 1.3;
`

const StandUp = styled(Button)`
  justify-self: start;
`

const Watchers = styled.p`
  flex: none;
  margin: 0;
  overflow: hidden;
  color: ${color.muted};
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Sideways = styled.p`
  display: none;

  @media ${UPRIGHT} {
    ${ticker(color.warning, 8)}
    display: block;
    order: -1;
    margin: 0;
    padding: ${space.xs}px ${space.md}px;
    color: ${color.onAccent};
    font-size: ${fontSize.sm}px;
    font-weight: 700;
  }
`

const DialogStack = styled.div`
  display: grid;
  gap: ${space.lg}px;
`

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;
  font-weight: 700;

  input {
    width: 20px;
    height: 20px;
    accent-color: ${color.accent};
  }
`

const ManageRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

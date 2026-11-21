// 2026-11-21 (owner: "the waiting room should show everyone's character from the front and what
// they drive, with a background picture, and everyone has to press Ready"): the race room's waiting
// room, its own lazy chunk (WaitingRoom.tsx loads it only for a kart room; the board games keep
// theirs). The idea of a line-up of cards with each racer's face, kart and ready state is common to
// racing games; the drawing, the layout and the words are ours, in the kart's broadcast style
// (src/kart/ui/broadcast.ts, docs/DESIGN.md §3.6).
//
// Eight places in a grid (four by two on a wide screen, two by four on a phone): each with the
// racer seen from the front in 3D (one renderer for all of them, lobbyStage.ts), their name, kart,
// series and tier, team, a computer's tag, the host's crown and, big, whether they are ready. An
// open place says so, with a seat to take and, for the host, a computer kart to add. Beside it the
// track (TrackCard.tsx), the room's options and the rest of the waiting room. Below the places the
// start bar: Ready (or Cancel ready) for everyone but the host; for the host Start, which waits on
// everyone being ready (shared/protocol.ts 8.) and says who it waits for. The garage opens over it.
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import styled, { css } from 'styled-components'
import type { BotLevel } from '../../../shared/games/kart/bots.ts'
import { kartLobbyMessages } from '../../../shared/games/kart/i18n.lobby.ts'
import { kartTeamMessages } from '../../../shared/games/kart/i18n.team.ts'
import { kartSpec, parseLook } from '../../../shared/kart/karts.ts'
import { assignTeams, isTeamId, TEAM_NAMES } from '../../../shared/kart/team.ts'
import { KICK_BAN_MS, type RoomMember, type RoomView } from '../../../shared/protocol.ts'
import { Button } from '../../components/Button.tsx'
import { ConfirmButton } from '../../components/ConfirmButton.tsx'
import { Dialog } from '../../components/Dialog.tsx'
import { Heading, Muted, Section } from '../../components/roomParts.ts'
import { registerMessages } from '../../i18n/t.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { memberName } from '../../lib/memberName.ts'
import { displayType, monoType } from '../../styles/esports.ts'
import { kartBodies } from '../../styles/kartTokens.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { themeNameOf } from '../art/themeName.ts'
import { randomLook } from '../bots/botLook.ts'
import RoomBots from '../bots/RoomBots.tsx'
import { RoomGarage } from '../roster/RoomGarage.tsx'
import { useRoomLook } from '../roster/useRoomLook.ts'
import { teamColor } from '../team/teamColor.ts'
import { broadcastSolid, cutClip, ticker } from '../ui/broadcast.ts'
import { LobbyBackdrop } from './LobbyBackdrop.tsx'
import type { LobbyStage } from './lobbyStage.ts'
import { seatState, waitingOn } from './readiness.ts'
import { raceTrackId, useLobbyTrack } from './lobbyTrack.ts'
import { TrackCard } from './TrackCard.tsx'

registerMessages(kartLobbyMessages)
registerMessages(kartTeamMessages)

const RoomTeams = lazy(() => import('../team/RoomTeams.tsx'))

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
  /** The rest of the waiting room, under the track: the invitation, the options, the chat */
  side: ReactNode
}

/** The 3D pictures: three.js comes after the cards are up, and only where it can draw */
function useLobbyStage(): LobbyStage | null {
  const [stage, setStage] = useState<LobbyStage | null>(null)
  useEffect(() => {
    let live = true
    let made: LobbyStage | null = null
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    const slow =
      (window.matchMedia?.('(pointer: coarse)').matches ?? false) || window.innerWidth < 700
    void import('./lobbyStage.ts').then(
      ({ createLobbyStage }) => {
        if (!live) return
        made = createLobbyStage({ still, slow })
        setStage(made)
      },
      () => {},
    )
    return () => {
      live = false
      made?.dispose()
    }
  }, [])
  return stage
}

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
  side,
}: KartLobbyProps) {
  const t = useT()
  const language = useLanguage()
  const { room, members } = view
  const me = members[you]
  const isHost = me?.host === true
  const trackId = raceTrackId(room.options)
  const track = useLobbyTrack(trackId)
  const look = useRoomLook(members, you, onSetLook, trackId)
  const stage = useLobbyStage()
  const [garage, setGarage] = useState(false)
  const [level, setLevel] = useState<BotLevel>('normal')

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

  return (
    <Stage data-room-columns="" data-testid="kart-lobby">
      <LobbyBackdrop seed={trackId} theme={theme} road={track?.road} />
      <Layout>
        <Column>
          <Line aria-labelledby="kart-lobby-title">
            <Heading id="kart-lobby-title">{t('games.kart.lobby.title')}</Heading>
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
                    onKick={onKick}
                    onTransfer={onTransfer}
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

          <StartBar data-testid="kart-lobby-start">
            <Actions>
              {me && (
                <Button $variant="secondary" onClick={() => setGarage(true)} data-testid="kart-lobby-garage">
                  {t('games.kart.lobby.garage')}
                </Button>
              )}
              {me && me.seat !== null && !isHost && (
                <ReadyButton
                  $size="md"
                  $variant={me.ready ? 'secondary' : 'primary'}
                  aria-pressed={me.ready}
                  onClick={() => onReady(!me.ready)}
                  data-testid="kart-lobby-ready"
                >
                  {me.ready ? t('games.kart.lobby.unready') : t('games.kart.lobby.readyButton')}
                </ReadyButton>
              )}
              {me && me.seat !== null && (
                <Button $variant="ghost" onClick={() => onSit(null)}>
                  {t('room.waiting.standUp')}
                </Button>
              )}
            </Actions>
            {isHost ? (
              <HostStart>
                <Button
                  disabled={!canStart}
                  aria-describedby="kart-lobby-start-hint"
                  onClick={onStart}
                >
                  {t('room.waiting.start')}
                </Button>
                <Muted id="kart-lobby-start-hint" role="status" data-testid="kart-lobby-waiting">
                  {!enough
                    ? t('room.waiting.needPlayers', { count: room.minPlayers })
                    : waiting.length > 0
                      ? t('games.kart.lobby.waitingFor', { names })
                      : t('games.kart.lobby.allReady')}
                </Muted>
              </HostStart>
            ) : me?.seat === null || !me ? (
              <Muted>{t('room.waiting.pickSeat')}</Muted>
            ) : (
              <Muted role="status">
                {me.ready
                  ? t('games.kart.lobby.waitingHost')
                  : t('games.kart.lobby.readyHint')}
              </Muted>
            )}
          </StartBar>

          {spectators.length > 0 && (
            <Section>
              <Heading>{t('games.kart.lobby.spectators')}</Heading>
              <Watchers>
                {spectators.map((member) => (
                  <li key={member.id}>{memberName(member, 'kart')}</li>
                ))}
              </Watchers>
            </Section>
          )}
        </Column>

        <Column>
          <TrackCard options={room.options} track={track} />
          {teams && me && (
            <Suspense>
              <RoomTeams members={members} you={you} onSetTeam={onSetTeam} />
            </Suspense>
          )}
          {isHost && (
            <RoomBots
              free={room.maxSeats - seated.length}
              onAdd={onAddBot}
              level={level}
              onLevel={setLevel}
            />
          )}
          {side}
        </Column>
      </Layout>
      <Dialog open={garage} onClose={() => setGarage(false)} title={t('kart.roster.title')}>
        <RoomGarage look={look} />
      </Dialog>
    </Stage>
  )
}

interface PlaceCardProps {
  seat: number
  member: RoomMember
  isYou: boolean
  viewerIsHost: boolean
  team: 0 | 1 | undefined
  stage: LobbyStage | null
  onKick(memberId: string): void
  onTransfer(memberId: string): void
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

function PlaceCard({
  seat,
  member,
  isYou,
  viewerIsHost,
  team,
  stage,
  onKick,
  onTransfer,
}: PlaceCardProps) {
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
  return (
    <Place
      $state={state}
      $team={team}
      data-member={member.id}
      data-state={state}
      data-testid="kart-lobby-place"
    >
      <Top>
        <PlaceNumber>{t('games.kart.lobby.seat', { seat: seat + 1 })}</PlaceNumber>
        {member.host && (
          <Crown aria-label={t('games.kart.lobby.host')} role="img" data-testid="kart-lobby-crown">
            <svg viewBox="0 0 24 16" width="22" height="15" aria-hidden="true" focusable="false">
              <path d="M2 14 L4 4 L9 9 L12 2 L15 9 L20 4 L22 14 Z" fill="currentColor" />
            </svg>
          </Crown>
        )}
        {member.bot && <Chip $tone={color.muted}>{t('games.kart.lobby.cpu')}</Chip>}
        {member.bot && (
          <Chip $tone={color.muted}>{t(`games.kart.bot.level.${member.bot.level}`)}</Chip>
        )}
        {isYou && <Chip $tone={color.accent}>{t('games.kart.lobby.you')}</Chip>}
        {team !== undefined && (
          <Chip $tone={teamColor(team)}>{t(`games.kart.team.${TEAM_NAMES[team]}`)}</Chip>
        )}
      </Top>
      <Picture $swatch={pick ? kartBodies[pick.kart].accent : color.line}>
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
      </Picture>
      <Who data-testid={member.bot ? 'bot-member' : undefined}>{name}</Who>
      <Kart>
        <span>{kartName}</span>
        {pick && <span> · {t(`kart.driver.${pick.driver}`)}</span>}
      </Kart>
      {spec && (
        <Tags>
          <li>{t(`kart.series.${spec.series}`)}</li>
          <li>{t(`kart.tier.${spec.tier}`)}</li>
        </Tags>
      )}
      <State $state={state} data-testid="kart-lobby-state">
        {stateText}
      </State>
      {viewerIsHost && !isYou && (
        <HostRow>
          {member.bot ? (
            <Button
              $variant="ghost"
              $size="sm"
              aria-label={t('games.kart.bot.removeNamed', { name })}
              onClick={() => onKick(member.id)}
            >
              {t('games.kart.bot.remove')}
            </Button>
          ) : (
            <>
              {member.online && (
                <ConfirmButton
                  variant="ghost"
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
            </>
          )}
        </HostRow>
      )}
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
    <Place $state="open" data-testid="kart-lobby-open">
      <Top>
        <PlaceNumber>{t('games.kart.lobby.seat', { seat: seat + 1 })}</PlaceNumber>
      </Top>
      <Empty>{t('games.kart.lobby.empty')}</Empty>
      <HostRow>
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
      </HostRow>
    </Place>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────────────────────

/** The backdrop fills the whole waiting room, panels over it */
const Stage = styled.div`
  position: relative;
  isolation: isolate;
  overflow: hidden;
  padding: ${space.md}px;
  clip-path: ${cutClip(18)};

  & > svg,
  & > div[aria-hidden] {
    z-index: -1;
  }

  @media (min-width: 900px) {
    padding: ${space.xl}px;
  }
`

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
  gap: ${space.lg}px;

  @media (min-width: 900px) {
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    gap: ${space.xl}px;
  }
`

const Column = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: ${space.lg}px;
`

const Line = styled.section`
  ${broadcastSolid}
  display: grid;
  gap: ${space.md}px;
  padding: ${space.md}px;

  @media (min-width: 900px) {
    padding: ${space.lg}px;
  }
`

const Places = styled.ol`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;

  @media (min-width: 640px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
`

type PlaceState = ReturnType<typeof seatState> | 'open'

const Place = styled.li<{ $state: PlaceState; $team?: 0 | 1 }>`
  position: relative;
  display: grid;
  align-content: start;
  gap: 2px;
  min-width: 0;
  padding: ${space.sm}px;
  background: ${color.sunken};
  clip-path: ${cutClip(10)};
  box-shadow: inset 0 0 0 1px ${color.line};
  ${({ $team }) =>
    $team !== undefined &&
    css`
      border-top: 4px solid ${teamColor($team)};
    `}
  ${({ $state }) =>
    $state === 'ready' &&
    css`
      box-shadow:
        inset 0 0 0 2px ${color.success},
        inset 0 0 24px color-mix(in srgb, ${color.success} 35%, transparent);
    `}
  ${({ $state }) =>
    $state === 'host' &&
    css`
      box-shadow: inset 0 0 0 2px ${color.accent};
    `}
  ${({ $state }) =>
    $state === 'open' &&
    css`
      background: transparent;
      box-shadow: inset 0 0 0 1px ${color.line};

      @media (min-width: 640px) {
        min-height: 120px;
      }
    `}
`

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px;
  min-height: 22px;
`

const PlaceNumber = styled.span`
  ${monoType}
  ${ticker(color.raised, 6)}
  padding: 0 ${space.sm}px;
  color: ${color.text};
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
`

const Crown = styled.span`
  display: inline-flex;
  color: ${color.warning};
`

const Chip = styled.span<{ $tone: string }>`
  ${monoType}
  padding: 0 6px;
  color: ${({ $tone }) => $tone};
  border: 1px solid currentColor;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
`

const Picture = styled.div<{ $swatch: string }>`
  position: relative;
  aspect-ratio: 11 / 9;
  background: radial-gradient(
    ellipse at 50% 75%,
    color-mix(in srgb, ${({ $swatch }) => $swatch} 30%, transparent),
    transparent 70%
  );

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
`

const Who = styled.span`
  ${displayType}
  font-size: ${fontSize.md}px;
  overflow-wrap: anywhere;
`

const Kart = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

const Tags = styled.ul`
  ${monoType}
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 11px;
  text-transform: uppercase;

  li {
    padding: 0 4px;
    color: ${color.text};
    background: ${color.raised};
  }
`

const State = styled.span<{ $state: PlaceState }>`
  ${displayType}
  margin-top: ${space.xs}px;
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
  color: ${({ $state }) =>
    $state === 'ready' ? color.success : $state === 'host' ? color.accent : color.muted};
`

const Empty = styled.span`
  ${displayType}
  display: grid;
  place-items: center;
  min-height: 32px;

  @media (min-width: 640px) {
    min-height: 72px;
  }

  color: ${color.muted};
  font-size: ${fontSize.lg}px;
  text-transform: uppercase;
`

const HostRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
  margin-top: ${space.xs}px;
`

const StartBar = styled.div`
  ${broadcastSolid}
  /* On a phone the eight places are a long way down: Ready and Start come first */
  order: -1;

  @media (min-width: 640px) {
    order: 0;
  }

  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.md}px;
  padding: ${space.lg}px;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const ReadyButton = styled(Button)`
  min-width: 9em;
  font-size: ${fontSize.lg}px;
`

const HostStart = styled.div`
  display: grid;
  gap: ${space.xs}px;
  justify-items: end;
  text-align: end;
`

const Watchers = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.md}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

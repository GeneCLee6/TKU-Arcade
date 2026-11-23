// /kart?online (2026-11-23, docs/ARCHITECTURE.md §4.83): the kart's online races, as a broadcast's
// match centre. Quick join (an open public room, or a new public one on the track of the week), a new
// room for friends (named, public or private), and the public race rooms: waiting or racing, people
// and computer karts, locked or not, kept fresh while the page is visible. Its own lazy chunk: the
// kart's menu and a race never load it.
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import styled, { css } from 'styled-components'
import { BOT_LEVELS, type BotLevel } from '../../../shared/games/kart/bots.ts'
import { weeklyTrack } from '../../../shared/kart/board.ts'
import { KART_ONLINE_MESSAGES } from '../../../shared/kart/i18n.online.ts'
import { KART_MESSAGES, type KartMessageKey } from '../../../shared/kart/i18n.ts'
import { RACE_TRACK_IDS, type RaceTrackId } from '../../../shared/kart/tracks/list.ts'
import type { RoomListing } from '../../../shared/protocol.ts'
import { MAX_ROOM_NAME_CHARS, normalizeRoomName, roomNameIssue } from '../../../shared/roomName.ts'
import { Button } from '../../components/Button.tsx'
import { registerMessages, type MessageParams } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { readNickname } from '../../lib/nickname.ts'
import { useNavigate } from '../../lib/useRouter.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { useMenuMusic } from '../audio/useMenuMusic.ts'
import { broadcast, digits, ticker } from '../ui/broadcast.ts'
import { KART_ROOMS_POLL_MS, createKartRoom, fetchKartRooms, quickJoin, type RoomFailure } from './api.ts'
import {
  ALL_ROOMS,
  driversIn,
  filterRooms,
  humansIn,
  roomState,
  type RoomFilters,
  type ShowFilter,
} from './roomList.ts'

registerMessages(KART_MESSAGES)
registerMessages(KART_ONLINE_MESSAGES)

type T = (key: KartMessageKey, params?: MessageParams) => string

/** Computer karts quick join may seat in a new room */
const BOT_COUNTS = [0, 1, 3, 5] as const

const failureKey = (failure: RoomFailure): KartMessageKey =>
  failure === 'paused'
    ? 'kart.online.error.paused'
    : failure === 'rate_limited'
      ? 'kart.online.error.rateLimited'
      : failure === 'bad_name'
        ? 'kart.online.name.blocked'
        : 'kart.online.error.failed'

type List = { rooms: RoomListing[] | null; failed: boolean; at: number | null }

/** The kart's rooms, asked for again every KART_ROOMS_POLL_MS while the page is visible */
function useKartRooms(): List & { refresh: () => void } {
  const [list, setList] = useState<List>({ rooms: null, failed: false, at: null })
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let latest = 0
    const poll = async () => {
      const mine = ++latest
      clearTimeout(timer)
      const rooms = await fetchKartRooms(controller.signal)
      if (controller.signal.aborted || mine !== latest) return
      setList((previous) =>
        rooms ? { rooms, failed: false, at: Date.now() } : { ...previous, failed: true },
      )
      // A hidden tab asks nothing: coming back asks at once
      if (!document.hidden) timer = setTimeout(() => void poll(), KART_ROOMS_POLL_MS)
    }
    const onVisibility = () => {
      clearTimeout(timer)
      if (!document.hidden) void poll()
    }
    void poll()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [asked])
  const refresh = useCallback(() => setAsked((n) => n + 1), [])
  return { ...list, refresh }
}

/** Seconds since `at`, ticking once a second */
function useAge(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000)
    return () => clearInterval(timer)
  }, [])
  return at === null ? null : Math.max(0, Math.round((now - at) / 1_000))
}

export default function OnlineView({ onExit }: { onExit: () => void }) {
  const t: T = useT()
  useMenuMusic()
  const navigate = useNavigate()
  const list = useKartRooms()
  const age = useAge(list.at)
  const [weekly] = useState<RaceTrackId>(() => weeklyTrack(Date.now()))
  const nick = readNickname()
  const ids = { bots: useId(), level: useId(), show: useId(), mode: useId(), locked: useId() }

  const [busy, setBusy] = useState<'quick' | 'create' | null>(null)
  const [problem, setProblem] = useState<RoomFailure | null>(null)
  const [botCount, setBotCount] = useState<number>(3)
  const [botLevel, setBotLevel] = useState<BotLevel>('normal')
  const [creating, setCreating] = useState(false)
  const [filters, setFilters] = useState<RoomFilters>(ALL_ROOMS)

  const goQuick = async () => {
    setBusy('quick')
    setProblem(null)
    const answer = await quickJoin(botCount > 0 ? { seatBots: { count: botCount, level: botLevel } } : {})
    setBusy(null)
    if (typeof answer === 'string') setProblem(answer)
    else navigate(`/r/${answer.id}`)
  }

  const rooms = list.rooms ?? []
  const shown = filterRooms(rooms, filters)

  return (
    <Page data-testid="kart-online">
      <Card>
        <Header>
          <TitleRow>
            <Title>{t('kart.online.title')}</Title>
            <LiveTag aria-hidden="true">{t('kart.online.live')}</LiveTag>
            {list.rooms && (
              <Meta data-testid="kart-online-summary">
                {t('kart.online.summary', { rooms: rooms.length, drivers: driversIn(rooms) })}
              </Meta>
            )}
          </TitleRow>
          <Button type="button" $size="sm" $variant="secondary" onClick={onExit} data-testid="kart-online-exit">
            {t('kart.online.back')}
          </Button>
        </Header>

        <Actions>
          <Tile $primary aria-labelledby="kart-online-quick-title">
            <TileTitle id="kart-online-quick-title">{t('kart.online.quick.title')}</TileTitle>
            <Note>{t('kart.online.quick.note')}</Note>
            <Fields>
              <Field>
                <label htmlFor={ids.bots}>{t('kart.online.quick.bots')}</label>
                <select
                  id={ids.bots}
                  value={botCount}
                  onChange={(event) => setBotCount(Number(event.target.value))}
                  data-testid="kart-online-quick-bots"
                >
                  {BOT_COUNTS.map((count) => (
                    <option key={count} value={count}>
                      {count === 0 ? t('kart.online.quick.botsNone') : t('kart.online.quick.botsCount', { count })}
                    </option>
                  ))}
                </select>
              </Field>
              {botCount > 0 && (
                <Field>
                  <label htmlFor={ids.level}>{t('kart.online.quick.level')}</label>
                  <select
                    id={ids.level}
                    value={botLevel}
                    onChange={(event) => setBotLevel(event.target.value as BotLevel)}
                  >
                    {BOT_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {t(`kart.bots.difficulty.${level}`)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </Fields>
            <Button
              type="button"
              disabled={busy !== null}
              onClick={() => void goQuick()}
              data-testid="kart-online-quick"
            >
              {busy === 'quick' ? t('kart.online.quick.going') : t('kart.online.quick.go')}
            </Button>
          </Tile>

          <Tile aria-labelledby="kart-online-create-title">
            <TileTitle id="kart-online-create-title">{t('kart.online.create.title')}</TileTitle>
            <Note>{t('kart.online.create.note')}</Note>
            {creating ? (
              <CreateForm
                t={t}
                nick={nick}
                weekly={weekly}
                busy={busy !== null}
                onCancel={() => setCreating(false)}
                onCreate={async (ask) => {
                  setBusy('create')
                  setProblem(null)
                  const answer = await createKartRoom(ask)
                  setBusy(null)
                  if (answer === 'paused' || answer === 'rate_limited' || answer === 'bad_name' || answer === 'failed') {
                    setProblem(answer)
                  } else navigate(`/r/${answer}`)
                }}
              />
            ) : (
              <Button
                type="button"
                $variant="secondary"
                disabled={busy !== null}
                onClick={() => setCreating(true)}
                data-testid="kart-online-create-open"
              >
                {t('kart.online.create.open')}
              </Button>
            )}
          </Tile>
        </Actions>

        {problem && (
          <Problem role="alert" data-testid="kart-online-problem">
            {t(failureKey(problem))}
          </Problem>
        )}

        <ListHead>
          <SectionTitle>{t('kart.online.list.title')}</SectionTitle>
          <Updated aria-live="off">
            {age !== null && t('kart.online.list.updated', { seconds: age })}
          </Updated>
          <Button type="button" $size="sm" $variant="ghost" onClick={list.refresh} data-testid="kart-online-refresh">
            {t('kart.online.list.refresh')}
          </Button>
        </ListHead>

        <Filters>
          <Chips role="radiogroup" aria-label={t('kart.online.filter.label')}>
            {(['all', 'open', 'live'] as ShowFilter[]).map((show) => (
              <Chip
                key={show}
                type="button"
                role="radio"
                aria-checked={filters.show === show}
                $on={filters.show === show}
                onClick={() => setFilters((now) => ({ ...now, show }))}
                data-testid={`kart-online-show-${show}`}
              >
                {t(`kart.online.filter.${show}`)}
              </Chip>
            ))}
          </Chips>
          <Field $inline>
            <label htmlFor={ids.mode}>{t('kart.online.filter.mode')}</label>
            <select
              id={ids.mode}
              value={filters.mode ?? ''}
              onChange={(event) => setFilters((now) => ({ ...now, mode: event.target.value || null }))}
              data-testid="kart-online-mode"
            >
              <option value="">{t('kart.online.filter.anyMode')}</option>
              <option value="items">{t('kart.online.mode.items')}</option>
              <option value="race">{t('kart.online.mode.race')}</option>
            </select>
          </Field>
          <Check>
            <input
              id={ids.locked}
              type="checkbox"
              checked={filters.locked}
              onChange={(event) => setFilters((now) => ({ ...now, locked: event.target.checked }))}
            />
            <label htmlFor={ids.locked}>{t('kart.online.filter.locked')}</label>
          </Check>
        </Filters>

        {list.rooms === null && !list.failed && <Status role="status">{t('kart.online.list.loading')}</Status>}
        {list.failed && (
          <Status role="alert" data-testid="kart-online-failed">
            {t('kart.online.list.failed')}
          </Status>
        )}
        {list.rooms && rooms.length === 0 && <Status data-testid="kart-online-empty">{t('kart.online.list.empty')}</Status>}
        {rooms.length > 0 && shown.length === 0 && <Status>{t('kart.online.list.noneMatch')}</Status>}
        {shown.length > 0 && (
          <Rooms data-testid="kart-online-rooms" aria-label={t('kart.online.list.title')}>
            {shown.map((room) => (
              <RoomRow key={room.id} t={t} room={room} onGo={() => navigate(`/r/${room.id}`)} />
            ))}
          </Rooms>
        )}
      </Card>
    </Page>
  )
}

function RoomRow({ t, room, onGo }: { t: T; room: RoomListing; onGo: () => void }) {
  const state = roomState(room)
  const title = room.name ?? t('kart.online.room.unnamed', { host: room.host })
  const track = typeof room.options?.track === 'string' ? room.options.track : null
  const trackName =
    track && (RACE_TRACK_IDS as readonly string[]).includes(track)
      ? t(`kart.course.${track as RaceTrackId}`)
      : t('kart.online.room.custom')
  const mode = room.options?.mode === 'race' ? 'race' : 'items'
  const teams = room.options?.teams === 'teams' ? 'teams' : 'solo'
  const laps = typeof room.options?.laps === 'number' ? room.options.laps : null
  const humans = humansIn(room)
  const bots = room.bots ?? 0
  const watch = state === 'racing' || state === 'full'
  return (
    <Row data-testid="kart-online-room" data-room={room.id} data-state={state} $state={state}>
      <StatePill $state={state}>
        {state === 'racing' ? t('kart.online.room.racing') : t('kart.online.room.waiting')}
      </StatePill>
      <Who>
        <RoomName>
          {title}
          {room.locked && <LockTag data-testid="kart-online-locked">{t('kart.online.room.locked')}</LockTag>}
        </RoomName>
        <Small>{t('kart.online.room.host', { host: room.host })}</Small>
      </Who>
      <Race>
        <TrackName>{trackName}</TrackName>
        <Small>
          {t(`kart.online.mode.${mode}`)} · {t(`kart.online.teams.${teams}`)}
          {laps !== null && ` · ${t('kart.online.room.laps', { laps })}`}
        </Small>
      </Race>
      <People>
        <Seats $full={room.seated >= room.maxSeats}>
          {t('kart.online.room.seats', { seated: room.seated, max: room.maxSeats })}
        </Seats>
        <Small>
          {bots > 0
            ? t('kart.online.room.people', { humans, bots })
            : t('kart.online.room.peopleOnly', { humans })}
        </Small>
      </People>
      <Go>
        <Button
          type="button"
          $size="sm"
          $variant={watch ? 'secondary' : 'primary'}
          onClick={onGo}
          aria-label={t(watch ? 'kart.online.room.watchOf' : 'kart.online.room.joinOf', { room: title })}
          data-testid="kart-online-go"
        >
          {watch ? t('kart.online.room.watch') : t('kart.online.room.join')}
        </Button>
      </Go>
    </Row>
  )
}

function CreateForm({
  t,
  nick,
  weekly,
  busy,
  onCancel,
  onCreate,
}: {
  t: T
  nick: string | null
  weekly: RaceTrackId
  busy: boolean
  onCancel: () => void
  onCreate: (ask: { options: Record<string, string | number>; public: boolean; name?: string }) => void
}) {
  const ids = { name: useId(), track: useId(), mode: useId(), teams: useId(), issue: useId() }
  const [name, setName] = useState('')
  const [track, setTrack] = useState<RaceTrackId>(weekly)
  const [mode, setMode] = useState('items')
  const [teams, setTeams] = useState('solo')
  // From "Invite friends": private unless asked (2026-11-23); quick join's rooms are the public ones
  const [isPublic, setPublic] = useState(false)
  const typed = name.trim() !== ''
  const issue = typed ? roomNameIssue(name) : null

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (issue) return
    const clean = typed ? normalizeRoomName(name) : null
    onCreate({
      options: { track, mode, teams },
      public: isPublic,
      ...(clean ? { name: clean } : {}),
    })
  }

  return (
    <Form onSubmit={submit} data-testid="kart-online-create">
      <Field>
        <label htmlFor={ids.name}>{t('kart.online.create.name')}</label>
        <input
          id={ids.name}
          value={name}
          maxLength={MAX_ROOM_NAME_CHARS * 2}
          placeholder={nick ? t('kart.online.create.namePlaceholder', { nick }) : t('kart.online.create.nameAny')}
          aria-invalid={issue !== null}
          aria-describedby={issue ? ids.issue : undefined}
          onChange={(event) => setName(event.target.value)}
          data-testid="kart-online-create-name"
        />
        {issue && issue !== 'empty' && (
          <Problem id={ids.issue} data-testid="kart-online-name-issue">
            {issue === 'tooLong'
              ? t('kart.online.name.tooLong', { max: MAX_ROOM_NAME_CHARS })
              : t(`kart.online.name.${issue}`)}
          </Problem>
        )}
      </Field>
      <Fields>
        <Field>
          <label htmlFor={ids.track}>{t('kart.online.create.track')}</label>
          <select id={ids.track} value={track} onChange={(event) => setTrack(event.target.value as RaceTrackId)}>
            {RACE_TRACK_IDS.map((one) => (
              <option key={one} value={one}>
                {t(`kart.course.${one}`)}
                {one === weekly ? ` · ${t('kart.online.create.weekly')}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field>
          <label htmlFor={ids.mode}>{t('kart.online.create.mode')}</label>
          <select id={ids.mode} value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="items">{t('kart.online.mode.items')}</option>
            <option value="race">{t('kart.online.mode.race')}</option>
          </select>
        </Field>
        <Field>
          <label htmlFor={ids.teams}>{t('kart.online.create.teams')}</label>
          <select id={ids.teams} value={teams} onChange={(event) => setTeams(event.target.value)}>
            <option value="solo">{t('kart.online.teams.solo')}</option>
            <option value="teams">{t('kart.online.teams.teams')}</option>
          </select>
        </Field>
      </Fields>
      <Who as="fieldset">
        <legend>{t('kart.online.create.who')}</legend>
        <Check>
          <input
            type="radio"
            name="kart-online-who"
            id={`${ids.name}-private`}
            checked={!isPublic}
            onChange={() => setPublic(false)}
            data-testid="kart-online-create-private"
          />
          <label htmlFor={`${ids.name}-private`}>{t('kart.online.create.private')}</label>
        </Check>
        <Check>
          <input
            type="radio"
            name="kart-online-who"
            id={`${ids.name}-public`}
            checked={isPublic}
            onChange={() => setPublic(true)}
            data-testid="kart-online-create-public"
          />
          <label htmlFor={`${ids.name}-public`}>{t('kart.online.create.public')}</label>
        </Check>
      </Who>
      <FormButtons>
        <Button type="submit" disabled={busy || issue !== null} data-testid="kart-online-create-go">
          {busy ? t('kart.online.create.going') : t('kart.online.create.go')}
        </Button>
        <Button type="button" $variant="ghost" onClick={onCancel}>
          {t('kart.online.create.cancel')}
        </Button>
      </FormButtons>
    </Form>
  )
}

const Page = styled.main`
  position: fixed;
  inset: 0;
  display: grid;
  place-items: start center;
  padding: ${space.lg}px ${space.md}px;
  overflow-y: auto;
  background: ${color.bg};
`

const Card = styled.section`
  ${broadcast}
  display: grid;
  gap: ${space.md}px;
  width: min(1000px, 100%);
  padding: ${space.lg}px;
  color: ${color.text};

  @media (max-width: 599px) {
    padding: ${space.md}px;
  }
`

const Header = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
  align-items: center;
  justify-content: space-between;
`

const TitleRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px ${space.md}px;
  align-items: center;
`

const Title = styled.h1`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
`

const LiveTag = styled.span`
  ${ticker(color.magenta)}
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-transform: uppercase;
`

const Meta = styled.span`
  ${digits}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Actions = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr));
  gap: ${space.md}px;
`

const Tile = styled.section<{ $primary?: boolean }>`
  display: grid;
  align-content: start;
  gap: ${space.sm}px;
  padding: ${space.md}px;
  background: ${color.raised};
  border-left: 3px solid ${(p) => (p.$primary ? color.accent : color.magenta)};
`

const TileTitle = styled.h2`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.xl}px;
  text-transform: uppercase;
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Fields = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px ${space.md}px;
`

const Field = styled.div<{ $inline?: boolean }>`
  display: ${(p) => (p.$inline ? 'flex' : 'grid')};
  gap: ${space.xs}px ${space.sm}px;
  align-items: ${(p) => (p.$inline ? 'center' : 'stretch')};
  min-width: 0;
  font-size: ${fontSize.sm}px;

  select,
  input:not([type]) {
    min-height: 36px;
    max-width: 100%;
    font: inherit;
    font-size: ${fontSize.md}px;
  }
`

const Check = styled.div`
  display: flex;
  gap: ${space.xs}px;
  align-items: center;
  font-size: ${fontSize.sm}px;

  input {
    width: 20px;
    height: 20px;
    margin: 0;
  }
`

const Form = styled.form`
  display: grid;
  gap: ${space.sm}px;

  fieldset {
    display: grid;
    gap: ${space.xs}px;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    padding: 0;
    margin-bottom: ${space.xs}px;
    font-size: ${fontSize.sm}px;
  }
`

const FormButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

const Problem = styled.p`
  margin: 0;
  color: ${color.danger};
  font-size: ${fontSize.sm}px;
`

const ListHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
  align-items: center;
`

const SectionTitle = styled.h2`
  ${displayType}
  margin: 0;
  margin-right: auto;
  font-size: ${fontSize.xl}px;
  text-transform: uppercase;
`

const Updated = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px ${space.md}px;
  align-items: center;
`

const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const Chip = styled.button<{ $on: boolean }>`
  ${(p) => ticker(p.$on ? color.accent : color.raised, 6)}
  min-height: 32px;
  padding: 0 ${space.md}px;
  border: 0;
  color: ${(p) => (p.$on ? color.onAccent : color.text)};
  font: inherit;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  cursor: pointer;

  @media (pointer: coarse) {
    min-height: 44px;
  }
`

const Status = styled.p`
  margin: 0;
  color: ${color.muted};
`

// State, room, track, people, button; a phone stacks them in two rows
const columns = css`
  display: grid;
  grid-template-columns: 96px minmax(0, 1.4fr) minmax(0, 1.2fr) 120px auto;
  gap: ${space.sm}px ${space.md}px;
  align-items: center;

  @media (max-width: 699px) {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: 'state go' 'who who' 'race people';
  }
`

const Rooms = styled.ul`
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const stateFill = (state: string) =>
  state === 'racing' ? color.magenta : state === 'open' ? color.success : color.muted

const Row = styled.li<{ $state: string }>`
  ${columns}
  padding: ${space.sm}px;
  background: ${color.raised};
  border-left: 3px solid ${(p) => stateFill(p.$state)};
`

const StatePill = styled.span<{ $state: string }>`
  ${(p) => ticker(stateFill(p.$state), 6)}
  justify-self: start;
  padding: 2px ${space.md}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;

  @media (max-width: 699px) {
    grid-area: state;
  }
`

const Who = styled.div`
  display: grid;
  min-width: 0;

  @media (max-width: 699px) {
    grid-area: who;
  }
`

const RoomName = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.sm}px;
  align-items: center;
  font-weight: 700;
  overflow-wrap: anywhere;
`

const LockTag = styled.span`
  padding: 0 ${space.xs}px;
  border: 1px solid ${color.warning};
  color: ${color.warning};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Small = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Race = styled.div`
  display: grid;
  min-width: 0;

  @media (max-width: 699px) {
    grid-area: race;
  }
`

const TrackName = styled.span`
  font-weight: 700;
`

const People = styled.div`
  display: grid;

  @media (max-width: 699px) {
    grid-area: people;
    justify-items: end;
  }
`

const Seats = styled.span<{ $full: boolean }>`
  ${digits}
  color: ${(p) => (p.$full ? color.muted : color.text)};
  font-size: ${fontSize.lg}px;
`

const Go = styled.div`
  justify-self: end;

  @media (max-width: 699px) {
    grid-area: go;
  }
`

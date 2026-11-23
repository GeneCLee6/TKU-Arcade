// /kart?board (2026-11-23, docs/ARCHITECTURE.md §4.81): the time trial's site-wide leaderboard, as a
// race broadcast's standings. A track at a time (the track of the week first), its top 100, your own
// rank wherever it is, and on every row its replay to download or its ghost to race. Its own lazy
// chunk: the kart's menu and a race never load it.
import { useCallback, useEffect, useId, useState } from 'react'
import styled, { css } from 'styled-components'
import {
  BOARD_TRACKS,
  boardTime,
  isBoardTrack,
  weeklyTrack,
  type BoardEntry,
  type BoardResponse,
} from '../../../shared/kart/board.ts'
import { KART_BOARD_MESSAGES } from '../../../shared/kart/i18n.board.ts'
import { KART_MESSAGES, type KartMessageKey } from '../../../shared/kart/i18n.ts'
import type { AnyRaceTrackId } from '../../../shared/kart/tracks/list.ts'
import { Button } from '../../components/Button.tsx'
import { registerMessages, type MessageParams } from '../../i18n/t.ts'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { readNickname } from '../../lib/nickname.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { useMenuMusic } from '../audio/useMenuMusic.ts'
import { broadcast, digits, ticker } from '../ui/broadcast.ts'
import { fetchBoard, fetchGhost, replayAddress } from './api.ts'
import type { BoardChase } from './chase.ts'

registerMessages(KART_MESSAGES)
registerMessages(KART_BOARD_MESSAGES)

type T = (key: KartMessageKey, params?: MessageParams) => string

type Load =
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ready'; readonly board: BoardResponse }

/** The track the address asks for (`?board=<id>`), else the week's */
function boardTrackAsked(now = Date.now()): AnyRaceTrackId {
  const asked = new URLSearchParams(window.location.search).get('board')
  return isBoardTrack(asked) ? asked : weeklyTrack(now)
}

export default function BoardView({
  onExit,
  onChase,
  onDrive,
}: {
  onExit: () => void
  /** Races a row's ghost in the time trial on its track */
  onChase: (chase: BoardChase) => void
  /** Drives the track in the time trial */
  onDrive: (track: AnyRaceTrackId) => void
}) {
  const t: T = useT()
  const language = useLanguage()
  useMenuMusic()
  const pickId = useId()
  const [track, setTrack] = useState<AnyRaceTrackId>(() => boardTrackAsked())
  const [weekly] = useState<AnyRaceTrackId>(() => weeklyTrack(Date.now()))
  const [attempt, setAttempt] = useState(0)
  // What came back, for which ask: anything else is still loading
  const [answer, setAnswer] = useState<{ key: string; load: Load } | null>(null)
  const key = `${track}|${attempt}`
  const [preparing, setPreparing] = useState<string | null>(null)
  const [chaseFailed, setChaseFailed] = useState(false)
  const nick = readNickname()

  useEffect(() => {
    let live = true
    fetchBoard(track, nick)
      .then((board) => live && setAnswer({ key, load: { kind: 'ready', board } }))
      .catch(() => live && setAnswer({ key, load: { kind: 'failed' } }))
    return () => {
      live = false
    }
  }, [track, nick, key])
  const load: Load = answer?.key === key ? answer.load : { kind: 'loading' }

  const pick = useCallback((next: AnyRaceTrackId) => {
    const url = new URL(window.location.href)
    url.searchParams.set('board', next)
    window.history.replaceState(null, '', url)
    setChaseFailed(false)
    setTrack(next)
  }, [])

  const chase = async (entry: BoardEntry) => {
    setPreparing(entry.id)
    setChaseFailed(false)
    const ghost = await fetchGhost(entry.id, track)
    setPreparing(null)
    if (!ghost) {
      setChaseFailed(true)
      return
    }
    onChase({ track, ghost, nick: entry.nick, totalMs: entry.totalMs })
  }

  const dated = (at: number) =>
    new Intl.DateTimeFormat(language, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  const board = load.kind === 'ready' ? load.board : null
  const youId = board?.you?.id ?? null

  return (
    <Page data-testid="kart-board">
      <Card>
        <Header>
          <Title>{t('kart.board.title')}</Title>
          <Button type="button" $size="sm" $variant="secondary" onClick={onExit} data-testid="kart-board-exit">
            {t('kart.board.back')}
          </Button>
        </Header>
        <Intro>{t('kart.board.intro')}</Intro>

        <Picker>
          <label htmlFor={pickId}>{t('kart.board.track')}</label>
          <select
            id={pickId}
            value={track}
            onChange={(event) => pick(event.target.value as AnyRaceTrackId)}
            data-testid="kart-board-track"
          >
            {BOARD_TRACKS.map((one) => (
              <option key={one} value={one}>
                {t(`kart.course.${one}`)}
                {one === weekly ? ` · ${t('kart.board.weekly')}` : ''}
              </option>
            ))}
          </select>
          {track !== weekly && (
            <Button type="button" $size="sm" $variant="ghost" onClick={() => pick(weekly)} data-testid="kart-board-weekly">
              {t('kart.board.weekly')}
            </Button>
          )}
        </Picker>

        <TrackBar>
          <TrackName>{t(`kart.course.${track}`)}</TrackName>
          {track === weekly && (
            <WeeklyTag data-testid="kart-board-weekly-tag" title={t('kart.board.weeklyNote')}>
              {t('kart.board.weekly')}
            </WeeklyTag>
          )}
          {board && (
            <Meta>
              {t('kart.board.count', { total: board.total })} · {t('kart.board.revision', { revision: board.revision })}
            </Meta>
          )}
          <Button type="button" $size="sm" onClick={() => onDrive(track)} data-testid="kart-board-drive">
            {t('kart.board.drive')}
          </Button>
        </TrackBar>

        {board && (
          <Mine data-testid="kart-board-you">
            {board.you
              ? t('kart.board.yourRank', {
                  rank: board.you.rank,
                  total: board.total,
                  time: boardTime(board.you.totalMs),
                })
              : t(nick ? 'kart.board.noRank' : 'kart.board.askName')}
          </Mine>
        )}
        {chaseFailed && (
          <Problem role="alert" data-testid="kart-board-chase-failed">
            {t('kart.board.chaseFailed')}
          </Problem>
        )}

        {load.kind === 'loading' && <Status role="status">{t('kart.board.loading')}</Status>}
        {load.kind === 'failed' && (
          <Status role="alert" data-testid="kart-board-failed">
            {t('kart.board.failed')}{' '}
            <Button type="button" $size="sm" $variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
              {t('kart.board.retry')}
            </Button>
          </Status>
        )}
        {board && board.entries.length === 0 && (
          <Status data-testid="kart-board-empty">{t('kart.board.empty')}</Status>
        )}
        {board && board.entries.length > 0 && (
          <Standings data-testid="kart-board-rows" aria-label={t(`kart.course.${track}`)}>
            <HeadRow aria-hidden="true">
              <span>{t('kart.board.rank')}</span>
              <span>{t('kart.board.player')}</span>
              <span>{t('kart.board.time')}</span>
              <Wide>{t('kart.board.bestLap')}</Wide>
              <Wide>{t('kart.board.date')}</Wide>
              <span>{t('kart.board.actions')}</span>
            </HeadRow>
            {board.entries.map((entry) => (
              <Row
                key={entry.id}
                $you={entry.id === youId}
                data-testid="kart-board-row"
                data-rank={entry.rank}
                data-nick={entry.nick}
              >
                <Rank $top={entry.rank <= 3}>{entry.rank}</Rank>
                <Who>
                  <Nick>
                    {entry.nick}
                    {entry.id === youId && <YouTag>{t('kart.board.you')}</YouTag>}
                  </Nick>
                  <Small>
                    {t(`kart.body.${entry.kart}`)} · {t(`kart.driver.${entry.driver}`)}
                  </Small>
                </Who>
                <Time>{boardTime(entry.totalMs)}</Time>
                <Wide>
                  <Lap>{boardTime(entry.bestLapMs)}</Lap>
                </Wide>
                <Wide>
                  <Small>{dated(entry.at)}</Small>
                </Wide>
                <Actions>
                  {entry.replay && (
                    <>
                      <DownloadLink
                        href={replayAddress(entry.id)}
                        download
                        aria-label={t('kart.board.downloadOf', { nick: entry.nick })}
                        data-testid="kart-board-download"
                      >
                        {t('kart.board.download')}
                      </DownloadLink>
                      <Button
                        type="button"
                        $size="sm"
                        $variant="secondary"
                        disabled={preparing !== null}
                        aria-label={t('kart.board.chaseOf', { nick: entry.nick })}
                        onClick={() => void chase(entry)}
                        data-testid="kart-board-chase"
                      >
                        {preparing === entry.id ? t('kart.board.preparing') : t('kart.board.chase')}
                      </Button>
                    </>
                  )}
                </Actions>
              </Row>
            ))}
          </Standings>
        )}
      </Card>
    </Page>
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
  width: min(900px, 100%);
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

const Title = styled.h1`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.xxl}px;
  text-transform: uppercase;
`

const Intro = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Picker = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
  align-items: center;

  select {
    min-height: 36px;
    max-width: 100%;
    font: inherit;
  }
`

const TrackBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
  align-items: center;
`

const TrackName = styled.h2`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.xl}px;
  text-transform: uppercase;
`

const WeeklyTag = styled.span`
  ${ticker(color.magenta)}
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-transform: uppercase;
`

const Meta = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Mine = styled.p`
  ${ticker(color.accent)}
  margin: 0;
  padding: ${space.xs}px ${space.lg}px;
  color: ${color.onAccent};
  font-weight: 700;
`

const Status = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Problem = styled.p`
  margin: 0;
  color: ${color.danger};
`

// Rank, who, time, best lap, date, replay; a phone keeps rank, who, time and replay
const columns = css`
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto auto auto auto;
  gap: ${space.sm}px;
  align-items: center;

  @media (max-width: 599px) {
    grid-template-columns: 36px minmax(0, 1fr) auto;
    grid-template-areas: 'rank who time' 'rank actions actions';
  }
`

const Standings = styled.ol`
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const HeadRow = styled.li`
  ${columns}
  padding: 0 ${space.sm}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  text-transform: uppercase;

  @media (max-width: 599px) {
    display: none;
  }
`

const Row = styled.li<{ $you: boolean }>`
  ${columns}
  padding: ${space.xs}px ${space.sm}px;
  background: ${(p) => (p.$you ? color.raisedHover : color.raised)};
  border-left: 3px solid ${(p) => (p.$you ? color.accent : 'transparent')};
`

const Rank = styled.span<{ $top: boolean }>`
  ${digits}
  ${(p) => (p.$top ? ticker(color.accent) : '')}
  justify-self: start;
  min-width: 32px;
  padding: 0 ${space.xs}px;
  color: ${(p) => (p.$top ? color.onAccent : color.text)};
  font-size: ${fontSize.lg}px;
  text-align: center;

  @media (max-width: 599px) {
    grid-area: rank;
  }
`

const Who = styled.span`
  display: grid;
  min-width: 0;

  @media (max-width: 599px) {
    grid-area: who;
  }
`

const Nick = styled.span`
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const YouTag = styled.span`
  margin-left: ${space.xs}px;
  color: ${color.accent};
  font-size: ${fontSize.sm}px;
  text-transform: uppercase;
`

const Small = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Time = styled.span`
  ${digits}
  font-size: ${fontSize.lg}px;

  @media (max-width: 599px) {
    grid-area: time;
  }
`

const Lap = styled.span`
  ${digits}
  color: ${color.muted};
`

const Wide = styled.span`
  @media (max-width: 599px) {
    display: none;
  }
`

const Actions = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
  align-items: center;
  justify-content: flex-end;

  @media (max-width: 599px) {
    grid-area: actions;
    justify-content: flex-start;
  }
`

const DownloadLink = styled.a`
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0 ${space.sm}px;
  color: ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

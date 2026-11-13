import { useEffect, useState } from 'react'
import styled from 'styled-components'
import type { DailyMetricRow, MetricName, StatsResponse } from '../../shared/protocol.ts'
import { Button } from '../components/Button.tsx'
import { FieldError, FieldLabel, FieldRow, TextInput } from '../components/Field.tsx'
import { TopBar } from '../components/TopBar.tsx'
import '../i18n/roomExtras.ts'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { readStored, writeStored } from '../lib/storage.ts'
import { monoType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

const KEY_STORE = 'tku-arcade.statsKey'
const METRICS: readonly MetricName[] = ['room_created', 'game_started', 'game_finished']

type Loaded =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'off' }
  | { status: 'failed' }
  | { status: 'ready'; stats: StatsResponse }

async function fetchStats(key: string): Promise<Loaded> {
  try {
    const response = await fetch('/api/stats', { headers: { authorization: `Bearer ${key}` } })
    if (response.status === 404) return { status: 'off' }
    if (response.status === 403) return { status: 'denied' }
    if (!response.ok) return { status: 'failed' }
    const stats = (await response.json()) as StatsResponse
    return Array.isArray(stats.rows) ? { status: 'ready', stats } : { status: 'failed' }
  } catch {
    return { status: 'failed' }
  }
}

/** Sum of `rows` matching `metric`, by the key `by` gives */
function sums(
  rows: readonly DailyMetricRow[],
  metric: MetricName,
  by: (row: DailyMetricRow) => string,
) {
  const out = new Map<string, number>()
  for (const row of rows)
    if (row.metric === metric) out.set(by(row), (out.get(by(row)) ?? 0) + row.count)
  return out
}

/**
 * The owner's daily counts (e12-t07): rooms opened, games started and finished, by day and by game.
 * Nothing links here; the key is the STATS_KEY secret (DEPLOY.md §12), kept in this browser.
 */
export function StatsPage() {
  const t = useT()
  const [key, setKey] = useState(() => readStored(KEY_STORE) ?? '')
  const [draft, setDraft] = useState('')
  const [loaded, setLoaded] = useState<Loaded>({ status: key ? 'loading' : 'idle' })

  useEffect(() => {
    if (!key) return undefined
    let live = true
    void fetchStats(key).then((result) => {
      if (live) setLoaded(result)
    })
    return () => {
      live = false
    }
  }, [key])

  const rows = loaded.status === 'ready' ? loaded.stats.rows : []
  const days = [...new Set(rows.map((row) => row.day))]
  const games = [...new Set(rows.map((row) => row.game))].sort()
  const byDay = METRICS.map((metric) => sums(rows, metric, (row) => row.day))
  const byGame = METRICS.map((metric) => sums(rows, metric, (row) => row.game))

  return (
    <>
      <TopBar />
      <Main>
        <h1>{t('room.extra.stats.title')}</h1>
        {(loaded.status === 'idle' || loaded.status === 'denied') && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const value = draft.trim()
              if (!value) return
              writeStored(KEY_STORE, value)
              setLoaded({ status: 'loading' })
              setKey(value)
            }}
          >
            <FieldLabel htmlFor="stats-key">{t('room.extra.stats.key')}</FieldLabel>
            <FieldRow>
              <TextInput
                id="stats-key"
                type="password"
                autoComplete="off"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button type="submit">{t('room.extra.stats.open')}</Button>
            </FieldRow>
            {loaded.status === 'denied' && (
              <FieldError role="alert">{t('room.extra.stats.denied')}</FieldError>
            )}
          </form>
        )}
        {loaded.status === 'loading' && <p role="status">{t('common.loading')}</p>}
        {loaded.status === 'off' && <p>{t('room.extra.stats.off')}</p>}
        {loaded.status === 'failed' && <p role="alert">{t('room.extra.stats.failed')}</p>}
        {loaded.status === 'ready' && (
          <>
            <Muted>{t('room.extra.stats.since', { since: loaded.stats.since })}</Muted>
            <h2>{t('room.extra.stats.byGame')}</h2>
            <Table>
              <thead>
                <tr>
                  <th scope="col">{t('room.extra.stats.game')}</th>
                  {METRICS.map((metric) => (
                    <th key={metric} scope="col">
                      {t(`room.extra.stats.metric.${metric}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {games.map((game) => (
                  <tr key={game}>
                    <th scope="row">{gameTitle(t, game)}</th>
                    {byGame.map((sum, index) => (
                      <td key={METRICS[index]}>{sum.get(game) ?? 0}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </Table>
            <h2>{t('room.extra.stats.byDay')}</h2>
            {days.length === 0 ? (
              <Muted>{t('room.extra.stats.empty')}</Muted>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <th scope="col">{t('room.extra.stats.day')}</th>
                    {METRICS.map((metric) => (
                      <th key={metric} scope="col">
                        {t(`room.extra.stats.metric.${metric}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((day) => (
                    <tr key={day}>
                      <th scope="row">{day}</th>
                      {byDay.map((sum, index) => (
                        <td key={METRICS[index]}>{sum.get(day) ?? 0}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <div>
              <Button
                $variant="ghost"
                $size="sm"
                onClick={() => {
                  writeStored(KEY_STORE, '')
                  setKey('')
                  setLoaded({ status: 'idle' })
                }}
              >
                {t('room.extra.stats.forget')}
              </Button>
            </div>
          </>
        )}
      </Main>
    </>
  )
}

const Main = styled.main`
  display: grid;
  gap: ${space.lg}px;
  width: min(900px, 100%);
  margin: 0 auto;
  padding: ${space.lg}px;

  & h1,
  & h2 {
    margin: 0;
  }

  & h1 {
    font-size: ${fontSize.xl}px;
  }

  & h2 {
    font-size: ${fontSize.lg}px;
  }
`

const Muted = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  & th,
  & td {
    padding: ${space.xs}px ${space.sm}px;
    border-bottom: 1px solid ${color.line};
    text-align: left;
  }

  & td {
    ${monoType}
    text-align: right;
  }
`

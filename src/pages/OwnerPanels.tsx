import { useEffect, useState } from 'react'
import styled from 'styled-components'
import { ownerMessages } from '../../shared/games/ownerMessages.ts'
import type { AdminFlagsResponse, SetFlagRequest } from '../../shared/protocol.ts'
import { ALERT_SHARE, type UsageLine, type UsageResponse } from '../../shared/usage.ts'
import { Button } from '../components/Button.tsx'
import { registerMessages } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { monoType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

registerMessages(ownerMessages)

type Load<T> = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; value: T }

async function ownerFetch<T>(path: string, key: string, init: RequestInit = {}): Promise<T | null> {
  try {
    const response = await fetch(path, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${key}` },
    })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

function useOwnerData<T>(path: string, key: string) {
  const [load, setLoad] = useState<Load<T>>({ status: 'loading' })
  useEffect(() => {
    let live = true
    void ownerFetch<T>(path, key).then((value) => {
      if (live) setLoad(value ? { status: 'ready', value } : { status: 'failed' })
    })
    return () => {
      live = false
    }
  }, [path, key])
  return [load, setLoad] as const
}

/** e12-t11: every game, open or paused, and the switch */
export function GameFlagsPanel({ ownerKey }: { ownerKey: string }) {
  const t = useT()
  const [load, setLoad] = useOwnerData<AdminFlagsResponse>('/api/admin/flags', ownerKey)
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const toggle = async (game: string, enabled: boolean) => {
    setBusy(game)
    setFailed(false)
    const body: SetFlagRequest = { game, enabled }
    const value = await ownerFetch<AdminFlagsResponse>('/api/admin/flags', ownerKey, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(null)
    if (value) setLoad({ status: 'ready', value })
    else setFailed(true)
  }

  return (
    <Panel>
      <h2>{t('room.extra.owner.games')}</h2>
      <Muted>{t('room.extra.owner.gamesHint')}</Muted>
      {load.status === 'loading' && <p role="status">{t('common.loading')}</p>}
      {(load.status === 'failed' || failed) && <Alert role="alert">{t('room.extra.owner.failed')}</Alert>}
      {load.status === 'ready' && (
        <Table>
          <tbody>
            {load.value.games.map((game) => (
              <tr key={game.id} data-game={game.id}>
                <th scope="row">{gameTitle(t, game.id)}</th>
                <td>
                  {game.enabled ? (
                    t('room.extra.owner.open')
                  ) : (
                    <AlertText>{t('room.extra.owner.pausedState')}</AlertText>
                  )}
                </td>
                <td>
                  <Button
                    $variant={game.enabled ? 'ghost' : 'secondary'}
                    $size="sm"
                    disabled={busy !== null}
                    onClick={() => void toggle(game.id, !game.enabled)}
                  >
                    {game.enabled ? t('room.extra.owner.pause') : t('room.extra.owner.reopen')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  )
}

const GB = 1_000_000_000

function amount(metric: string, value: number): string {
  if (metric.endsWith('_bytes')) return `${(value / GB).toFixed(value < GB / 100 ? 3 : 2)} GB`
  return Math.round(value).toLocaleString()
}

const share = (used: number, allowance: number) => Math.round((used / allowance) * 100)

/** e12-t15: the account's Cloudflare usage against the plan, and the alerts the daily check raised */
export function UsagePanel({ ownerKey }: { ownerKey: string }) {
  const t = useT()
  const [load] = useOwnerData<UsageResponse>('/api/admin/usage', ownerKey)
  const period = (line: { period: string }) =>
    line.period === 'now' ? t('room.extra.owner.now') : line.period
  const over = (line: UsageLine) => line.used !== null && line.used >= line.allowance * ALERT_SHARE

  return (
    <Panel>
      <h2>{t('room.extra.owner.usage')}</h2>
      {load.status === 'loading' && <p role="status">{t('common.loading')}</p>}
      {load.status === 'failed' && <Alert role="alert">{t('room.extra.owner.failed')}</Alert>}
      {load.status === 'ready' && (
        <>
          {load.value.alerts.length > 0 && (
            <AlertList role="alert" aria-label={t('room.extra.owner.alerts')}>
              {load.value.alerts.map((alert) => (
                <li key={`${alert.period}:${alert.metric}`}>
                  {t('room.extra.owner.alert', {
                    metric: t(`room.extra.owner.m.${alert.metric}`),
                    period: alert.period,
                    share: share(alert.used, alert.allowance),
                  })}
                </li>
              ))}
            </AlertList>
          )}
          {!load.value.configured ? (
            <Muted data-usage="off">{t('room.extra.owner.usageOff')}</Muted>
          ) : (
            <>
              <Muted>
                {t('room.extra.owner.usageHint', {
                  plan: t(`room.extra.owner.plan.${load.value.plan}`),
                })}
              </Muted>
              <Table>
                <thead>
                  <tr>
                    <th scope="col">{t('room.extra.owner.metric')}</th>
                    <th scope="col">{t('room.extra.owner.period')}</th>
                    <th scope="col">{t('room.extra.owner.used')}</th>
                    <th scope="col">{t('room.extra.owner.allowance')}</th>
                    <th scope="col">{t('room.extra.owner.share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {load.value.lines.map((line) => (
                    <tr key={line.metric} data-over={over(line) || undefined}>
                      <th scope="row">{t(`room.extra.owner.m.${line.metric}`)}</th>
                      <td>{period(line)}</td>
                      <td>
                        {line.used === null
                          ? t('room.extra.owner.unknown')
                          : amount(line.metric, line.used)}
                      </td>
                      <td>{amount(line.metric, line.allowance)}</td>
                      <td>
                        {line.used === null ? null : over(line) ? (
                          <AlertText>{`${share(line.used, line.allowance)}%`}</AlertText>
                        ) : (
                          `${share(line.used, line.allowance)}%`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
          {load.value.configured && load.value.alerts.length === 0 && (
            <Muted>{t('room.extra.owner.noAlerts')}</Muted>
          )}
        </>
      )}
    </Panel>
  )
}

const Panel = styled.section`
  display: grid;
  gap: ${space.md}px;
`

const Muted = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Alert = styled.p`
  margin: 0;
  color: ${color.danger};
  font-weight: 700;
`

const AlertText = styled.span`
  color: ${color.danger};
  font-weight: 700;
`

const AlertList = styled.ul`
  margin: 0;
  padding-left: ${space.lg}px;
  color: ${color.danger};
  font-weight: 700;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${fontSize.sm}px;

  & th,
  & td {
    padding: ${space.xs}px ${space.sm}px;
    border-bottom: 1px solid ${color.line};
    text-align: left;
  }

  & td {
    ${monoType}
  }
`

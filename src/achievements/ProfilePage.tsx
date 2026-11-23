// 2026-11-23 (e11-t06, AC-11.3; docs/DESIGN.md §3.8): /me, "My profile": the player card (nickname,
// achievements unlocked and the share of them), the achievement wall by category, and the stats the
// achievements count (games, win rate by game, the kart's favourite vehicle and track, best laps,
// time spent boosting). All of it from this browser (store.ts); a lazy chunk of its own.
import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { kartMessages } from '../../shared/games/kart/i18n.ts'
import { KART_ROSTER_MESSAGES } from '../../shared/kart/i18n.roster.ts'
import { SegmentedSwitch } from '../components/SegmentedSwitch.tsx'
import { TopBar } from '../components/TopBar.tsx'
import { registerMessages, type TextKey, type Translate } from '../i18n/t.ts'
import { useLanguage, useT } from '../i18n/useT.ts'
import { readNickname } from '../lib/nickname.ts'
import { Link } from '../lib/router.tsx'
import { clippedFill, cornerClip, displayType, glass, monoType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { BadgeEmblem } from './Badge.tsx'
import { RACE_TRACK_IDS } from './kartLists.ts'
import { favourite, lapTime } from './profileStats.ts'
import { record, subscribeAchievements } from './engine.ts'
import { BOARD_GAMES, CATEGORIES, evaluate, progressOf, RULES, type Category, type Rule } from './rules.ts'
import type { Stats } from './stats.ts'
import { loadSaved, type Saved } from './store.ts'
import './strings.ts'
import { TIER_COLORS } from './tiers.ts'

// The names of the vehicles and the race tracks, as the kart's own screens say them
registerMessages(KART_ROSTER_MESSAGES)
registerMessages(kartMessages)

type Filter = 'all' | Category

export function ProfilePage() {
  const t = useT()
  const language = useLanguage()
  const [saved, setSaved] = useState<Saved>(loadSaved)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    const unsubscribe = subscribeAchievements(() => setSaved(loadSaved()))
    // What the kart's stores hold now (a medal won since), read once on the way in
    void record({ type: 'kart.sync' }).catch(() => {})
    return unsubscribe
  }, [])

  useEffect(() => {
    const before = document.title
    document.title = t('ach.profile.title')
    return () => {
      document.title = before
    }
  }, [t])

  const { stats, unlocked } = saved
  const done = RULES.filter((rule) => unlocked[rule.id] !== undefined || evaluate(rule, stats))
  const percent = Math.round((100 * done.length) / RULES.length)
  const shown = filter === 'all' ? RULES : RULES.filter((rule) => rule.category === filter)
  const date = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: 'medium' }), [language])
  const name = readNickname()

  return (
    <>
      <TopBar />
      <Main>
        <h1 className="visually-hidden">{t('ach.profile.title')}</h1>
        <Back to="/">{t('ach.profile.back')}</Back>
        <Card aria-labelledby="profile-name" data-testid="profile-card">
          <Kicker>{t('ach.profile.kicker')}</Kicker>
          <PlayerName id="profile-name">{name ?? t('ach.profile.guest')}</PlayerName>
          <Score>
            <Big data-testid="profile-percent">{t('ach.profile.percent', { percent })}</Big>
            <span>{t('ach.profile.unlocked', { count: done.length, total: RULES.length })}</span>
          </Score>
          <Bar aria-hidden="true">
            <Fill style={{ width: `${percent}%` }} />
          </Bar>
          <Note>{t('ach.profile.local')}</Note>
        </Card>

        <section aria-labelledby="profile-stats">
          <SectionTitle id="profile-stats">{t('ach.profile.stats')}</SectionTitle>
          <StatsView stats={stats} t={t} />
        </section>

        <section aria-labelledby="profile-wall">
          <WallHead>
            <SectionTitle id="profile-wall">{t('ach.profile.achievements')}</SectionTitle>
            <SegmentedSwitch<Filter>
              label={t('ach.profile.filter')}
              value={filter}
              onChange={setFilter}
              options={(['all', ...CATEGORIES] as const).map((value) => ({
                value,
                label: t(`ach.cat.${value}`),
              }))}
            />
          </WallHead>
          <Wall aria-labelledby="profile-wall" data-testid="achievement-wall">
            {shown.map((rule) => (
              <AchievementTile
                key={rule.id}
                rule={rule}
                stats={stats}
                on={unlocked[rule.id] !== undefined || evaluate(rule, stats)}
                at={unlocked[rule.id]}
                date={date}
                t={t}
              />
            ))}
          </Wall>
        </section>
      </Main>
    </>
  )
}

function AchievementTile({
  rule,
  stats,
  on,
  at,
  date,
  t,
}: {
  rule: Rule
  stats: Stats
  on: boolean
  at: number | undefined
  date: Intl.DateTimeFormat
  t: Translate
}) {
  const secret = rule.hidden === true && !on
  const progress = on ? null : progressOf(rule, stats)
  const params = rule.game ? { game: t(`games.${rule.game}.name`) } : undefined
  return (
    <Tile $on={on} $tier={TIER_COLORS[rule.tier]} data-testid={`achievement-${rule.id}`} data-unlocked={on}>
      <BadgeEmblem category={rule.category} tier={rule.tier} unlocked={on} hidden={rule.hidden === true} />
      <TileText>
        <TileName>{secret ? t('ach.badge.hiddenName') : t(`ach.rule.${rule.id}.name` as TextKey)}</TileName>
        <TileLine>{secret ? t('ach.badge.hiddenDesc') : t(`ach.rule.${rule.id}.desc` as TextKey, params)}</TileLine>
        <TileState>
          <Tier>{t(`ach.tier.${rule.tier}` as TextKey)}</Tier>
          {on ? (
            <span>{at === undefined ? t('ach.badge.unlocked') : t('ach.badge.unlockedOn', { date: date.format(at) })}</span>
          ) : progress ? (
            <Progress>
              <span>{t('ach.badge.progress', progress)}</span>
              <Bar aria-hidden="true" $thin>
                <Fill style={{ width: `${(100 * progress.have) / progress.need}%` }} />
              </Bar>
            </Progress>
          ) : (
            <span>{t('ach.badge.locked')}</span>
          )}
        </TileState>
      </TileText>
    </Tile>
  )
}

function StatsView({ stats, t }: { stats: Stats; t: Translate }) {
  const n = (key: string) => Math.floor(stats.n[key] ?? 0)
  const boost = n('kart.boostMs')
  const kart = favourite(stats.t['kart.karts'])
  const track = favourite(stats.t['kart.tracks'])
  const played = stats.t['board.played'] ?? {}
  const won = stats.t['board.won'] ?? {}
  const together = stats.t['board.coopWon'] ?? {}
  const games = BOARD_GAMES.filter((game) => (played[game] ?? 0) > 0)
  const laps = stats.t['kart.bestLap'] ?? {}
  const lapped = RACE_TRACK_IDS.filter((id) => laps[id] !== undefined)
  const rate = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 0 })
  return (
    <>
      <Tiles>
        <Stat label={t('ach.stats.games')} value={String(n('platform.games'))} />
        <Stat label={t('ach.stats.boardWins')} value={String(n('board.wins'))} />
        <Stat label={t('ach.stats.kartFinishes')} value={String(n('kart.finishes'))} />
        <Stat label={t('ach.stats.kartWins')} value={String(n('kart.wins'))} />
        <Stat
          label={t('ach.stats.boost')}
          value={t('ach.stats.duration', { minutes: Math.floor(boost / 60_000), seconds: Math.floor((boost % 60_000) / 1000) })}
        />
        <Stat
          label={t('ach.stats.favKart')}
          value={kart ? t(`kart.body.${kart[0]}`) : t('ach.stats.none')}
          detail={kart ? t('ach.stats.timesDriven', { count: kart[1] }) : undefined}
        />
        <Stat
          label={t('ach.stats.favTrack')}
          value={track ? t(`games.kart.track.${track[0]}`) : t('ach.stats.none')}
          detail={track ? t('ach.stats.timesDriven', { count: track[1] }) : undefined}
        />
      </Tiles>
      <Tables>
        <TableCard>
          <TableTitle>{t('ach.stats.perGame')}</TableTitle>
          {games.length === 0 ? (
            <Empty>{t('ach.stats.noBoard')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th scope="col">{t('ach.stats.game')}</th>
                  <th scope="col">{t('ach.stats.played')}</th>
                  <th scope="col">{t('ach.stats.won')}</th>
                  <th scope="col">{t('ach.stats.rate')}</th>
                </tr>
              </thead>
              <tbody>
                {games.map((game) => {
                  const wins = (won[game] ?? 0) + (together[game] ?? 0)
                  return (
                    <tr key={game}>
                      <th scope="row">{t(`games.${game}.name`)}</th>
                      <td>{played[game]}</td>
                      <td>{wins}</td>
                      <td>{rate.format(wins / (played[game] ?? 1))}</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </TableCard>
        <TableCard>
          <TableTitle>{t('ach.stats.bestLaps')}</TableTitle>
          {lapped.length === 0 ? (
            <Empty>{t('ach.stats.noLaps')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th scope="col">{t('ach.stats.track')}</th>
                  <th scope="col">{t('ach.stats.lap')}</th>
                </tr>
              </thead>
              <tbody>
                {lapped.map((id) => (
                  <tr key={id}>
                    <th scope="row">{t(`games.kart.track.${id}`)}</th>
                    <td>{lapTime(laps[id]!)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </TableCard>
      </Tables>
    </>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <StatTile>
      <StatLabel>{label}</StatLabel>
      <StatValue>{value}</StatValue>
      {detail && <StatDetail>{detail}</StatDetail>}
    </StatTile>
  )
}

export default ProfilePage

const Main = styled.main`
  display: grid;
  gap: ${space.xl}px;
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: ${space.lg}px ${space.lg}px ${space.xxxl}px;

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`

const Back = styled(Link)`
  justify-self: start;
  color: ${color.accent};
  font-weight: 700;
`

const Card = styled.section`
  ${clippedFill(
    'polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px))',
    `linear-gradient(${color.accent}, ${color.accent}) 0 0 / 64px 4px no-repeat, linear-gradient(120deg, color-mix(in srgb, ${color.accent} 22%, ${color.surface}), ${color.surface} 60%)`,
  )}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.xl}px;
`

const Kicker = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: 12px;
  text-transform: uppercase;
`

const PlayerName = styled.p`
  ${displayType}
  margin: 0;
  font-size: clamp(28px, 6vw, 44px);
  overflow-wrap: anywhere;
`

const Score = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: ${space.md}px;
  margin: 0;
  color: ${color.muted};
`

const Big = styled.span`
  ${monoType}
  color: ${color.text};
  font-size: ${fontSize.xxl}px;
  font-weight: 800;
`

const Bar = styled.span<{ $thin?: boolean }>`
  display: block;
  height: ${({ $thin }) => ($thin ? 4 : 8)}px;
  overflow: hidden;
  background: ${color.raised};
`

const Fill = styled.span`
  display: block;
  height: 100%;
  background: linear-gradient(90deg, ${color.accent}, ${color.magenta});
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const SectionTitle = styled.h2`
  ${displayType}
  margin: 0;
  font-size: ${fontSize.xl}px;
`

const WallHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.md}px;
  margin-bottom: ${space.md}px;
`

const Wall = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: ${space.md}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Tile = styled.li<{ $on: boolean; $tier: string }>`
  ${({ $on, $tier }) =>
    clippedFill(
      cornerClip(14),
      $on
        ? `linear-gradient(${$tier}, ${$tier}) 0 0 / 36px 3px no-repeat, ${color.surface}`
        : color.sunken,
    )}
  display: flex;
  gap: ${space.md}px;
  align-items: flex-start;
  padding: ${space.md}px;
  color: ${({ $on }) => ($on ? color.text : color.muted)};

  &::before {
    box-shadow: inset 0 0 0 1px ${color.line};
  }
`

const TileText = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
`

const TileName = styled.strong`
  ${displayType}
  font-size: ${fontSize.md}px;
`

const TileLine = styled.span`
  font-size: ${fontSize.sm}px;
  color: ${color.muted};
`

const TileState = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
  margin-top: ${space.xs}px;
  color: ${color.muted};
  font-size: 12px;
`

const Tier = styled.span`
  ${monoType}
  text-transform: uppercase;
`

const Progress = styled.span`
  display: grid;
  gap: 2px;
  min-width: 96px;
`

const Tiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
  gap: ${space.md}px;
  margin-top: ${space.md}px;
`

const StatTile = styled.div`
  ${glass}
  display: grid;
  gap: 2px;
  padding: ${space.md}px;
`

const StatLabel = styled.span`
  color: ${color.muted};
  font-size: 12px;
`

const StatValue = styled.span`
  ${displayType}
  font-size: ${fontSize.lg}px;
  overflow-wrap: anywhere;
`

const StatDetail = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: 12px;
`

const Tables = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
  gap: ${space.md}px;
  margin-top: ${space.md}px;
`

const TableCard = styled.div`
  ${glass}
  padding: ${space.md}px;
  overflow-x: auto;
`

const TableTitle = styled.h3`
  margin: 0 0 ${space.sm}px;
  font-size: ${fontSize.md}px;
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: ${fontSize.sm}px;

  th,
  td {
    padding: ${space.xs}px ${space.sm}px;
    border-bottom: 1px solid ${color.line};
    text-align: left;
  }

  td {
    ${monoType}
  }

  thead th {
    color: ${color.muted};
    font-weight: 600;
  }
`

const Empty = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

// 2026-11-21: the race room's track, beside the place cards: seen from above (the road at its width,
// the start and finish line, and the row of eight on it: everyone starts side by side), its name, the
// laps, the mode and whether it is a team race. The track itself comes in its own chunk (the race
// needs it a moment later anyway), so the card shows the words first and the map when it has come.
// 2026-11-22: a card of the waiting room's side rail, as small as a phone on its side needs, with the
// track's quickest karts (docs/KART-META.md) under the map.
import { useMemo } from 'react'
import styled from 'styled-components'
import type { OptionValues } from '../../../shared/games/types.ts'
import { trackMeta } from '../../../shared/kart/meta.ts'
import type { Track } from '../../../shared/kart/track.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType, monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { broadcast, ticker } from '../ui/broadcast.ts'

const PAD = 14

function TrackMap({ track, label }: { track: Track; label: string }) {
  const drawn = useMemo(() => {
    const xs = track.road.map((point) => point.x)
    const zs = track.road.map((point) => point.z)
    const minX = Math.min(...xs) - PAD
    const minZ = Math.min(...zs) - PAD
    const width = Math.max(...xs) + PAD - minX
    const height = Math.max(...zs) + PAD - minZ
    const road = `M${track.road.map((point) => `${point.x.toFixed(1)} ${point.z.toFixed(1)}`).join('L')}Z`
    const roadWidth = track.road.reduce((sum, point) => sum + point.width, 0) / track.road.length
    const forks = (track.forks ?? []).map(
      (fork) => `M${fork.path.map((point) => `${point.x.toFixed(1)} ${point.z.toFixed(1)}`).join('L')}`,
    )
    return { box: `${minX.toFixed(1)} ${minZ.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`, road, roadWidth, forks }
  }, [track])
  const line = track.gates[0]!
  return (
    <Map viewBox={drawn.box} role="img" aria-label={label} data-testid="kart-lobby-map">
      <path d={drawn.road} fill="none" stroke={color.line} strokeWidth={drawn.roadWidth + 8} strokeLinejoin="round" />
      {drawn.forks.map((fork, index) => (
        <path key={index} d={fork} fill="none" stroke={color.muted} strokeWidth={drawn.roadWidth * 0.8} strokeLinejoin="round" />
      ))}
      <path d={drawn.road} fill="none" stroke={color.accent} strokeOpacity={0.85} strokeWidth={drawn.roadWidth} strokeLinejoin="round" />
      <line x1={line.ax} y1={line.az} x2={line.bx} y2={line.bz} stroke={color.text} strokeWidth={6} />
      {track.grid.map((spot, index) => (
        <circle key={index} cx={spot.x} cy={spot.z} r={3.2} fill={color.text} />
      ))}
    </Map>
  )
}

export interface TrackCardProps {
  options: OptionValues
  track: Track | null
}

export function TrackCard({ options, track }: TrackCardProps) {
  const t = useT()
  const id = String(options.track ?? '')
  const laps = Number(options.laps ?? 3)
  const name = t(`games.kart.track.${id}`)
  const meta = trackMeta(id)
  return (
    <Card data-testid="kart-lobby-track" aria-labelledby="kart-lobby-track-title">
      <Head>
        <Tag>{t('games.kart.lobby.track')}</Tag>
        <Name id="kart-lobby-track-title">{name}</Name>
      </Head>
      {track && <TrackMap track={track} label={t('games.kart.lobby.map')} />}
      <Facts>
        <li>{laps === 1 ? t('games.kart.lobby.lap') : t('games.kart.lobby.laps', { laps })}</li>
        <li>{t(`games.kart.mode.${String(options.mode ?? 'items')}`)}</li>
        {/* Everyone for themselves goes without saying; a team race does not */}
        {options.teams === 'teams' && <li>{t('games.kart.teams.teams')}</li>}
      </Facts>
      {meta && (
        <Quickest data-testid="kart-lobby-quickest">
          <span>{t('games.kart.lobby.quickest')}</span>{' '}
          {meta.podium.map((kart) => t(`kart.body.${kart}`)).join(' · ')}
        </Quickest>
      )}
      <Note>{t('games.kart.lobby.sameLine')}</Note>
    </Card>
  )
}

const Card = styled.section`
  ${broadcast}
  display: flex;
  flex-direction: column;
  gap: ${space.xs}px;
  min-height: 0;
  padding: ${space.sm}px ${space.md}px;
  overflow: hidden;
`

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px ${space.sm}px;
`

const Tag = styled.span`
  ${monoType}
  ${ticker(color.accent, 6)}
  padding: 0 ${space.sm}px;
  color: ${color.onAccent};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
`

const Name = styled.h2`
  ${displayType}
  margin: 0;
  line-height: 1.1;
  font-size: clamp(${fontSize.md}px, 2.2vh + 6px, ${fontSize.xl}px);
  overflow-wrap: anywhere;
`

const Map = styled.svg`
  display: block;
  flex: 1 1 0;
  width: 100%;
  min-height: 36px;

  @media (orientation: portrait) and (max-width: 700px) {
    flex: none;
    height: 96px;
  }
`

const Facts = styled.ul`
  ${monoType}
  display: flex;
  flex-wrap: wrap;
  gap: 2px ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
`

const Quickest = styled.p`
  margin: 0;
  color: ${color.text};
  font-size: 12px;

  span {
    color: ${color.muted};
  }

  @media (max-height: 420px) {
    display: none;
  }
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: 12px;

  @media (max-height: 600px) {
    display: none;
  }
`

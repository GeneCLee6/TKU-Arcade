// 2026-11-23 (the broadcast, docs/DESIGN.md §3.6): what a race broadcast puts over the picture. The
// standings tower down the left (place, name, the gap to the kart ahead in seconds, the lap), the kart
// on screen named in a lower third (its place, its lap, its speed, and which camera), and the
// captions the director calls for ("Overtake!", "Hit", "Final lap", "Fastest lap", the finish)
// slamming in at the top. In the broadcast panels' look (src/kart/ui/broadcast.ts).
//
// Sized for a big screen as for a laptop: every length is a share of a 1920×1080 frame (`--u`, one
// such pixel, the smaller of the width's and the height's), never below what reads on a laptop, so
// that on a projector at 1080p or a monitor at 1440p the overlay covers the same part of the picture.
import styled, { css } from 'styled-components'
import type { Caption } from '../../../../shared/kart/broadcast.ts'
import type { HighlightKind } from '../../../../shared/kart/highlights.ts'
import { raceTime } from '../../../games/kart/raceTime.ts'
import type { TextKey, Translate } from '../../../i18n/t.ts'
import { displayType } from '../../../styles/esports.ts'
import { color } from '../../../styles/tokens.ts'
import { broadcast, digits, slam, splitShadow, streak, ticker } from '../../ui/broadcast.ts'
import type { BroadcastReadout, ShownCaption } from './broadcastRun.ts'

/** A length of `px` in a 1920×1080 frame, never under `min` px */
const u = (px: number, min = px * 0.62) => `max(${min.toFixed(1)}px, calc(var(--u) * ${px}))`

export interface BroadcastOverlayProps {
  t: Translate
  readout: BroadcastReadout
  nameOf: (seat: number) => string
  laps: number
  /** Live or a replay: the lower third's tag */
  live: boolean
  /** Playing the highlights: which, of how many, and what */
  highlight?: { readonly n: number; readonly total: number; readonly kind: HighlightKind } | null
}

const gapText = (gap: number) => `+${gap.toFixed(gap >= 10 ? 1 : 3)}`

export function BroadcastOverlay({ t, readout, nameOf, laps, live, highlight }: BroadcastOverlayProps) {
  const leader = readout.rows[0]
  const focus = readout.rows.find((row) => row.seat === readout.seat)
  return (
    <Layer
      data-testid="kart-broadcast"
      data-cuts={readout.cuts}
      data-shot={readout.shot}
      data-reason={readout.reason}
      data-seat={readout.seat ?? ''}
    >
      <Tower aria-label={t('games.kart.broadcast.standings')} data-testid="kart-broadcast-standings">
        <TowerHead>
          <span>{t('games.kart.broadcast.standings')}</span>
          {leader && (
            <LapCount data-testid="kart-broadcast-lap">
              {t('games.kart.broadcast.lap', { lap: leader.lap, laps })}
            </LapCount>
          )}
        </TowerHead>
        <ol>
          {readout.rows.map((row) => (
            <Row key={row.seat} $focus={row.seat === readout.seat} data-seat={row.seat}>
              <Place>{row.place}</Place>
              <Name>{nameOf(row.seat)}</Name>
              <Gap>
                {row.out
                  ? t('games.kart.race.out')
                  : row.place === 1
                    ? row.finishMs !== null
                      ? raceTime(row.finishMs)
                      : t('games.kart.broadcast.leader')
                    : row.gap === null
                      ? '–'
                      : gapText(row.gap)}
              </Gap>
            </Row>
          ))}
        </ol>
      </Tower>
      {focus && (
        <LowerThird data-testid="kart-broadcast-focus">
          <Tag>
            <Live $live={live}>{live ? t('games.kart.broadcast.live') : t('games.kart.broadcast.replay')}</Live>
            <span>{t(`games.kart.broadcast.shot.${readout.shot}` as TextKey)}</span>
          </Tag>
          <Plate>
            <BigPlace>{focus.place}</BigPlace>
            <PlateText>
              <PlateName>{nameOf(focus.seat)}</PlateName>
              <PlateLine>
                {focus.finishMs !== null
                  ? `${t('games.kart.race.finished')} · ${raceTime(focus.finishMs)}`
                  : `${t('games.kart.broadcast.lap', { lap: focus.lap, laps })} · ${t('games.kart.broadcast.speed', { speed: readout.speed })}`}
              </PlateLine>
            </PlateText>
          </Plate>
        </LowerThird>
      )}
      <Captions aria-live="polite" data-testid="kart-broadcast-captions">
        {highlight && (
          <HighlightBanner data-testid="kart-highlight-banner">
            {t('games.kart.highlights.banner', { n: highlight.n, total: highlight.total })}
            {' · '}
            {t(`games.kart.highlights.kind.${highlight.kind}` as TextKey)}
          </HighlightBanner>
        )}
        {readout.captions.map((one) => (
          <CaptionCard key={one.id} {...captionText(t, one, nameOf)} />
        ))}
      </Captions>
    </Layer>
  )
}

function captionText(
  t: Translate,
  { caption }: ShownCaption,
  nameOf: (seat: number) => string,
): { kind: Caption['kind']; title: string; line: string } {
  const name = nameOf(caption.seat)
  switch (caption.kind) {
    case 'overtake':
      return {
        kind: caption.kind,
        title: t('games.kart.broadcast.caption.overtake'),
        line: t('games.kart.broadcast.caption.overtakeLine', { name, other: nameOf(caption.other), place: caption.place }),
      }
    case 'hit':
      return {
        kind: caption.kind,
        title: t('games.kart.broadcast.caption.hit'),
        line: t('games.kart.broadcast.caption.hitLine', { name, other: nameOf(caption.other) }),
      }
    case 'finalLap':
      return {
        kind: caption.kind,
        title: t('games.kart.broadcast.caption.finalLap'),
        line: t('games.kart.broadcast.caption.finalLapLine', { name }),
      }
    case 'fastestLap':
      return {
        kind: caption.kind,
        title: t('games.kart.broadcast.caption.fastestLap'),
        line: `${name} · ${raceTime(caption.ms)}`,
      }
    case 'finish':
      return {
        kind: caption.kind,
        title:
          caption.place === 1
            ? t('games.kart.broadcast.caption.winner', { name })
            : t('games.kart.broadcast.caption.finish'),
        line: t('games.kart.broadcast.caption.finishLine', { name, place: caption.place }),
      }
  }
}

function CaptionCard({ kind, title, line }: { kind: Caption['kind']; title: string; line: string }) {
  return (
    <CaptionBox data-caption={kind}>
      <CaptionTitle $hot={kind === 'overtake' || kind === 'hit' || kind === 'finish'}>{title}</CaptionTitle>
      <CaptionLine>{line}</CaptionLine>
    </CaptionBox>
  )
}

const Layer = styled.div`
  --u: min(calc(100vw / 1920), calc(100vh / 1080));
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: ${color.text};
`

const Tower = styled.section`
  ${broadcast}
  position: absolute;
  top: ${u(24, 8)};
  left: ${u(24, 8)};
  width: ${u(340, 210)};
  padding: ${u(10, 6)} ${u(14, 8)} ${u(12, 6)};

  ol {
    display: grid;
    gap: ${u(4, 2)};
    margin: ${u(8, 4)} 0 0;
    padding: 0;
    list-style: none;
  }

  /* A phone: the top four, so that the picture still shows */
  @media (max-width: 700px) {
    li:nth-child(n + 5) {
      display: none;
    }
  }
`

const TowerHead = styled.div`
  ${displayType}
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: ${u(12, 6)};
  font-size: ${u(20, 13)};
  text-transform: uppercase;
`

const LapCount = styled.span`
  ${digits}
  color: ${color.accent};
  font-size: ${u(20, 13)};
`

const Row = styled.li<{ $focus: boolean }>`
  display: grid;
  grid-template-columns: ${u(40, 26)} minmax(0, 1fr) auto;
  align-items: center;
  gap: ${u(10, 6)};
  padding: ${u(3, 2)} ${u(6, 4)};
  font-size: ${u(22, 14)};
  ${({ $focus }) =>
    $focus &&
    css`
      ${ticker(`color-mix(in srgb, ${color.accent} 30%, transparent)`, 6)}
    `}
`

const Place = styled.span`
  ${digits}
  ${ticker(color.accent, 6)}
  color: ${color.onAccent};
  text-align: center;
`

const Name = styled.span`
  overflow: hidden;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Gap = styled.span`
  ${digits}
  color: ${color.muted};
  font-size: ${u(19, 12)};
`

const LowerThird = styled.section`
  position: absolute;
  left: ${u(48, 8)};
  bottom: ${u(170, 120)};
  display: grid;
  justify-items: start;
  gap: ${u(4, 2)};
  max-width: calc(100% - 16px);
`

const Tag = styled.div`
  ${digits}
  display: flex;
  align-items: center;
  gap: ${u(10, 6)};
  font-size: ${u(17, 11)};
  text-transform: uppercase;
`

const Live = styled.span<{ $live: boolean }>`
  ${({ $live }) => ticker($live ? color.magenta : color.accent, 6)}
  padding: ${u(2, 1)} ${u(12, 8)};
  color: ${color.onAccent};
`

const Plate = styled.div`
  ${broadcast}
  display: flex;
  align-items: center;
  gap: ${u(16, 8)};
  min-width: ${u(420, 220)};
  padding: ${u(10, 6)} ${u(22, 12)} ${u(10, 6)} ${u(14, 8)};
`

const BigPlace = styled.span`
  ${displayType}
  color: ${color.accent};
  font-size: ${u(64, 34)};
  line-height: 1;
`

const PlateText = styled.div`
  display: grid;
  min-width: 0;
`

const PlateName = styled.span`
  ${displayType}
  overflow: hidden;
  font-size: ${u(34, 20)};
  text-overflow: ellipsis;
  white-space: nowrap;
`

const PlateLine = styled.span`
  ${digits}
  color: ${color.muted};
  font-size: ${u(20, 13)};
`

const Captions = styled.div`
  position: absolute;
  top: ${u(120, 70)};
  left: 50%;
  display: grid;
  justify-items: center;
  gap: ${u(10, 6)};
  width: min(${u(900, 300)}, calc(100% - 16px));
  translate: -50% 0;
`

const CaptionBox = styled.div`
  ${broadcast}
  ${slam()}
  display: grid;
  justify-items: center;
  padding: ${u(10, 6)} ${u(28, 14)};
  text-align: center;
`

const CaptionTitle = styled.span<{ $hot: boolean }>`
  ${displayType}
  ${({ $hot }) => $hot && streak(color.magenta)}
  position: relative;
  color: ${color.text};
  font-size: ${u(46, 24)};
  text-shadow: ${splitShadow};
  text-transform: uppercase;
`

const CaptionLine = styled.span`
  font-size: ${u(22, 14)};
  font-weight: 700;
`

const HighlightBanner = styled.div`
  ${digits}
  ${ticker(color.magenta, 10)}
  padding: ${u(4, 2)} ${u(22, 12)};
  color: ${color.onAccent};
  font-size: ${u(22, 14)};
  text-transform: uppercase;
`

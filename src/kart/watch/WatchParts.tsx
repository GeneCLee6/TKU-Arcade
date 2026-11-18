// e9-t10: what watching a race and its replay share: the page over the scene, the panel on the kart
// being watched (its name, place and lap; its item in the race's own slot), the buttons to change kart and view, the keys, and
// the name tags over the other karts.
import type { ReactNode } from 'react'
import styled from 'styled-components'
import type { ItemId } from '../../../shared/kart/items.ts'
import type { WatchCommand } from '../../../shared/kart/watch.ts'
import type { Translate } from '../../i18n/t.ts'
import { Button } from '../../components/Button.tsx'
import { displayType, glass, monoType } from '../../styles/esports.ts'
import { color, fontSize, radius, space } from '../../styles/tokens.ts'
import { ItemSlot } from '../race/ItemHud.tsx'

export interface WatchedPanelProps {
  t: Translate
  name: string | null
  place: number
  total: number
  /** "Lap 2 / 3", "Finished" or "out", as worked out by the view */
  detail: string
}

/** The kart being watched: whose, its place and how far (what it holds is WatchedItem's) */
export function WatchedPanel({ t, name, place, total, detail }: WatchedPanelProps) {
  return (
    <Panel data-testid="kart-watched">
      <Following>
        {name === null ? t('games.kart.watch.noKarts') : t('games.kart.watch.following', { name })}
      </Following>
      {name !== null && (
        <Line>
          <PlaceNumber aria-label={t('games.kart.race.position')}>
            {t('games.kart.race.place', { place, total })}
          </PlaceNumber>
          <Detail>{detail}</Detail>
        </Line>
      )}
    </Panel>
  )
}

/**
 * The watched kart's item, in an item race (undefined otherwise): the race's own slot, top centre,
 * with no key to press (2026-11-18). A child of the watch page, not of a corner
 */
export function WatchedItem({ t, item }: { t: Translate; item: ItemId | null | undefined }) {
  if (item === undefined) return null
  return (
    <div role="group" aria-label={t('games.kart.watch.item')}>
      <ItemSlot t={t} item={item} />
    </div>
  )
}

/** Change kart, change view, and whatever a replay adds */
export function WatchControls({
  t,
  overhead,
  onCommand,
  onClose,
  keys,
  children,
}: {
  t: Translate
  overhead: boolean
  onCommand: (command: WatchCommand) => void
  onClose: () => void
  keys: string
  children?: ReactNode
}) {
  return (
    <Controls aria-label={t('games.kart.watch.controls')}>
      {children}
      <Row>
        <Button $variant="secondary" $size="sm" onClick={() => onCommand('previous')}>
          {t('games.kart.watch.previous')}
        </Button>
        <Button $variant="secondary" $size="sm" onClick={() => onCommand('next')}>
          {t('games.kart.watch.next')}
        </Button>
        <Button $variant="secondary" $size="sm" onClick={() => onCommand('view')}>
          {overhead ? t('games.kart.watch.chase') : t('games.kart.watch.overhead')}
        </Button>
        <Button $variant="ghost" $size="sm" onClick={onClose} data-testid="kart-watch-close">
          {t('games.kart.watch.close')}
        </Button>
      </Row>
      <Keys>{keys}</Keys>
    </Controls>
  )
}

export const WatchPage = styled.main`
  position: fixed;
  inset: 0;
  z-index: 20;
  overflow: hidden;
  background: ${color.bg};
`

export const WatchStage = styled.div`
  position: absolute;
  inset: 0;
`

export const TagLayer = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
`

export const NameTag = styled.span`
  position: absolute;
  top: 0;
  left: 0;
  max-width: 12em;
  padding: 2px ${space.sm}px;
  overflow: hidden;
  border-radius: ${radius.component}px;
  color: ${color.text};
  background: color-mix(in srgb, ${color.bg} 70%, transparent);
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`

export const TopLeft = styled.div`
  position: absolute;
  top: ${space.sm}px;
  left: ${space.sm}px;
  display: grid;
  justify-items: start;
  gap: ${space.xs}px;
  max-width: calc(100% - 160px);
  pointer-events: none;
`

export const MapCorner = styled.div`
  position: absolute;
  top: ${space.sm}px;
  right: ${space.sm}px;
  pointer-events: none;
`

export const Note = styled.p`
  ${glass}
  margin: 0;
  padding: ${space.xs}px ${space.sm}px;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

export const Fallback = styled.section`
  display: grid;
  gap: ${space.md}px;
  justify-items: start;
  padding: ${space.lg}px;

  p {
    margin: 0;
  }
`

const Panel = styled.div`
  ${glass}
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.xs}px ${space.md}px;
  min-width: 0;
`

const Following = styled.span`
  overflow: hidden;
  color: ${color.text};
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const Line = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
`

const PlaceNumber = styled.span`
  ${displayType}
  color: ${color.text};
  font-size: ${fontSize.xl}px;
`

const Detail = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Controls = styled.section`
  ${glass}
  position: absolute;
  bottom: ${space.sm}px;
  left: 50%;
  display: grid;
  gap: ${space.xs}px;
  justify-items: center;
  width: min(640px, calc(100% - ${2 * space.sm}px));
  padding: ${space.sm}px;
  translate: -50% 0;
`

export const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: ${space.xs}px;
`

const Keys = styled.p`
  ${monoType}
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  text-align: center;

  /* A phone has no keys to press, and a short screen no room for the list */
  @media (pointer: coarse), (max-height: 480px) {
    display: none;
  }
`

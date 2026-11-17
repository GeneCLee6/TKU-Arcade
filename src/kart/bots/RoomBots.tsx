// 2026-11-17: the host's computer karts in a race room's waiting room (docs/ARCHITECTURE.md §4.21),
// its own lazy chunk like the garage. A level and a button: the room puts each one in the lowest free
// seat and names it (shared/protocol.ts 14.); its kart and driver are drawn here. Each one shows in
// the seat list, with the host's way to remove it. Its strings are the race room's
// (shared/games/kart/i18n.ts), loaded with the room.
import { useState } from 'react'
import styled from 'styled-components'
import { BOT_LEVELS, type BotLevel } from '../../../shared/games/kart/bots.ts'
import { DRIVER_IDS, KART_IDS, lookOf } from '../../../shared/kart/karts.ts'
import { Button } from '../../components/Button.tsx'
import { Heading, Muted, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { color, space } from '../../styles/tokens.ts'

export interface RoomBotsProps {
  /** Seats nobody holds */
  free: number
  onAdd(level: string, look?: string): void
}

const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)] as T

export default function RoomBots({ free, onAdd }: RoomBotsProps) {
  const t = useT()
  const [level, setLevel] = useState<BotLevel>('normal')
  return (
    <Section data-testid="kart-room-bots">
      <Heading>{t('games.kart.bot.title')}</Heading>
      <Row>
        <Field>
          <span>{t('games.kart.bot.level')}</span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as BotLevel)}
            data-testid="kart-room-bots-level"
          >
            {BOT_LEVELS.map((one) => (
              <option key={one} value={one}>
                {t(`games.kart.bot.level.${one}`)}
              </option>
            ))}
          </select>
        </Field>
        <Button
          $variant="secondary"
          disabled={free <= 0}
          onClick={() => onAdd(level, lookOf(pick(KART_IDS), pick(DRIVER_IDS)))}
          data-testid="kart-room-bots-add"
        >
          {t('games.kart.bot.add')}
        </Button>
      </Row>
      {free <= 0 && <Muted>{t('games.kart.bot.full')}</Muted>}
      <Muted>{t('games.kart.bot.note')}</Muted>
    </Section>
  )
}

const Row = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const Field = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${space.sm}px;
  font-weight: 700;

  & > select {
    min-height: 32px;
    min-width: 8em;
    color: ${color.text};
    background: ${color.sunken};
    border: 1px solid ${color.border};
    font: inherit;
    font-weight: 400;
  }
`

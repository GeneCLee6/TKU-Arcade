// 2026-11-20: the host's computer players in a table game's waiting room (hold'em, promotion,
// traders; 2026-11-21 palace, secret-scroll, wasabi, tiles: GameMeta.computer), its own lazy chunk. A level and a button: the room puts each one in the
// lowest free seat, names it and plays its turns itself (worker/room-host.ts); each shows in the seat
// list with the host's way to remove it. The kart's computer karts have their own panel
// (src/kart/bots/RoomBots.tsx), since the host's browser drives those.
import { useState } from 'react'
import styled from 'styled-components'
import { TABLE_BOT_LEVELS, type TableBotLevel } from '../../shared/games/tableBots.ts'
import { useT } from '../i18n/useT.ts'
import { color, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { Heading, Muted, Section } from './roomParts.ts'

export interface TableBotsProps {
  /** Seats nobody holds */
  free: number
  onAdd(level: string): void
}

export default function TableBots({ free, onAdd }: TableBotsProps) {
  const t = useT()
  const [level, setLevel] = useState<TableBotLevel>('normal')
  return (
    <Section data-testid="table-bots">
      <Heading>{t('room.bot.title')}</Heading>
      <Row>
        <Field>
          <span>{t('room.bot.level')}</span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as TableBotLevel)}
            data-testid="table-bots-level"
          >
            {TABLE_BOT_LEVELS.map((one) => (
              <option key={one} value={one}>
                {t(`room.bot.level.${one}`)}
              </option>
            ))}
          </select>
        </Field>
        <Button
          $variant="secondary"
          disabled={free <= 0}
          onClick={() => onAdd(level)}
          data-testid="table-bots-add"
        >
          {t('room.bot.add')}
        </Button>
      </Row>
      {free <= 0 && <Muted>{t('room.bot.full')}</Muted>}
      <Muted>{t('room.bot.note')}</Muted>
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

// 2026-11-17: the host's computer karts in a race room's waiting room (docs/ARCHITECTURE.md §4.21),
// its own lazy chunk like the garage. A level and a button: the room puts each one in the lowest free
// seat and names it (shared/protocol.ts 14.); its kart and driver are drawn here. Each one shows in
// the seat list, with the host's way to remove it. Its strings are the race room's
// (shared/games/kart/i18n.ts), loaded with the room.
import { useState } from 'react'
import styled from 'styled-components'
import { BOT_LEVELS, type BotLevel } from '../../../shared/games/kart/bots.ts'
import { Button } from '../../components/Button.tsx'
import { Heading, Muted, Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { randomLook } from './botLook.ts'
import { color, space } from '../../styles/tokens.ts'

export interface RoomBotsProps {
  /** Seats nobody holds */
  free: number
  onAdd(level: string, look?: string): void
  /** 2026-11-21: the level, kept by the waiting room (its place cards add one too); else its own */
  level?: BotLevel
  onLevel?(level: BotLevel): void
}

export default function RoomBots({ free, onAdd, level: given, onLevel }: RoomBotsProps) {
  const t = useT()
  const [own, setOwn] = useState<BotLevel>('normal')
  const level = given ?? own
  const setLevel = (next: BotLevel) => {
    setOwn(next)
    onLevel?.(next)
  }
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
          onClick={() => onAdd(level, randomLook())}
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

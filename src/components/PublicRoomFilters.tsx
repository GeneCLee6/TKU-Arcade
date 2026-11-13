import styled from 'styled-components'
import { LOBBY_GAMES } from '../../shared/games/catalog.ts'
import '../i18n/roomExtras.ts'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import type { RoomFilter } from '../lib/publicRoomFilter.ts'
import { space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { FieldLabel, SelectInput } from './Field.tsx'

interface PublicRoomFiltersProps {
  filter: RoomFilter
  onFilter(filter: RoomFilter): void
  /** The most free seats any listed room has: the choices go up to it */
  most: number
  /** Joins one of the rooms shown; null while none is */
  onRandom: (() => void) | null
}

/** The lobby's filter of public rooms (e1-t15): by game, by free seats, and a random one */
export default function PublicRoomFilters({
  filter,
  onFilter,
  most,
  onRandom,
}: PublicRoomFiltersProps) {
  const t = useT()
  return (
    <Filters role="group" aria-label={t('room.extra.lobby.filters')}>
      <Filter>
        <FieldLabel htmlFor="room-filter-game">{t('room.extra.lobby.filterGame')}</FieldLabel>
        <SelectInput
          id="room-filter-game"
          value={filter.gameId ?? ''}
          onChange={(event) => onFilter({ ...filter, gameId: event.target.value || null })}
        >
          <option value="">{t('room.extra.lobby.anyGame')}</option>
          {LOBBY_GAMES.map((game) => (
            <option key={game.id} value={game.id}>
              {gameTitle(t, game.id)}
            </option>
          ))}
        </SelectInput>
      </Filter>
      <Filter>
        <FieldLabel htmlFor="room-filter-seats">{t('room.extra.lobby.filterSeats')}</FieldLabel>
        <SelectInput
          id="room-filter-seats"
          value={filter.freeSeats}
          onChange={(event) => onFilter({ ...filter, freeSeats: Number(event.target.value) })}
        >
          {Array.from({ length: Math.max(most, filter.freeSeats) }, (_, index) => index + 1).map(
            (count) => (
              <option key={count} value={count}>
                {t('room.extra.lobby.seatsFor', { count })}
              </option>
            ),
          )}
        </SelectInput>
      </Filter>
      <Button disabled={onRandom === null} onClick={() => onRandom?.()}>
        {t('room.extra.lobby.random')}
      </Button>
    </Filters>
  )
}

const Filters = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: ${space.md}px;
  margin-bottom: ${space.md}px;
`

const Filter = styled.div`
  flex: 1 1 160px;
  max-width: 260px;
`

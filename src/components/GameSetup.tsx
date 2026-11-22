// The waiting room's game and rules (WaitingRoom.tsx): its own file, so that the options form stays
// in the waiting room's chunk rather than in every game's first screen (HostControls.tsx is in both)
import { useId } from 'react'
import { LOBBY_GAMES } from '../../shared/games/lobby.ts'
import type { OptionValues } from '../../shared/games/types.ts'
import type { RoomInfo } from '../../shared/protocol.ts'
import { loadGameDetails, useGameDetails } from '../i18n/gameDetails.ts'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { FieldLabel, ReadOnlyField, ReadOnlyFields, SelectInput } from './Field.tsx'
import { OptionsForm } from './OptionsForm.tsx'
import { Heading, Section } from './roomParts.ts'

interface GameSetupProps {
  room: RoomInfo
  isHost: boolean
  onSetGame(gameId: string): void
  /** Only the fields that change */
  onSetOptions(options: OptionValues): void
}

/** Which game and by what rules: the host changes them, everyone else can read them */
export function GameSetup({ room, isHost, onSetGame, onSetOptions }: GameSetupProps) {
  const t = useT()
  const selectId = useId()
  // Its options arrive with the room's game (src/i18n/gameDetails.ts); a new pick's a moment later
  const game = useGameDetails(room.gameId)?.info
  // The room's own game is always there to be shown as selected, listed or not
  const choices = LOBBY_GAMES.map((other) => other.id)
  if (!choices.includes(room.gameId)) choices.unshift(room.gameId)

  return (
    <Section>
      <Heading>{t('room.setup.heading')}</Heading>
      {isHost ? (
        <div>
          <FieldLabel htmlFor={selectId}>{t('room.setup.game')}</FieldLabel>
          <SelectInput
            id={selectId}
            value={room.gameId}
            onChange={(event) => {
              // Its options start loading now, alongside the server's answer
              void loadGameDetails(event.target.value)
              onSetGame(event.target.value)
            }}
          >
            {choices.map((id) => (
              <option key={id} value={id}>
                {gameTitle(t, id)}
              </option>
            ))}
          </SelectInput>
        </div>
      ) : (
        <ReadOnlyFields>
          <ReadOnlyField label={t('room.setup.game')} value={gameTitle(t, room.gameId)} />
        </ReadOnlyFields>
      )}
      {/* The key: what someone was typing for one game's field must not carry over to another's */}
      {game && (
        <OptionsForm
          key={game.id}
          schema={game.options}
          values={room.options}
          editable={isHost}
          onChange={onSetOptions}
        />
      )}
    </Section>
  )
}

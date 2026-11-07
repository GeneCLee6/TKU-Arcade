import { useId } from 'react'
import { LOBBY_GAMES, getGame } from '../../shared/games/index.ts'
import type { OptionValues } from '../../shared/games/types.ts'
import type { RoomInfo } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { Button } from './Button.tsx'
import { ConfirmButton } from './ConfirmButton.tsx'
import { FieldLabel, ReadOnlyField, ReadOnlyFields, SelectInput } from './Field.tsx'
import { OptionsForm } from './OptionsForm.tsx'
import { Actions, Heading, Muted, Section } from './roomParts.ts'

interface SeatedGateButtonProps {
  label: string
  seated: number
  minPlayers: number
  onClick(): void
}

/** Start or rematch: says how many it takes while too few are seated */
export function SeatedGateButton({ label, seated, minPlayers, onClick }: SeatedGateButtonProps) {
  const t = useT()
  const hintId = useId()
  const enough = seated >= minPlayers
  return (
    <Section>
      <Button disabled={!enough} aria-describedby={enough ? undefined : hintId} onClick={onClick}>
        {label}
      </Button>
      {!enough && <Muted id={hintId}>{t('room.waiting.needPlayers', { count: minPlayers })}</Muted>}
    </Section>
  )
}

export function DissolveButton({ onDissolve }: { onDissolve(): void }) {
  const t = useT()
  return (
    <ConfirmButton
      variant="danger"
      label={t('room.host.dissolve')}
      title={t('room.host.dissolveTitle')}
      body={t('room.host.dissolveBody')}
      onConfirm={onDissolve}
    />
  )
}

interface HostEndedActionsProps {
  seated: number
  minPlayers: number
  onRematch(): void
  onReopen(): void
  onDissolve(): void
}

/** What the host can do once a game is over */
export function HostEndedActions({
  seated,
  minPlayers,
  onRematch,
  onReopen,
  onDissolve,
}: HostEndedActionsProps) {
  const t = useT()
  return (
    <Section>
      <SeatedGateButton
        label={t('room.host.rematch')}
        seated={seated}
        minPlayers={minPlayers}
        onClick={onRematch}
      />
      <Actions>
        <Button $variant="secondary" onClick={onReopen}>
          {t('room.host.reopen')}
        </Button>
        <DissolveButton onDissolve={onDissolve} />
      </Actions>
    </Section>
  )
}

interface GameSetupProps {
  room: RoomInfo
  isHost: boolean
  onSetGame(gameId: string): void
  onSetOptions(options: OptionValues): void
}

/** Which game and by what rules: the host changes them, everyone else can read them */
export function GameSetup({ room, isHost, onSetGame, onSetOptions }: GameSetupProps) {
  const t = useT()
  const selectId = useId()
  const game = getGame(room.gameId)
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
            onChange={(event) => onSetGame(event.target.value)}
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

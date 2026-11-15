import { useId } from 'react'
import { useT } from '../i18n/useT.ts'
import { Button } from './Button.tsx'
import { ConfirmButton } from './ConfirmButton.tsx'
import { Actions, Muted, Stack } from './roomParts.ts'

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
    <Stack>
      <Button disabled={!enough} aria-describedby={enough ? undefined : hintId} onClick={onClick}>
        {label}
      </Button>
      {!enough && <Muted id={hintId}>{t('room.waiting.needPlayers', { count: minPlayers })}</Muted>}
    </Stack>
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
    <Stack>
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
    </Stack>
  )
}

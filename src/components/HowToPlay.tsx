import { lazy, Suspense, useState } from 'react'
import { useT } from '../i18n/useT.ts'
import { gameTitle } from '../lib/gameTitle.ts'
import { hasRules, type RulesEdition } from '../lib/rulesDoc.ts'
import { Button } from './Button.tsx'
import { Dialog } from './Dialog.tsx'

// Most games are played without opening this: the room's first screen does not pay for it
const RulesText = lazy(() =>
  import('./RulesText.tsx').then(({ RulesText }) => ({ default: RulesText })),
)

/**
 * The rules over the room, so that reading them never means leaving the game (e7-t07): the edition
 * the room plays, where a game has two (promotion's full edition, C7)
 */
export function HowToPlay({ gameId, edition = 'simple' }: { gameId: string; edition?: RulesEdition }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!hasRules(gameId, edition)) return null
  return (
    <>
      <Button $variant="ghost" $size="sm" onClick={() => setOpen(true)}>
        {t('rules.howToPlay')}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t('rules.pageTitle', { game: gameTitle(t, gameId) })}
      >
        {/* Under the dialog's own h2 */}
        {open && (
          <Suspense fallback={<p role="status">{t('common.loading')}</p>}>
            <RulesText gameId={gameId} edition={edition} headingShift={1} />
          </Suspense>
        )}
      </Dialog>
    </>
  )
}

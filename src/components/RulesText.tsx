import { useT } from '../i18n/useT.ts'
import { useRulesDoc } from '../lib/rulesDoc.ts'
import { Markdown } from './Markdown.tsx'

interface RulesTextProps {
  gameId: string
  headingShift?: number
}

export function RulesText({ gameId, headingShift }: RulesTextProps) {
  const t = useT()
  const doc = useRulesDoc(gameId)
  if (doc.status === 'loading') return <p role="status">{t('common.loading')}</p>
  if (doc.status === 'failed') return <p role="alert">{t('rules.loadFailed')}</p>
  return <Markdown source={doc.text} headingShift={headingShift} />
}

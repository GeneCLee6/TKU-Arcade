import { useState } from 'react'
import styled from 'styled-components'
import type { OddWordView } from '../../../shared/games/odd-word/types.ts'
import { Button } from '../../components/Button.tsx'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { glass } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'

/**
 * Your word, as big as a phone allows: the only secret this game has, cut by the server into your
 * own view. Friends sitting together can glance at a phone, so the word can be covered (tap the word
 * or the button); a new round or a redeal comes face up. The bank is Chinese only.
 */
export function WordCard({ view }: { view: OddWordView }) {
  const t = useT()
  const language = useLanguage()
  const deal = `${view.round}:${view.redeals}`
  const [coveredDeal, setCoveredDeal] = useState<string | null>(null)
  const covered = coveredDeal === deal
  const toggle = () => setCoveredDeal(covered ? null : deal)
  const playing = view.you !== null

  return (
    <Card aria-labelledby="odd-word-label" data-testid="word-card">
      <Label id="odd-word-label">{t('games.odd-word.ui.yourWord')}</Label>
      {!playing && <Help>{t('games.odd-word.ui.spectatorHelp')}</Help>}
      {playing && covered && (
        <CoverFace type="button" onClick={toggle} data-testid="word-covered">
          {t('games.odd-word.ui.covered')}
        </CoverFace>
      )}
      {playing && !covered && (
        <WordFace type="button" onClick={toggle} aria-describedby="odd-word-help">
          <Word data-testid="word" lang="zh-TW" $blank={view.blankYou}>
            {view.blankYou ? t('games.odd-word.ui.blank') : view.word}
          </Word>
        </WordFace>
      )}
      {playing && (
        <Help id="odd-word-help">
          {t(view.blankYou ? 'games.odd-word.ui.blankHelp' : 'games.odd-word.ui.wordHelp')}
        </Help>
      )}
      {playing && (
        <Foot>
          {view.redeals > 0 ? <Small role="status">{t('games.odd-word.ui.redealt')}</Small> : <span />}
          <Button $variant="ghost" $size="sm" aria-pressed={covered} onClick={toggle}>
            {t(covered ? 'games.odd-word.ui.show' : 'games.odd-word.ui.hide')}
          </Button>
        </Foot>
      )}
      {language === 'en' && <Small>{t('games.odd-word.ui.chineseOnly')}</Small>}
    </Card>
  )
}

const Card = styled.section`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
  box-shadow: inset 0 3px 0 ${color.accent};
`

const Label = styled.h2`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Face = styled.button`
  display: grid;
  place-items: center;
  min-height: 140px;
  padding: ${space.lg}px ${space.md}px;
  color: ${color.text};
  background: ${color.sunken};
  border: 0;
  font: inherit;
  cursor: pointer;
`

const WordFace = styled(Face)`
  box-shadow: inset 6px 0 0 ${color.accent};
`

const CoverFace = styled(Face)`
  color: ${color.muted};
  background: repeating-linear-gradient(-76deg, ${color.sunken} 0 8px, ${color.raised} 8px 16px);
  font-weight: 700;
`

// The word you describe: readable across a table
const Word = styled.span<{ $blank: boolean }>`
  color: ${(p) => (p.$blank ? color.muted : color.text)};
  font-size: clamp(44px, 16vw, 88px);
  font-weight: 900;
  line-height: 1.1;
  text-align: center;
  overflow-wrap: anywhere;
`

const Help = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Foot = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const Small = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

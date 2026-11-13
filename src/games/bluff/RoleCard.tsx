import { useState } from 'react'
import styled from 'styled-components'
import type { BluffView } from '../../../shared/games/bluff/types.ts'
import { Button } from '../../components/Button.tsx'
import { useLanguage, useT } from '../../i18n/useT.ts'
import { displayType, glass, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { Body, Tag } from './bluffParts.ts'
import './messages.ts'
import { roleOf } from './screenState.ts'

/**
 * The term, big, and what only you hold this round: your role, and the real meaning (the honest
 * reader), the hint (bluffers and the mole) or the secret words (the mole). It is all in your own
 * view, cut by the server. Face to face, a neighbour can glance at a phone: the card can be covered.
 * The bank's text is Chinese only.
 */
export function RoleCard({ view }: { view: BluffView }) {
  const t = useT()
  const language = useLanguage()
  const role = roleOf(view)
  // Covered for this round only: a new term comes face up
  const [coveredRound, setCoveredRound] = useState<number | null>(null)
  const covered = coveredRound === view.round
  const secret = view.explanation !== null || view.hint !== null || view.words.length > 0

  return (
    <Card aria-labelledby="bluff-term" data-testid="role-card" $role={role}>
      <Head>
        <Tag>
          <span lang="zh-TW">{view.term.category}</span>
        </Tag>
        <RoleLine data-testid="role">{t(`games.bluff.ui.role.${role}`)}</RoleLine>
      </Head>
      <TermLabel>{t('games.bluff.ui.term')}</TermLabel>
      <Term id="bluff-term" lang="zh-TW">
        {view.term.term}
      </Term>
      <Body>{t(`games.bluff.ui.roleHelp.${role}`)}</Body>

      {secret && covered && <Covered>{t('games.bluff.ui.covered')}</Covered>}
      {secret && !covered && (
        <>
          {view.explanation !== null && (
            <Secret aria-labelledby="bluff-explanation" data-testid="explanation">
              <SecretLabel id="bluff-explanation">{t('games.bluff.ui.explanation')}</SecretLabel>
              <Explanation lang="zh-TW">{view.explanation}</Explanation>
            </Secret>
          )}
          {view.hint !== null && (
            <Secret aria-labelledby="bluff-hint" data-testid="hint">
              <SecretLabel id="bluff-hint">{t('games.bluff.ui.hint')}</SecretLabel>
              <HintText lang="zh-TW">{view.hint}</HintText>
            </Secret>
          )}
          {view.words.length > 0 && (
            <Secret aria-labelledby="bluff-words" data-testid="words">
              <SecretLabel id="bluff-words">{t('games.bluff.ui.words')}</SecretLabel>
              <Words>
                {view.words.map((word) => (
                  <Word key={word} lang="zh-TW">
                    <span>{word}</span>
                  </Word>
                ))}
              </Words>
            </Secret>
          )}
        </>
      )}
      {secret && (
        <Cover>
          <Button
            $variant="ghost"
            $size="sm"
            aria-pressed={covered}
            onClick={() => setCoveredRound(covered ? null : view.round)}
          >
            {t(covered ? 'games.bluff.ui.show' : 'games.bluff.ui.hide')}
          </Button>
        </Cover>
      )}
      {language === 'en' && <Note>{t('games.bluff.ui.chineseOnly')}</Note>}
    </Card>
  )
}

const Card = styled.section<{ $role: string }>`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
  box-shadow: inset 0 3px 0 ${(p) => (p.$role === 'mole' ? color.magenta : color.accent)};
`

const Head = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

const RoleLine = styled.p`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.lg}px;
`

const TermLabel = styled.p`
  margin: ${space.sm}px 0 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

// The word everyone reads out: as big as a phone allows
const Term = styled.h2`
  margin: 0;
  font-size: clamp(${fontSize.xxl}px, 11vw, 56px);
  font-weight: 900;
  line-height: 1.15;
  overflow-wrap: anywhere;
`

const Secret = styled.section`
  display: grid;
  gap: ${space.xs}px;
  padding: ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${color.accent};
`

const SecretLabel = styled.h3`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

// Read aloud from the phone: large and loose
const Explanation = styled.p`
  margin: 0;
  font-size: ${fontSize.xl}px;
  line-height: 1.6;
  overflow-wrap: anywhere;
`

const HintText = styled.p`
  margin: 0;
  font-size: ${fontSize.lg}px;
  font-weight: 700;
`

const Words = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Word = styled.li`
  padding: ${space.xs}px ${space.md}px;
  color: ${color.onAccent};
  background: ${color.magenta};
  font-size: ${fontSize.xl}px;
  font-weight: 800;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

const Covered = styled.p`
  margin: 0;
  padding: ${space.xl}px ${space.md}px;
  color: ${color.muted};
  background: repeating-linear-gradient(-76deg, ${color.sunken} 0 8px, ${color.raised} 8px 16px);
  text-align: center;
  font-weight: 700;
`

const Cover = styled.div`
  display: flex;
  justify-content: flex-end;
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

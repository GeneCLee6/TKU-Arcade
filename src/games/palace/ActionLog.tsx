import styled from 'styled-components'
import type { PalaceLog } from '../../../shared/games/palace/types.ts'
import { Heading } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { glass, monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { logLine, logTone } from './screenState.ts'

type Names = Parameters<typeof logLine>[1]

const TONE = {
  claim: color.accent,
  fight: color.magenta,
  loss: color.danger,
  plain: color.line,
} as const

/**
 * Everything that happened, newest first: the claims, challenges, blocks and lost backers. The
 * bluffing happens on the friends' voice call, so this is what they point at while they argue.
 */
export function ActionLog({ log, names }: { log: readonly PalaceLog[]; names: Names }) {
  const t = useT()
  const lines = log.map((entry, index) => ({ entry, index })).reverse()
  return (
    <Panel aria-labelledby="palace-log-heading" data-testid="action-log">
      <Heading id="palace-log-heading">{t('games.palace.ui.log')}</Heading>
      <Help>{t('games.palace.ui.logHelp')}</Help>
      <Lines aria-live="polite" aria-relevant="additions" tabIndex={0}>
        {lines.map(({ entry, index }) => {
          const line = logLine(entry, names)
          return (
            <Entry key={index} $tone={TONE[logTone(entry)]} $strong={entry.k === 'win' || entry.k === 'out'}>
              <Index aria-hidden="true">{index + 1}</Index>
              <span>{t(line.key, line.params)}</span>
            </Entry>
          )
        })}
      </Lines>
    </Panel>
  )
}

const Panel = styled.section`
  ${glass}
  display: grid;
  gap: ${space.sm}px;
  padding: ${space.lg}px;
`

const Help = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Lines = styled.ol`
  display: grid;
  gap: 2px;
  max-height: 320px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
`

const Entry = styled.li<{ $tone: string; $strong: boolean }>`
  display: flex;
  gap: ${space.sm}px;
  padding: ${space.xs}px ${space.sm}px;
  background: ${color.sunken};
  box-shadow: inset 3px 0 0 ${(p) => p.$tone};
  font-weight: ${(p) => (p.$strong ? 700 : 400)};
  line-height: 1.35;
`

const Index = styled.span`
  ${monoType}
  flex: none;
  min-width: 2em;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

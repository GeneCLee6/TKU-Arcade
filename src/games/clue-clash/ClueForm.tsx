import { useId, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import { clashKey, clueProblem, MAX_CLUE_LENGTH, tidyClue } from '../../../shared/games/clue-clash/clue.ts'
import { Button } from '../../components/Button.tsx'
import { FieldError, FieldLabel, TextInput } from '../../components/Field.tsx'
import { Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'

interface ClueFormProps {
  /** How many clues you write: two with three players */
  slots: number
  /** What the room has from you: the texts, or null until sent */
  sent: readonly (string | null)[]
  /** The word and the answers that count: a clue may not hold one */
  answers: readonly string[]
  disabled: boolean
  onSend(texts: string[]): void
}

/** Your clue, which you may change until everyone's is in; the room decides, this only warns first */
export function ClueForm({ slots, sent, answers, disabled, onSend }: ClueFormProps) {
  const t = useT()
  const id = useId()
  const [drafts, setDrafts] = useState<string[]>(() =>
    Array.from({ length: slots }, (_, index) => sent[index] ?? ''),
  )
  const texts = drafts.map(tidyClue)
  const problems = texts.map((text) => (text === '' ? null : clueProblem(text, answers)))
  const twice = slots > 1 && texts.every((text) => text !== '') && new Set(texts.map(clashKey)).size < texts.length
  const done = sent.every((text) => text !== null)
  const unchanged = done && texts.every((text, index) => text === sent[index])
  const blocked = disabled || texts.some((text) => text === '') || problems.some((problem) => problem !== null) || twice || unchanged

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!blocked) onSend(texts)
  }

  return (
    <Section aria-labelledby={`${id}-0-label`} data-testid="clue-form">
      <Form onSubmit={submit}>
        {drafts.map((draft, index) => (
          <Field key={index}>
            <FieldLabel id={`${id}-${index}-label`} htmlFor={`${id}-${index}`}>
              {t(slots > 1 ? 'games.clue-clash.ui.clueLabelN' : 'games.clue-clash.ui.clueLabel', { n: index + 1 })}
            </FieldLabel>
            <BigInput
              id={`${id}-${index}`}
              value={draft}
              onChange={(event) => setDrafts(drafts.map((other, at) => (at === index ? event.target.value : other)))}
              placeholder={t('games.clue-clash.ui.cluePlaceholder')}
              autoComplete="off"
              enterKeyHint="send"
              aria-invalid={problems[index] !== null}
              aria-describedby={`${id}-${index}-problem`}
            />
            <FieldError id={`${id}-${index}-problem`} role="alert">
              {problems[index] !== null && t(problems[index].key, problems[index].params)}
            </FieldError>
          </Field>
        ))}
        <Hint>{t('games.clue-clash.ui.clueHint', { max: MAX_CLUE_LENGTH })}</Hint>
        {twice && <FieldError role="alert">{t('games.clue-clash.error.twice')}</FieldError>}
        <Button type="submit" disabled={blocked}>
          {t(done ? 'games.clue-clash.ui.change' : 'games.clue-clash.ui.send')}
        </Button>
        {done && <Sent role="status">{t('games.clue-clash.ui.sent', { text: sent.join(' · ') })}</Sent>}
      </Form>
    </Section>
  )
}

const Form = styled.form`
  display: grid;
  gap: ${space.sm}px;
`

const Field = styled.div`
  display: grid;
  gap: ${space.xs}px;
`

const BigInput = styled(TextInput)`
  min-height: 52px;
  font-size: ${fontSize.xl}px;
  font-weight: 700;
`

const Hint = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Sent = styled.p`
  margin: 0;
  color: ${color.success};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

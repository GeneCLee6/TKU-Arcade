import { useId, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import {
  answerProblem,
  MAX_ANSWER_LENGTH,
  normaliseAnswer,
} from '../../../shared/games/spectrum/answer.ts'
import { Button } from '../../components/Button.tsx'
import { FieldError, FieldLabel, TextInput } from '../../components/Field.tsx'
import { Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'

interface AnswerFormProps {
  /** What the room has from you so far: null until it has an answer */
  sent: string | null
  onSend(text: string): void
}

/**
 * Your answer, which you may change until everyone's are in. The room decides what it accepts and
 * says why it refuses (a toast in your language); while you type, the same check warns you first.
 */
export function AnswerForm({ sent, onSend }: AnswerFormProps) {
  const t = useT()
  const id = useId()
  const [draft, setDraft] = useState(sent ?? '')
  const text = normaliseAnswer(draft)
  // Empty is no warning while nothing is typed: the button simply waits
  const problem = text === '' ? null : answerProblem(text)
  const unchanged = text === '' || text === sent
  const count = [...text].length

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (unchanged) return
    onSend(draft)
  }

  return (
    <Panel aria-labelledby={`${id}-label`}>
      <Form onSubmit={submit}>
        <FieldLabel id={`${id}-label`} htmlFor={`${id}-input`}>
          {t('games.spectrum.ui.answerLabel')}
        </FieldLabel>
        <BigInput
          id={`${id}-input`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('games.spectrum.ui.answerPlaceholder')}
          autoComplete="off"
          enterKeyHint="send"
          aria-invalid={problem !== null}
          aria-describedby={`${id}-hint ${id}-problem`}
        />
        <HintRow>
          <span id={`${id}-hint`}>{t('games.spectrum.ui.answerHint', { max: MAX_ANSWER_LENGTH })}</span>
          <Count $over={count > MAX_ANSWER_LENGTH} aria-hidden="true">
            {t('games.spectrum.ui.charCount', { count, max: MAX_ANSWER_LENGTH })}
          </Count>
        </HintRow>
        <FieldError id={`${id}-problem`} role="alert">
          {problem !== null && t(problem, { max: MAX_ANSWER_LENGTH })}
        </FieldError>
        <Button type="submit" disabled={unchanged}>
          {t(sent === null ? 'games.spectrum.ui.send' : 'games.spectrum.ui.change')}
        </Button>
        {sent !== null && (
          <Sent role="status">{t('games.spectrum.ui.sent', { text: sent })}</Sent>
        )}
      </Form>
    </Panel>
  )
}

const Panel = styled(Section)`
  align-content: start;
`

const Form = styled.form`
  display: grid;
  gap: ${space.sm}px;
`

const BigInput = styled(TextInput)`
  min-height: 56px;
  font-size: ${fontSize.xl}px;
  font-weight: 700;
`

const HintRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: ${space.sm}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Count = styled.span<{ $over: boolean }>`
  ${monoType}
  flex: none;
  color: ${(p) => (p.$over ? color.danger : color.muted)};
`

const Sent = styled.p`
  margin: 0;
  color: ${color.success};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

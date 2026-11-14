import { useId, useState, type FormEvent } from 'react'
import styled from 'styled-components'
import { clueProblem, MAX_CLUE_COUNT, MAX_CLUE_LENGTH, tidyClue } from '../../../shared/games/word-bridge/clue.ts'
import { Button } from '../../components/Button.tsx'
import { FieldError, FieldLabel, SelectInput, TextInput } from '../../components/Field.tsx'
import { Section } from '../../components/roomParts.ts'
import { useT } from '../../i18n/useT.ts'
import { space, fontSize } from '../../styles/tokens.ts'
import './messages.ts'

interface ClueFormProps {
  /** The words still face down: a clue may not hold one */
  open: readonly string[]
  disabled: boolean
  onSend(text: string, count: number): void
}

const COUNTS = Array.from({ length: MAX_CLUE_COUNT }, (_, index) => index + 1)

/**
 * The clue-giver's bid: one word and a number. The room decides what it accepts and says why it
 * refuses; while you type, the same check warns you first.
 */
export function ClueForm({ open, disabled, onSend }: ClueFormProps) {
  const t = useT()
  const id = useId()
  const [draft, setDraft] = useState('')
  const [count, setCount] = useState(1)
  const text = tidyClue(draft)
  const problem = text === '' ? null : clueProblem(text, count, open)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (text === '' || problem !== null || disabled) return
    onSend(text, count)
  }

  return (
    <Section aria-labelledby={`${id}-heading`} data-testid="clue-form">
      <Form onSubmit={submit}>
        <FieldLabel id={`${id}-heading`} htmlFor={`${id}-text`}>
          {t('games.word-bridge.ui.clueLabel')}
        </FieldLabel>
        <Row>
          <BigInput
            id={`${id}-text`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('games.word-bridge.ui.cluePlaceholder')}
            autoComplete="off"
            enterKeyHint="send"
            maxLength={MAX_CLUE_LENGTH * 2}
            aria-invalid={problem !== null}
            aria-describedby={`${id}-hint ${id}-problem`}
          />
          <CountSelect
            aria-label={t('games.word-bridge.ui.countLabel')}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          >
            {COUNTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
            <option value={0}>{t('games.word-bridge.ui.countAnyShort')}</option>
          </CountSelect>
        </Row>
        <Hint id={`${id}-hint`}>{t('games.word-bridge.ui.clueHint', { max: MAX_CLUE_LENGTH })}</Hint>
        <FieldError id={`${id}-problem`} role="alert">
          {problem !== null && t(problem.key, problem.params)}
        </FieldError>
        <Button type="submit" disabled={disabled || text === '' || problem !== null}>
          {t('games.word-bridge.ui.sendClue')}
        </Button>
      </Form>
    </Section>
  )
}

const Form = styled.form`
  display: grid;
  gap: ${space.sm}px;
`

const Row = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 5.5em;
  gap: ${space.sm}px;
`

const BigInput = styled(TextInput)`
  min-height: 52px;
  font-size: ${fontSize.xl}px;
  font-weight: 700;
`

const CountSelect = styled(SelectInput)`
  min-height: 52px;
  font-size: ${fontSize.lg}px;
  font-weight: 700;
`

const Hint = styled.p`
  margin: 0;
  font-size: ${fontSize.sm}px;
`

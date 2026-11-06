import { useId, useState } from 'react'
import styled from 'styled-components'
import { parseOptions } from '../../shared/games/options.ts'
import type {
  AnyOptionField,
  BooleanOption,
  IntOption,
  OptionsSchema,
  OptionValue,
  OptionValues,
  SelectOption,
} from '../../shared/games/types.ts'
import type { TextKey } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { FieldLabel, ReadOnlyField, ReadOnlyFields, SelectInput, TextInput } from './Field.tsx'

export interface OptionsFormProps {
  schema: OptionsSchema<OptionValues>
  /** The room's values: what is shown, always */
  values: OptionValues
  /** The host's working controls; anyone else gets the same fields as text */
  editable: boolean
  /** A control changed: the complete values to ask the server for */
  onChange(values: OptionValues): void
}

/** The rule options, generated from a game's schema. A game with none renders nothing */
export function OptionsForm({ schema, values, editable, onChange }: OptionsFormProps) {
  const t = useT()
  const fields = Object.entries(schema as Record<string, AnyOptionField>)
  if (fields.length === 0) return null

  // A field the room has no valid value for (an older room, say) shows what the server would use
  const complete = parseOptions(schema, values)

  if (!editable) {
    return (
      <ReadOnlyFields>
        {fields.map(([key, field]) => (
          <ReadOnlyField
            key={key}
            label={t(field.labelKey as TextKey)}
            value={<ValueText field={field} value={complete[key]} />}
          />
        ))}
      </ReadOnlyFields>
    )
  }

  return (
    <Fields>
      {fields.map(([key, field]) => (
        <ControlFor
          key={key}
          field={field}
          value={complete[key]}
          onPick={(value) => onChange({ ...complete, [key]: value })}
        />
      ))}
    </Fields>
  )
}

function ValueText({ field, value }: { field: AnyOptionField; value: OptionValue }) {
  const t = useT()
  switch (field.kind) {
    case 'boolean':
      return <>{value ? t('room.options.on') : t('room.options.off')}</>
    case 'int':
      return <>{value}</>
    case 'select': {
      const choice = choicesOf(field).find((other) => other.value === value)
      return <>{choice ? t(choice.labelKey as TextKey) : value}</>
    }
  }
}

interface ControlProps<F, V> {
  field: F
  value: V
  onPick(value: OptionValue): void
}

function ControlFor({ field, value, onPick }: ControlProps<AnyOptionField, OptionValue>) {
  switch (field.kind) {
    case 'boolean':
      return <BooleanControl field={field} value={value === true} onPick={onPick} />
    case 'int':
      return <IntControl field={field} value={Number(value)} onPick={onPick} />
    case 'select':
      return <SelectControl field={field} value={value} onPick={onPick} />
  }
}

function BooleanControl({ field, value, onPick }: ControlProps<BooleanOption, boolean>) {
  const t = useT()
  return (
    <CheckLabel>
      <Check
        type="checkbox"
        checked={value}
        onChange={(event) => onPick(event.target.checked)}
      />
      {t(field.labelKey as TextKey)}
    </CheckLabel>
  )
}

const choicesOf = (field: SelectOption<string> | SelectOption<number>) =>
  field.choices as readonly { value: string | number; labelKey: string }[]

function SelectControl({
  field,
  value,
  onPick,
}: ControlProps<SelectOption<string> | SelectOption<number>, OptionValue>) {
  const t = useT()
  const id = useId()
  const choices = choicesOf(field)
  return (
    <div>
      <FieldLabel htmlFor={id}>{t(field.labelKey as TextKey)}</FieldLabel>
      <SelectInput
        id={id}
        value={String(value)}
        onChange={(event) => {
          // The DOM speaks strings; a choice's value may be a number
          const choice = choices.find((other) => String(other.value) === event.target.value)
          if (choice) onPick(choice.value)
        }}
      >
        {choices.map((choice) => (
          <option key={String(choice.value)} value={String(choice.value)}>
            {t(choice.labelKey as TextKey)}
          </option>
        ))}
      </SelectInput>
    </div>
  )
}

/** An integer in the field's range, or null for what cannot be read as an integer at all */
function readInt(text: string, field: IntOption): number | null {
  if (text.trim() === '') return null
  const number = Number(text)
  if (!Number.isInteger(number)) return null
  return Math.min(field.max, Math.max(field.min, number))
}

function IntControl({ field, value, onPick }: ControlProps<IntOption, number>) {
  const t = useT()
  const id = useId()
  const hintId = useId()
  // Typing 120 goes through 1 and 12, which may not even be in range, so nothing is sent until the
  // person is done. What they are typing is only theirs while the room's value it started from is
  // still the room's value: if that changes, the room wins.
  const [draft, setDraft] = useState<{ text: string; base: number } | null>(null)
  const typing = draft !== null && draft.base === value

  const commit = () => {
    setDraft(null)
    if (!typing) return
    const number = readInt(draft.text, field)
    if (number !== null && number !== value) onPick(number)
  }

  return (
    <div>
      <FieldLabel htmlFor={id}>{t(field.labelKey as TextKey)}</FieldLabel>
      <TextInput
        id={id}
        type="number"
        min={field.min}
        max={field.max}
        step={1}
        aria-describedby={hintId}
        value={typing ? draft.text : String(value)}
        onChange={(event) => setDraft({ text: event.target.value, base: value })}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
      />
      <Hint id={hintId}>{t('room.options.range', { min: field.min, max: field.max })}</Hint>
    </div>
  )
}

const Fields = styled.div`
  display: grid;
  gap: ${space.md}px;
`

const CheckLabel = styled.label`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;
  font-weight: 600;
  cursor: pointer;
`

const Check = styled.input`
  flex: none;
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: ${color.accent};
`

const Hint = styled.p`
  margin: ${space.xs}px 0 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

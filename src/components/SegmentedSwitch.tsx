import styled from 'styled-components'
import { color, fontSize, radius, space } from '../styles/tokens.ts'

export interface SegmentedOption<Value extends string> {
  value: Value
  label: string
  // The label's language, when it can differ from the page's
  lang?: string
}

interface SegmentedSwitchProps<Value extends string> {
  label: string
  options: readonly SegmentedOption<Value>[]
  value: Value
  onChange: (value: Value) => void
}

// A small row of mutually exclusive buttons, shared by the language and theme switches
export function SegmentedSwitch<Value extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedSwitchProps<Value>) {
  return (
    <Group role="group" aria-label={label}>
      {options.map((option) => (
        <Segment
          key={option.value}
          type="button"
          lang={option.lang}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Segment>
      ))}
    </Group>
  )
}

const Group = styled.div`
  display: inline-flex;
  gap: ${space.xs}px;
  padding: ${space.xs}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;

  @media (max-width: 480px) {
    gap: 2px;
    padding: 2px;
  }
`

const Segment = styled.button`
  min-height: 32px;
  padding: 0 ${space.sm}px;
  background: transparent;
  color: ${color.muted};
  border: 0;
  border-radius: ${radius.component - space.xs}px;
  font: inherit;
  font-size: ${fontSize.sm}px;
  cursor: pointer;

  /* A finger's height, but the top bar still has to stay one row down to a 360px phone */
  @media (max-width: 480px) {
    min-width: 32px;
    min-height: 44px;
    padding: 0 ${space.xs}px;
  }

  &:hover {
    color: ${color.text};
  }

  /* Filled and bold, so the state is not carried by colour alone */
  &[aria-pressed='true'] {
    background: ${color.accent};
    color: ${color.onAccent};
    font-weight: 600;
  }
`

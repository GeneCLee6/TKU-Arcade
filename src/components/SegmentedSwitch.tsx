import styled from 'styled-components'
import { clippedFill, slantClip } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

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
  gap: 2px;
`

// Slanted like the tabs and buttons; the fill is on ::before so the focus ring stays whole
const Segment = styled.button`
  ${clippedFill(slantClip(7), color.raised)}
  min-height: 32px;
  padding: 0 ${space.md}px;
  background: transparent;
  color: ${color.muted};
  border: 0;
  font: inherit;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  cursor: pointer;

  /* A finger's height, but the top bar still has to stay one row down to a 360px phone */
  @media (max-width: 480px) {
    min-width: 32px;
    min-height: 44px;
    padding: 0 ${space.xs + 2}px;
    font-weight: 600;
  }

  &:hover {
    color: ${color.text};
  }

  &:hover::before {
    background: ${color.raisedHover};
  }

  /* Filled and bold, so the state is not carried by colour alone */
  &[aria-pressed='true'] {
    color: ${color.onAccent};
    font-weight: 900;
  }

  &[aria-pressed='true']::before {
    background: ${color.accent};
  }
`

import type { ReactNode } from 'react'
import styled from 'styled-components'
import { monoType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

export const FieldLabel = styled.label`
  display: block;
  margin-bottom: ${space.xs}px;
  font-weight: 700;
`

// Sunk into the panel, with the current hue along the bottom once it has the focus
const field = `
  width: 100%;
  min-width: 0;
  min-height: 44px;
  padding: 0 ${space.md}px;
  background: ${color.sunken};
  color: ${color.text};
  border: 1px solid ${color.border};
  border-radius: 0;
  font-family: inherit;
  font-size: ${fontSize.md}px;

  &:focus-visible {
    border-color: ${color.accent};
    box-shadow: inset 0 -2px 0 ${color.accent};
  }
`

// 16px text: iOS zooms the page when focusing anything smaller
export const TextInput = styled.input`
  ${field}

  &[aria-invalid='true'] {
    border-color: ${color.danger};
  }
`

export const SelectInput = styled.select`
  ${field}
`

/** Fields someone may read but not change, as label and value; holds `ReadOnlyField`s */
export const ReadOnlyFields = styled.dl`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
`

export function ReadOnlyField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <ReadOnlyLabel>{label}</ReadOnlyLabel>
      <ReadOnlyValue>{value}</ReadOnlyValue>
    </div>
  )
}

const ReadOnlyLabel = styled.dt`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const ReadOnlyValue = styled.dd`
  margin: 0;
  font-weight: 700;
`

export const FieldError = styled.p`
  margin: ${space.xs}px 0 0;
  color: ${color.danger};
  font-size: ${fontSize.sm}px;
`

/** The input and its button on one line, wrapping when a long translation needs the room */
export const FieldRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;

  & > input {
    flex: 1 1 160px;
    width: auto;
  }
`

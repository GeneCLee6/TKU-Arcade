import styled from 'styled-components'
import { glass } from '../styles/esports.ts'
import { color, space } from '../styles/tokens.ts'

/** A glass panel with one corner cut (esports.ts); the clipped shape is behind it, not on it */
export const Card = styled.div`
  ${glass}
  padding: ${space.xl}px;
  color: ${color.text};
`

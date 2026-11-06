import styled from 'styled-components'
import { color, radius, space } from '../styles/tokens.ts'

export const Card = styled.div`
  padding: ${space.xl}px;
  background: ${color.surface};
  color: ${color.text};
  border: 1px solid ${color.border};
  border-radius: ${radius.card}px;
`

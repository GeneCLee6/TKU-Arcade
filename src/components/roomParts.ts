// The pieces the room's screens are built from, so the waiting room and the game look the same
import styled from 'styled-components'
import { color, fontSize, radius, space } from '../styles/tokens.ts'

export const Section = styled.section`
  display: grid;
  gap: ${space.sm}px;
`

export const Heading = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

export const List = styled.ul`
  display: grid;
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

export const Row = styled.li`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;
  padding: ${space.xs}px ${space.md}px;
  background: ${color.surface};
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;
`

export const SeatNumber = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

export const Muted = styled.p`
  margin: 0;
  color: ${color.muted};
`

export const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.sm}px;
`

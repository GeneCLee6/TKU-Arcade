// The pieces the room's screens are built from, so the waiting room and the game look the same
import styled from 'styled-components'
import type { RoomMember, RoomView } from '../../shared/protocol.ts'
import { displayType, glass, monoType, SLANT } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

export const seatedMembers = (view: RoomView): RoomMember[] =>
  Object.values(view.members)
    .filter((member) => member.seat !== null)
    .sort((a, b) => (a.seat as number) - (b.seat as number))

/** A glass panel with a heading: the room's seats, chat, invitation, rules */
export const Section = styled.section`
  ${glass}
  display: grid;
  gap: ${space.md}px;
  padding: ${space.lg}px;
`

/** Things that go together, without a panel of their own */
export const Stack = styled.div`
  display: grid;
  gap: ${space.sm}px;
`

/** A panel's title, after a slanted mark in the current hue */
export const Heading = styled.h2`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  margin: 0;
  ${displayType}
  font-size: ${fontSize.lg}px;

  &::before {
    content: '';
    flex: none;
    width: 10px;
    height: 14px;
    background: ${color.accent};
    transform: skewX(${SLANT});
  }
`

export const List = styled.ul`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

/** One line of a list: a member, a free seat. `$mark` paints a bar down its left edge (a seat's colour) */
export const Row = styled.li<{ $mark?: string }>`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 44px;
  padding: ${space.xs}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => p.$mark ?? color.line};
`

export const SeatNumber = styled.span`
  ${monoType}
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

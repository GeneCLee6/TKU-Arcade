import styled from 'styled-components'
import { avatarColor, initialOf } from '../lib/avatar.ts'
import { displayType } from '../styles/esports.ts'
import { color, fontSize } from '../styles/tokens.ts'

export interface AvatarProps {
  name: string
  /** A colour that means something here, such as the seat's piece; by the name without it */
  tint?: string
}

/** A person's mark beside their name, which it repeats: hidden from screen readers */
export function Avatar({ name, tint }: AvatarProps) {
  return (
    <Circle aria-hidden="true" style={{ background: tint ?? avatarColor(name) }}>
      {initialOf(name)}
    </Circle>
  )
}

const Circle = styled.span`
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  /* A hexagon, the shell's shape for a person */
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
  color: ${color.onSeat};
  ${displayType}
  font-size: ${fontSize.sm}px;
  line-height: 1;
`

import styled from 'styled-components'
import { avatarColor, initialOf } from '../lib/avatar.ts'
import { displayType } from '../styles/esports.ts'
import { color, fontSize } from '../styles/tokens.ts'

export interface AvatarProps {
  name: string
  /** A colour that means something here, such as the seat's piece; by the name without it */
  tint?: string
  /** Its width and height in px (2026-11-23: the waiting room's seat cards); 30 without it */
  size?: number
}

/** A person's mark beside their name, which it repeats: hidden from screen readers */
export function Avatar({ name, tint, size }: AvatarProps) {
  const sized = size === undefined ? {} : { width: size, height: size, fontSize: size * 0.45 }
  return (
    <Circle aria-hidden="true" style={{ background: tint ?? avatarColor(name), ...sized }}>
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

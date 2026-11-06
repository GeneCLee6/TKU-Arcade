import styled from 'styled-components'
import { avatarColor, initialOf } from '../lib/avatar.ts'
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
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: ${color.onSeat};
  font-size: ${fontSize.sm}px;
  font-weight: 600;
  line-height: 1;
`

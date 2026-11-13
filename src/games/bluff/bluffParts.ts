// Small pieces the bluff screen's panels share
import styled from 'styled-components'
import { monoType, SLANT } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'

export const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

export const Count = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

export const Name = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${space.xs}px ${space.sm}px;
  font-weight: 700;
  overflow-wrap: anywhere;
`

export const Muted = styled.span`
  color: ${color.muted};
  font-weight: 400;
`

export const Body = styled.p`
  margin: 0;
  color: ${color.muted};
`

/** A slanted tag in the game's hue: a role, "Judge" */
export const Tag = styled.span<{ $tone?: 'accent' | 'success' | 'danger' | 'plain' }>`
  display: inline-block;
  padding: 0 ${space.sm}px;
  color: ${(p) => (p.$tone === 'plain' ? color.text : color.onAccent)};
  background: ${(p) =>
    p.$tone === 'success'
      ? color.success
      : p.$tone === 'danger'
        ? color.danger
        : p.$tone === 'plain'
          ? color.raised
          : color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  transform: skewX(${SLANT});

  & > span {
    display: inline-block;
    transform: skewX(calc(-1 * ${SLANT}));
  }
`

/** A status pill at the end of a row: reading now, done, decided */
export const Pill = styled.span<{ $on: boolean }>`
  ${monoType}
  padding: 2px ${space.sm}px;
  color: ${(p) => (p.$on ? color.onAccent : color.muted)};
  background: ${(p) => (p.$on ? color.accent : color.raised)};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

/** One choice in a list of big, thumb-sized buttons: a reader to vote for or to give a sticker */
export const Choice = styled.button`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  width: 100%;
  min-height: 56px;
  padding: ${space.sm}px ${space.md}px;
  color: ${color.text};
  background: ${color.sunken};
  border: 2px solid ${color.border};
  font: inherit;
  font-size: ${fontSize.lg}px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;

  &:hover:not([aria-disabled='true']) {
    background: ${color.raised};
  }

  &[aria-pressed='true'] {
    border-color: ${color.accent};
    background: ${color.raised};
    box-shadow: inset 6px 0 0 ${color.accent};
  }

  &[aria-disabled='true'] {
    cursor: default;
    opacity: 0.7;
  }
`

export const Choices = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

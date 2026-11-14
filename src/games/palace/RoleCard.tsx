import styled, { css } from 'styled-components'
import type { PalaceRole } from '../../../shared/games/palace/types.ts'
import { VisuallyHidden } from '../../components/VisuallyHidden.ts'
import { useT } from '../../i18n/useT.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { glyphKey, roleKey } from './screenState.ts'

export type CardSize = 'lg' | 'sm'

/**
 * A role's card, drawn in CSS: one big character in a double frame, like a seal on a court
 * document, and the role's name under it. `lost` is a card turned face up for good (greyed);
 * a card back is `CardBack`.
 */
export function RoleCard({ role, size = 'lg', lost = false }: { role: PalaceRole; size?: CardSize; lost?: boolean }) {
  const t = useT()
  return (
    <Face $size={size} $lost={lost} data-role={role} title={size === 'sm' ? t(roleKey(role)) : undefined}>
      <Glyph lang="zh-TW" aria-hidden="true" $size={size} $lost={lost}>
        {t(glyphKey(role))}
      </Glyph>
      {size === 'lg' ? <Name>{t(roleKey(role))}</Name> : <VisuallyHidden>{t(roleKey(role))}</VisuallyHidden>}
    </Face>
  )
}

/** A face-down card: what everyone else sees of a backer */
export function CardBack({ size = 'sm' }: { size?: CardSize }) {
  return <Back $size={size} aria-hidden="true" />
}

const dims = (size: CardSize) =>
  size === 'lg'
    ? css`
        width: clamp(96px, 28vw, 132px);
        aspect-ratio: 5 / 7;
      `
    : css`
        width: 28px;
        aspect-ratio: 5 / 7;
      `

const Face = styled.span<{ $size: CardSize; $lost: boolean }>`
  ${(p) => dims(p.$size)}
  position: relative;
  display: inline-grid;
  grid-template-rows: ${(p) => (p.$size === 'lg' ? '1fr auto' : '1fr')};
  place-items: center;
  gap: ${space.xs}px;
  padding: ${(p) => (p.$size === 'lg' ? space.sm : 2)}px;
  color: ${color.text};
  border: 2px solid ${(p) => (p.$lost ? color.border : color.accent)};
  border-radius: 6px;
  box-shadow: inset 0 0 0 ${(p) => (p.$size === 'lg' ? 4 : 2)}px ${color.surface},
    inset 0 0 0 ${(p) => (p.$size === 'lg' ? 5 : 3)}px ${(p) => (p.$lost ? color.border : color.accent)};
  background: ${(p) => (p.$lost ? color.sunken : color.surface)};
  text-align: center;
`

const Glyph = styled.span<{ $size: CardSize; $lost: boolean }>`
  ${displayType}
  color: ${(p) => (p.$lost ? color.muted : color.accent)};
  font-size: ${(p) => (p.$size === 'lg' ? 'clamp(40px, 13vw, 60px)' : '15px')};
  line-height: 1;
`

const Name = styled.span`
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  line-height: 1.2;
`

const Back = styled.span<{ $size: CardSize }>`
  ${(p) => dims(p.$size)}
  display: inline-block;
  background: repeating-linear-gradient(45deg, ${color.accent} 0 3px, ${color.surface} 3px 7px);
  border: 2px solid ${color.accent};
  border-radius: 4px;
`

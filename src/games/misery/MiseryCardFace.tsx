import styled, { css, keyframes } from 'styled-components'
import type { MiseryCard } from '../../../shared/games/misery/types.ts'
import { useT } from '../../i18n/useT.ts'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import './messages.ts'
import { miseryFill } from './screenState.ts'

/** The index on its meter colour; `null` is the hidden one, a pulsing question mark */
export function IndexBadge({ index, size = 'md' }: { index: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const t = useT()
  if (index === null) {
    return (
      <Badge $fill={color.raised} $ink={color.text} $size={size} $hidden role="img" aria-label={t('games.misery.ui.hidden')}>
        ?
      </Badge>
    )
  }
  return (
    <Badge $fill={miseryFill(index)} $ink={color.onAccent} $size={size} role="img" aria-label={t('games.misery.ui.index', { index })}>
      {index}
    </Badge>
  )
}

/** One card of a line: its index, what happened and its category */
export function CardFace({ card, fresh }: { card: MiseryCard; fresh?: boolean }) {
  return (
    <Face $fill={miseryFill(card.index)} $fresh={fresh === true} data-testid="line-card">
      <IndexBadge index={card.index} />
      <Text>
        <Title lang="zh-TW">{card.title}</Title>
        <Category lang="zh-TW">{card.category}</Category>
      </Text>
    </Face>
  )
}

const pulse = keyframes`
  50% { opacity: 0.55; }
`

const pop = keyframes`
  from { transform: scale(0.92); opacity: 0; }
  to { transform: none; opacity: 1; }
`

const SIZES = { sm: 28, md: 44, lg: 72 } as const

const Badge = styled.span<{ $fill: string; $ink: string; $size: 'sm' | 'md' | 'lg'; $hidden?: boolean }>`
  ${monoType}
  display: inline-grid;
  flex: none;
  place-items: center;
  width: ${(p) => SIZES[p.$size]}px;
  height: ${(p) => SIZES[p.$size]}px;
  color: ${(p) => p.$ink};
  background: ${(p) => p.$fill};
  border-radius: 50%;
  font-size: ${(p) => (p.$size === 'lg' ? fontSize.xxl : p.$size === 'md' ? fontSize.lg : fontSize.sm)}px;
  font-weight: 800;
  letter-spacing: 0;
  ${(p) =>
    p.$hidden &&
    css`
      animation: ${pulse} 1.6s ease-in-out infinite;
    `}
`

const Face = styled.div<{ $fill: string; $fresh: boolean }>`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
  padding: ${space.sm}px ${space.md}px;
  background: ${color.sunken};
  box-shadow: inset 4px 0 0 ${(p) => p.$fill};
  ${(p) =>
    p.$fresh &&
    css`
      animation: ${pop} 0.5s ease-out;
      outline: 2px solid ${color.accent};
      outline-offset: -2px;
    `}
`

const Text = styled.div`
  display: grid;
  min-width: 0;
`

const Title = styled.span`
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
`

const Category = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

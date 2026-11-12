import styled from 'styled-components'
import type { AnyGameInfo } from '../../shared/games/types.ts'
import { useT } from '../i18n/useT.ts'
import { Link } from '../lib/router.tsx'
import { hasRules } from '../lib/rulesDoc.ts'
import { cornerClip, displayType, monoType } from '../styles/esports.ts'
import { color, fontSize, gameHue, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { Card } from './Card.tsx'

interface GameCardProps {
  game: AnyGameInfo
  /** A room is being created: a second click would make a second room */
  disabled: boolean
  onNewRoom: () => void
}

export function GameCard({ game, disabled, onNewRoom }: GameCardProps) {
  const t = useT()
  const { minPlayers, maxPlayers, minutes, i18nKey } = game.meta
  const name = t(`${i18nKey}.name`)
  const players =
    minPlayers === maxPlayers
      ? t('lobby.players.exact', { count: minPlayers })
      : t('lobby.players.range', { min: minPlayers, max: maxPlayers })

  return (
    <Body $hue={gameHue(game.id)}>
      <Heading>
        <Monogram aria-hidden>{[...name][0]}</Monogram>
        <Name>{name}</Name>
      </Heading>
      <Facts>
        <span>{players}</span>
        <span>{t('lobby.minutes', { minutes })}</span>
      </Facts>
      <Summary>{t(`${i18nKey}.summary`)}</Summary>
      {hasRules(game.id) && (
        <RulesLink to={`/games/${game.id}/rules`} aria-label={t('rules.pageTitle', { game: name })}>
          {t('rules.howToPlay')}
        </RulesLink>
      )}
      <Button disabled={disabled} onClick={onNewRoom}>
        {t('lobby.newRoom')}
      </Button>
    </Body>
  )
}

// The game's hue becomes the accent inside: its strip, its monogram, its "New room"
const Body = styled(Card)<{ $hue: string }>`
  --color-accent: ${(p) => p.$hue};
  display: flex;
  flex-direction: column;
  gap: ${space.md}px;
  height: 100%;
  transition: translate 0.2s;

  /* The hue down from the top edge, on the same cut shape as the glass */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(
      180deg,
      ${color.accent} 0 3px,
      color-mix(in srgb, ${color.accent} 14%, transparent) 3px,
      transparent 60%
    );
    clip-path: ${cornerClip(16)};
    pointer-events: none;
  }

  &:hover {
    translate: 0 -${space.xs}px;
  }

  & > button {
    margin-top: auto;
  }

  @media (max-width: 480px) {
    gap: ${space.sm}px;
    padding: ${space.lg}px;
  }
`

const Heading = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
`

// Stands in for the illustrations of a later batch: a hexagon in the game's hue
const Monogram = styled.span`
  display: grid;
  place-items: center;
  flex: none;
  width: ${space.xxxl}px;
  height: ${space.xxxl}px;
  background: ${color.accent};
  color: ${color.onAccent};
  clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
  ${displayType}
  font-size: ${fontSize.xl}px;
`

const Name = styled.h3`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.xl}px;
`

const Facts = styled.p`
  ${monoType}
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.lg}px;
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Summary = styled.p`
  margin: 0;
  color: ${color.muted};
`

const RulesLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  align-self: flex-start;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-decoration-color: ${color.accent};
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
`

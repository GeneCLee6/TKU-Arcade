import { Link } from 'react-router-dom'
import styled from 'styled-components'
import type { AnyGameInfo } from '../../shared/games/types.ts'
import { useT } from '../i18n/useT.ts'
import { hasRules } from '../lib/rulesDoc.ts'
import { monoType } from '../styles/esports.ts'
import { color, fontSize, gameHue, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { Body, Heading, Monogram, Name, Summary } from './gameCardParts.ts'

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

const Facts = styled.p`
  ${monoType}
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.lg}px;
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
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

import { Link } from 'react-router-dom'
import styled from 'styled-components'
import type { AnyGameModule } from '../../shared/games/types.ts'
import { useT } from '../i18n/useT.ts'
import { hasRules } from '../lib/rulesDoc.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { Card } from './Card.tsx'

interface GameCardProps {
  game: AnyGameModule
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
    <Body>
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

const Body = styled(Card)`
  display: flex;
  flex-direction: column;
  gap: ${space.md}px;
  height: 100%;

  & > button {
    margin-top: auto;
  }
`

const Heading = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.md}px;
`

// Stands in for the illustrations of a later batch
const Monogram = styled.span`
  display: grid;
  place-items: center;
  flex: none;
  width: ${space.xxxl}px;
  height: ${space.xxxl}px;
  background: ${color.accent};
  color: ${color.onAccent};
  border-radius: ${radius.component}px;
  font-size: ${fontSize.xl}px;
  font-weight: 600;
`

const Name = styled.h3`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Facts = styled.p`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px ${space.lg}px;
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Summary = styled.p`
  margin: 0;
`

const RulesLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  align-self: flex-start;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

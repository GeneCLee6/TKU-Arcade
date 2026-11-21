import { lazy, Suspense } from 'react'
import styled from 'styled-components'
import type { GameCard as GameCardInfo } from '../../shared/games/lobby.ts'
import { useT } from '../i18n/useT.ts'
import { Link } from '../lib/router.tsx'
import { hasRules } from '../lib/rulesList.ts'
import { monoType } from '../styles/esports.ts'
import { color, fontSize, gameHue, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { Body, Heading, Monogram, Name, Summary } from './gameCardParts.ts'

// e7-t12: after the first paint; the first letter until then
const GameArt = lazy(() => import('./GameArt.tsx'))

interface GameCardProps {
  game: GameCardInfo
  /** A room is being created: a second click would make a second room */
  disabled: boolean
  /** Paused by the owner (e12-t11): said on the card, and no New room */
  paused?: boolean
  onNewRoom: () => void
}

export function GameCard({ game, disabled, paused = false, onNewRoom }: GameCardProps) {
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
        <Monogram aria-hidden>
          <Suspense fallback={[...name][0]}>
            <GameArt gameId={game.id} fallback={[...name][0]} />
          </Suspense>
        </Monogram>
        <Name>{name}</Name>
      </Heading>
      <Facts>
        <span>{players}</span>
        <span>{t('lobby.minutes', { minutes })}</span>
        {/* 2026-11-21: the room plays computer seats, or (the kart) its own page races the computer */}
        {(game.meta.computer === true || game.meta.tryAlone !== undefined) && (
          <ComputerTag>{t('lobby.computerTag')}</ComputerTag>
        )}
      </Facts>
      <Summary>{t(`${i18nKey}.summary`)}</Summary>
      {hasRules(game.id) && (
        <RulesLink to={`/games/${game.id}/rules`} aria-label={t('rules.pageTitle', { game: name })}>
          {t('rules.howToPlay')}
        </RulesLink>
      )}
      {game.meta.tryAlone && (
        <RulesLink to={game.meta.tryAlone} data-try={game.id}>
          {t(`${i18nKey}.tryAlone`)}
        </RulesLink>
      )}
      {paused && <Paused role="note">{t('lobby.paused')}</Paused>}
      <Button disabled={disabled || paused} onClick={onNewRoom}>
        {t('lobby.newRoom')}
      </Button>
    </Body>
  )
}

const Paused = styled.p`
  margin: 0;
  color: ${color.danger};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

// Text in the text colour, the game's hue only as the mark before it
const ComputerTag = styled.span`
  color: ${color.text};
  font-weight: 700;

  &::before {
    content: '';
    display: inline-block;
    width: 8px;
    height: 8px;
    margin-right: ${space.xs}px;
    background: ${color.accent};
    rotate: 45deg;
  }
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

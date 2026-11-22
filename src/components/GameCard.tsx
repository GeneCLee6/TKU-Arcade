import { lazy, Suspense } from 'react'
import styled from 'styled-components'
import type { GameCard as GameCardInfo } from '../../shared/games/lobby.ts'
import { useT } from '../i18n/useT.ts'
import { Link } from '../lib/router.tsx'
import { hasRules } from '../lib/rulesList.ts'
import { monoType } from '../styles/esports.ts'
import { color, fontSize, gameHue, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { Body, Cover, Heading, Monogram, Name, Summary } from './gameCardParts.ts'

// e7-t12, 2026-11-23: the cover is drawn after the first paint; the first letter until then
const GameCover = lazy(() =>
  import('./GameArt.tsx').then(({ GameCover }) => ({ default: GameCover })),
)

interface GameCardProps {
  game: GameCardInfo
  /** Its place in the lobby's list, shown on its cover */
  index?: number
  /** A room is being created: a second click would make a second room */
  disabled: boolean
  /** Paused by the owner (e12-t11): said on the card, and no New room */
  paused?: boolean
  onNewRoom: () => void
}

export function GameCard({ game, index = 0, disabled, paused = false, onNewRoom }: GameCardProps) {
  const t = useT()
  const { minPlayers, maxPlayers, minutes, i18nKey } = game.meta
  const name = t(`${i18nKey}.name`)
  const players =
    minPlayers === maxPlayers
      ? t('lobby.players.exact', { count: minPlayers })
      : t('lobby.players.range', { min: minPlayers, max: maxPlayers })

  return (
    <Body $hue={gameHue(game.id)}>
      <Cover aria-hidden>
        <Suspense fallback={<Monogram>{[...name][0]}</Monogram>}>
          <GameCover gameId={game.id} index={index} />
        </Suspense>
      </Cover>
      <Heading>
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
      {paused && <Paused role="note">{t('lobby.paused')}</Paused>}
      {/* 2026-11-23: on a phone the links and New room share one row, so that the first card's
          New room is on the first screen; a wider screen keeps them one under another */}
      <Actions>
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
        <Button disabled={disabled || paused} onClick={onNewRoom}>
          {t('lobby.newRoom')}
        </Button>
      </Actions>
    </Body>
  )
}

// No box of its own on a wide screen: its children stay the card's, New room pushed to the bottom
const Actions = styled.div`
  display: contents;

  & > button {
    margin-top: auto;
  }

  @media (max-width: 480px) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: ${space.xs}px ${space.lg}px;
    margin-top: auto;

    & > button {
      flex: 1 0 auto;
      margin-top: 0;
    }
  }
`

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

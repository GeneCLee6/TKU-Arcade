// The lobby's "Play the computer" (2026-11-21, docs/ARCHITECTURE.md §4.55): every table game the
// room plays computer seats in (GameMeta.computer) and the kart's two ways to play alone, one tap
// each. A table game opens a private room with enough computer players for the game's fewest
// (shared/games/quickBots.ts), whose game starts as soon as this person joins it; the kart goes
// straight to its own page. Its own lazy chunk, after the first paint, like the public rooms.
import { useState } from 'react'
import styled from 'styled-components'
import { LOBBY_GAMES } from '../../shared/games/lobby.ts'
import { QUICK_BOT_LEVEL, quickBotCount } from '../../shared/games/quickBots.ts'
import { TABLE_BOT_LEVELS } from '../../shared/games/tableBots.ts'
import type { QuickBots } from '../../shared/protocol.ts'
import { useT } from '../i18n/useT.ts'
import { useNavigate } from '../lib/useRouter.ts'
import { displayType } from '../styles/esports.ts'
import { color, fontSize, gameHue, space } from '../styles/tokens.ts'
import { Button } from './Button.tsx'
import { Card } from './Card.tsx'
import { SegmentedSwitch } from './SegmentedSwitch.tsx'

export interface QuickPlayProps {
  /** A room is being created: a second tap would make a second room */
  disabled: boolean
  /** Paused by the owner (e12-t11) */
  paused: readonly string[]
  onPlay(gameId: string, bots: QuickBots): void
}

const COMPUTER_GAMES = LOBBY_GAMES.filter((game) => game.meta.computer === true)
const KART_LISTED = LOBBY_GAMES.some((game) => game.id === 'kart')

export default function QuickPlay({ disabled, paused, onPlay }: QuickPlayProps) {
  const t = useT()
  const navigate = useNavigate()
  const [level, setLevel] = useState<string>(QUICK_BOT_LEVEL)
  return (
    <Box aria-labelledby="quick-play-title" data-testid="quick-play">
      <Top>
        <div>
          <Title id="quick-play-title">{t('lobby.quick.title')}</Title>
          <Hint>{t('lobby.quick.hint')}</Hint>
        </div>
        <Level>
          <span aria-hidden="true">{t('lobby.quick.level')}</span>
          <SegmentedSwitch
            label={t('lobby.quick.level')}
            options={TABLE_BOT_LEVELS.map((one) => ({
              value: one,
              label: t(`lobby.quick.level.${one}`),
            }))}
            value={level}
            onChange={setLevel}
          />
        </Level>
      </Top>
      <List>
        {COMPUTER_GAMES.map((game) => {
          const name = t(`${game.meta.i18nKey}.name`)
          const count = quickBotCount(game.meta)
          return (
            <li key={game.id}>
              <Tile $hue={gameHue(game.id)}>
                <Name>{name}</Name>
                <Facts>
                  {t(count === 1 ? 'lobby.quick.versusOne' : 'lobby.quick.versus', { count })}
                </Facts>
                <Button
                  $size="sm"
                  disabled={disabled || paused.includes(game.id)}
                  aria-label={t('lobby.quick.playNamed', { game: name })}
                  onClick={() => onPlay(game.id, { count, level })}
                  data-quick={game.id}
                >
                  {t('lobby.quick.play')}
                </Button>
              </Tile>
            </li>
          )
        })}
        {KART_LISTED && (
          <>
            <li>
              <Tile $hue={gameHue('kart')}>
                <Name>{t('lobby.quick.kartRace')}</Name>
                <Facts>{t('lobby.quick.kartRaceHint')}</Facts>
                <Button
                  $size="sm"
                  onClick={() => navigate('/kart?bots')}
                  data-quick="kart-bots"
                >
                  {t('lobby.quick.play')}
                </Button>
              </Tile>
            </li>
            <li>
              <Tile $hue={gameHue('kart')}>
                <Name>{t('lobby.quick.kartSchool')}</Name>
                <Facts>{t('lobby.quick.kartSchoolHint')}</Facts>
                <Button
                  $size="sm"
                  $variant="secondary"
                  onClick={() => navigate('/kart?school')}
                  data-quick="kart-school"
                >
                  {t('lobby.quick.school')}
                </Button>
              </Tile>
            </li>
          </>
        )}
      </List>
    </Box>
  )
}

// A strip of the brand's colour down the left: the lobby's one call to play now
const Box = styled.section`
  display: grid;
  gap: ${space.md}px;
  min-width: 0;
  padding: ${space.lg}px;
  background: color-mix(in srgb, ${color.brand} 8%, ${color.sunken});
  box-shadow: inset 4px 0 0 ${color.brand};

  @media (max-width: 480px) {
    gap: ${space.sm}px;
    padding: ${space.sm}px ${space.sm}px ${space.sm}px ${space.md}px;
  }
`

const Top = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${space.sm}px ${space.lg}px;
`

const Title = styled.h2`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.xl}px;
`

const Hint = styled.p`
  margin: ${space.xs}px 0 0;
  max-width: 40em;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Level = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

// Two to a row on a phone, all in one row on a desktop
const List = styled.ul`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(132px, 100%), 1fr));
  gap: ${space.sm}px;
  margin: 0;
  padding: 0;
  list-style: none;
`

const Tile = styled(Card)<{ $hue: string }>`
  --color-accent: ${(p) => p.$hue};
  display: flex;
  flex-direction: column;
  gap: ${space.xs}px;
  height: 100%;
  padding: ${space.md}px;
  box-shadow: inset 0 3px 0 ${color.accent};

  @media (max-width: 480px) {
    padding: ${space.sm}px;
  }

  & > button {
    margin-top: auto;
    align-self: stretch;
  }
`

// Not a heading: the game cards below are the games' headings (and the tests find a card by it)
const Name = styled.p`
  margin: 0;
  ${displayType}
  font-size: ${fontSize.md}px;
  overflow-wrap: anywhere;
`

const Facts = styled.p`
  margin: 0 0 ${space.sm}px;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

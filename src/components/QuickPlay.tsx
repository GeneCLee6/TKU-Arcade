// The lobby's "Play the computer" (2026-11-21, docs/ARCHITECTURE.md §4.55): every table game the
// room plays computer seats in (GameMeta.computer) and the kart's two ways to play alone, one tap
// each. A table game opens a private room with as many computer players as the person picks on its
// tile (2026-11-22: one up to a full table, a lively number first; shared/games/quickBots.ts), all at
// one level or each at its own, whose game starts as soon as this person joins it; the kart goes
// straight to its own page. Its own lazy chunk, after the first paint, like the public rooms.
// 2026-11-23: on a phone it starts folded into one row with a Show button, so that the games and their
// "New room" stay on the first screen (e2e/mobile.spec.ts); a wider screen always shows it all.
import { useState } from 'react'
import styled from 'styled-components'
import { LOBBY_GAMES } from '../../shared/games/lobby.ts'
import { QUICK_BOT_LEVEL, quickBotCount, quickBotRange } from '../../shared/games/quickBots.ts'
import { TABLE_BOT_LEVELS, TABLE_BOT_NAMES, type TableBotLevel } from '../../shared/games/tableBots.ts'
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
/** How many tiles the list has: the folded row says so */
const TILES = COMPUTER_GAMES.length + (KART_LISTED ? 2 : 0)
/** The level switch's own choice for "each computer player at its own level" */
const EACH = 'each'

export default function QuickPlay({ disabled, paused, onPlay }: QuickPlayProps) {
  const t = useT()
  const navigate = useNavigate()
  const [level, setLevel] = useState<string>(QUICK_BOT_LEVEL)
  // Folded on a phone until asked for (the CSS ignores it on a wider screen)
  const [open, setOpen] = useState(false)
  // Per game, what the person changed: how many, and (picking each) the level of each in turn
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [each, setEach] = useState<Record<string, string[]>>({})
  const levelOf = (gameId: string, index: number) =>
    (each[gameId]?.[index] ?? QUICK_BOT_LEVEL) as TableBotLevel
  const cycle = (gameId: string, index: number, count: number) =>
    setEach((was) => {
      const now = Array.from({ length: count }, (_, at) => was[gameId]?.[at] ?? QUICK_BOT_LEVEL)
      const at = (TABLE_BOT_LEVELS as readonly string[]).indexOf(now[index])
      now[index] = TABLE_BOT_LEVELS[(at + 1) % TABLE_BOT_LEVELS.length]
      return { ...was, [gameId]: now }
    })
  return (
    <Box aria-labelledby="quick-play-title" data-testid="quick-play" $open={open}>
      <Top>
        <Intro>
          <Heading>
            <Title id="quick-play-title">{t('lobby.quick.title')}</Title>
            <Toggle
              type="button"
              aria-expanded={open}
              aria-controls="quick-play-games"
              onClick={() => setOpen((was) => !was)}
              data-quick-toggle
            >
              {open ? t('lobby.quick.hide') : t('lobby.quick.show', { count: TILES })}
            </Toggle>
          </Heading>
          <Hint data-fold>{t('lobby.quick.hint')}</Hint>
        </Intro>
        <Level data-fold>
          <span aria-hidden="true">{t('lobby.quick.level')}</span>
          <SegmentedSwitch
            label={t('lobby.quick.level')}
            options={[
              ...TABLE_BOT_LEVELS.map((one) => ({ value: one, label: t(`lobby.quick.level.${one}`) })),
              { value: EACH, label: t('lobby.quick.level.each') },
            ]}
            value={level}
            onChange={setLevel}
          />
        </Level>
      </Top>
      <List id="quick-play-games" data-fold>
        {COMPUTER_GAMES.map((game) => {
          const name = t(`${game.meta.i18nKey}.name`)
          const range = quickBotRange(game.meta, TABLE_BOT_NAMES.length)
          const count = counts[game.id] ?? quickBotCount(game.id, game.meta)
          const set = (next: number) =>
            setCounts((was) => ({ ...was, [game.id]: Math.min(range.max, Math.max(range.min, next)) }))
          const levels = Array.from({ length: count }, (_, index) => levelOf(game.id, index))
          const bots: QuickBots =
            level === EACH ? { count, level: QUICK_BOT_LEVEL, levels } : { count, level }
          return (
            <li key={game.id}>
              <Tile $hue={gameHue(game.id)}>
                <Name>{name}</Name>
                <Facts aria-live="polite">
                  {t(count === 1 ? 'lobby.quick.versusOne' : 'lobby.quick.versus', { count })}
                </Facts>
                <Stepper>
                  <Button
                    $size="sm"
                    $variant="secondary"
                    disabled={count <= range.min}
                    aria-label={t('lobby.quick.fewer', { game: name })}
                    onClick={() => set(count - 1)}
                    data-quick-fewer={game.id}
                  >
                    {t('lobby.quick.minus')}
                  </Button>
                  <Count data-quick-count={game.id}>{count}</Count>
                  <Button
                    $size="sm"
                    $variant="secondary"
                    disabled={count >= range.max}
                    aria-label={t('lobby.quick.more', { game: name })}
                    onClick={() => set(count + 1)}
                    data-quick-more={game.id}
                  >
                    {t('lobby.quick.plus')}
                  </Button>
                </Stepper>
                {level === EACH && (
                  <Chips>
                    {levels.map((one, index) => (
                      <Chip
                        key={index}
                        type="button"
                        $easy={one === 'easy'}
                        aria-label={t('lobby.quick.botLevel', {
                          n: index + 1,
                          game: name,
                          level: t(`lobby.quick.level.${one}`),
                        })}
                        onClick={() => cycle(game.id, index, count)}
                        data-quick-bot={`${game.id}-${index + 1}`}
                      >
                        {t('lobby.quick.botChip', { n: index + 1, level: t(`lobby.quick.level.${one}`) })}
                      </Chip>
                    ))}
                  </Chips>
                )}
                <Button
                  $size="sm"
                  disabled={disabled || paused.includes(game.id)}
                  aria-label={t('lobby.quick.playNamed', { game: name })}
                  onClick={() => onPlay(game.id, bots)}
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

// A strip of the brand's colour down the left: the lobby's one call to play now. Folded on a phone:
// the title and its Show button in one row, the rest hidden until asked for
const Box = styled.section<{ $open: boolean }>`
  display: grid;
  gap: ${space.md}px;
  min-width: 0;
  padding: ${space.lg}px;
  background: color-mix(in srgb, ${color.brand} 8%, ${color.sunken});
  box-shadow: inset 4px 0 0 ${color.brand};

  @media (max-width: 480px) {
    gap: ${space.sm}px;
    padding: ${space.sm}px ${space.sm}px ${space.sm}px ${space.md}px;

    ${(p) => (p.$open ? '' : '& [data-fold] { display: none; }')}
  }
`

// Takes the row, so that a phone's Show button sits at its end
const Intro = styled.div`
  flex: 1 1 auto;
  min-width: 0;
`

// The title, and on a phone the Show button at the end of its row
const Heading = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${space.sm}px;
`

// Only a phone folds the list away
const Toggle = styled.button`
  display: none;
  flex: none;
  align-items: center;
  gap: ${space.xs}px;
  min-height: 44px;
  padding: 0 ${space.md}px;
  color: ${color.text};
  background: ${color.surface};
  border: 1px solid ${color.brand};
  font: inherit;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  cursor: pointer;

  /* A chevron: down to open, up to fold */
  &::after {
    content: '';
    width: 7px;
    height: 7px;
    border: solid currentColor;
    border-width: 0 2px 2px 0;
    rotate: 45deg;
    translate: 0 -2px;
  }

  &[aria-expanded='true']::after {
    rotate: 225deg;
    translate: 0 2px;
  }

  @media (max-width: 480px) {
    display: inline-flex;
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
  transition: translate 0.2s;

  /* 2026-11-23: the game's hue rising from the bottom, and lifted with a neon edge on hover */
  &::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(
      0deg,
      color-mix(in srgb, ${color.accent} 16%, transparent),
      transparent 70%
    );
    pointer-events: none;
  }

  &:hover,
  &:focus-within {
    translate: 0 -${space.xs}px;
  }

  &:hover::before,
  &:focus-within::before {
    box-shadow: inset 0 0 0 1px ${color.accent};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover,
    &:focus-within {
      translate: none;
    }
  }

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
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

// - 5 +: how many computer players, one up to a full table
const Stepper = styled.div`
  display: flex;
  align-items: center;
  gap: ${space.xs}px;
  margin-bottom: ${space.xs}px;

  & > button {
    min-width: 32px;
    padding-inline: 0;
  }
`

const Count = styled.span`
  min-width: 2ch;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
`

// Picking each: one small button per computer player, a tap moves it to the next level
const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
  margin-bottom: ${space.xs}px;
`

const Chip = styled.button<{ $easy: boolean }>`
  min-height: 28px;
  padding: 0 ${space.xs}px;
  color: ${(p) => (p.$easy ? color.muted : color.text)};
  background: ${(p) => (p.$easy ? color.sunken : color.surface)};
  border: 1px solid ${(p) => (p.$easy ? color.border : color.accent)};
  font: inherit;
  font-size: ${fontSize.sm}px;
  cursor: pointer;
`

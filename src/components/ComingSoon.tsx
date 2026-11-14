import styled from 'styled-components'
import { soonMessages } from '../../shared/games/soon.ts'
import { registerMessages, type TextKey } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { Link } from '../lib/router.tsx'
import { clippedFill, monoType, slantClip } from '../styles/esports.ts'
import { color, fontSize, gameHue, space } from '../styles/tokens.ts'
import { Body, Heading, Monogram, Name, Summary } from './gameCardParts.ts'

// A lazy chunk of the lobby (E3, e7-t16), so that neither these cards nor their strings are in the
// first load of the lobby or of a game's room
registerMessages(soonMessages)

// Shown, not playable: games that are not built yet (Silent Table and Spectrum were listed on the
// owner's request, 2026-11-12; Bluff Reader with its screen, I2). Take a game out of here the day it
// is listed. Its id, where its strings are (`${keys}.name` and `${keys}.summary`), and a page to try
// it alone, if any (the kart's time trial, owner 2026-11-14)
const SOON: readonly (readonly [id: string, keys: string, tryAt?: string])[] = [
  ['kart', 'games.kart', '/kart'],
]

/**
 * The games that are not open yet, as items of the lobby's list of games: name, summary and a
 * "Coming soon" tag, in the game's hue. No room and no rules; a game that can be tried alone (the
 * kart's time trial, 2026-11-14) has a link to it, never to the hidden tuning page (the kart's spike).
 * The tag is in the heading, so a screen reader hears it with the name.
 */
export default function ComingSoon() {
  const t = useT()
  return SOON.map(([id, keys, tryAt]) => {
    const name = t(`${keys}.name` as TextKey)
    return (
      <li key={id}>
        <SoonBody $hue={gameHue(id)}>
          <Heading>
            <Monogram aria-hidden>{[...name][0]}</Monogram>
            <Name>
              {name} <Tag>{t('games.soon')}</Tag>
            </Name>
          </Heading>
          <Summary>{t(`${keys}.summary` as TextKey)}</Summary>
          {tryAt && (
            <TryLink to={tryAt} data-try={id}>
              {t(`${keys}.tryNow` as TextKey)}
            </TryLink>
          )}
        </SoonBody>
      </li>
    )
  })
}

// Blocked: no lift, and slanted hatching in the hue in place of the glow
const SoonBody = styled(Body)`
  &::after {
    background:
      linear-gradient(${color.accent} 0 3px, transparent 3px),
      repeating-linear-gradient(
        -76deg,
        color-mix(in srgb, ${color.accent} 9%, transparent) 0 6px,
        transparent 6px 16px
      );
  }

  &:hover {
    translate: none;
  }
`

// A slanted tag under the name
const Tag = styled.span`
  ${clippedFill(slantClip(8), color.raised)}
  display: block;
  width: fit-content;
  margin-top: ${space.xs}px;
  padding: 0 ${space.md}px;
  ${monoType}
  font-size: ${fontSize.sm}px;
  font-style: normal;
  font-weight: 700;
  text-transform: uppercase;
`

// The one thing to press on a coming-soon card: trying it alone, not a room
const TryLink = styled(Link)`
  justify-self: start;
  color: ${color.accent};
  font-weight: 700;
  font-size: ${fontSize.sm}px;
`

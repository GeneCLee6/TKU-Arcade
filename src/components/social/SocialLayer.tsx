// The room's social layer (e7-t11's reactions, grown 2026-11-23; docs/ARCHITECTURE.md §4.97): one lazy
// chunk over every room screen, waiting room, game, result, the race and watching it.
//
// - Emotes and phrases (shared/social.ts): a button in a corner opens twelve emotes and eight canned
//   phrases. Each goes to the room as a number; everyone's float as a bubble by the sender's name or
//   seat card (bus.ts SOCIAL_MEMBER), over their kart's name tag in a race (SOCIAL_SEAT), and where
//   the sender is nowhere on screen, in a corner with their name. Screen readers hear each once.
// - Player cards: a name anywhere in the room opens that member's card (PlayerCard.tsx, its own chunk).
// - This person's own card goes to the room whenever the room has none or an older one (summary.ts),
//   unless they hid it on "My profile".
//
// Its parts are exported for a screen that wants them in its own panel (the fixed-screen shell).
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import styled, { css, keyframes } from 'styled-components'
import type { RoomMember, RoomView } from '../../../shared/protocol.ts'
import {
  EMOTE_COUNT,
  isPhrase,
  PHRASE_COUNT,
  type ProfileSummary,
} from '../../../shared/social.ts'
import {
  isCardShared,
  setRaceEmotesShown,
  useCardShared,
  useRaceEmotesShown,
  useTitleChoice,
} from '../../achievements/cardPrefs.ts'
import { currentSummary } from '../../achievements/summary.ts'
import '../../i18n/roomExtras.ts'
import { useT } from '../../i18n/useT.ts'
import { memberName } from '../../lib/memberName.ts'
import { useReducedMotion } from '../../lib/useMediaQuery.ts'
import { REACTION_FLOAT_MS, type FloatingReaction } from '../../lib/reactions.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { VisuallyHidden } from '../VisuallyHidden.ts'
import { onOpenPlayerCard, SOCIAL_MEMBER, SOCIAL_SEAT } from './bus.ts'
import { EMOTE_GLYPHS } from './glyphs.ts'
import { ReactionGate } from './reactionGate.ts'
import { playSocial } from './sound.ts'

const PlayerCard = lazy(() => import('./PlayerCard.tsx'))

export interface SocialLayerProps {
  view: RoomView
  you: string
  reactions: readonly FloatingReaction[]
  onReact(reaction: number): void
  onSendProfile(profile: ProfileSummary | null): void
}

export default function SocialLayer({ view, you, reactions, onReact, onSendProfile }: SocialLayerProps) {
  const kart = view.room.gameId === 'kart'
  const racing = kart && view.room.status === 'playing'
  const raceShown = useRaceEmotesShown()
  const quiet = racing && !raceShown
  const [card, setCard] = useState<string | null>(null)
  useEffect(
    () =>
      onOpenPlayerCard((member) => {
        playSocial('open')
        setCard(member)
      }),
    [],
  )
  useProfileSync(view.members[you], view.room.status, onSendProfile)
  useReactionSounds(quiet ? NONE : reactions)
  const nameOf = (member: string) => {
    const one = view.members[member]
    return one ? memberName(one, view.room.gameId) : ''
  }
  const cardMember = card === null ? undefined : view.members[card]
  return (
    // Kept usable when a screen makes the rest of the page inert (the race room's waiting room,
    // Promotion's focus mode: src/lib/inertOthers.ts)
    <Root data-inert-keep="">
      <EmoteDock onReact={onReact} raceToggle={kart} racing={racing} />
      <Bubbles
        reactions={quiet ? NONE : reactions}
        members={view.members}
        nameOf={nameOf}
        racing={racing}
      />
      {cardMember && (
        <Suspense>
          <PlayerCard
            member={cardMember}
            name={nameOf(cardMember.id)}
            isYou={cardMember.id === you}
            onClose={() => {
              playSocial('close')
              setCard(null)
            }}
          />
        </Suspense>
      )}
    </Root>
  )
}

const NONE: readonly FloatingReaction[] = []

/**
 * Sends this person's card when the room has none or another (a new member, an achievement since,
 * a title changed), and takes it away when they hide it. The room keeps it with the member, so
 * this sends once per room, not per connection
 */
function useProfileSync(
  mine: RoomMember | undefined,
  status: string,
  send: (profile: ProfileSummary | null) => void,
) {
  const shared = useCardShared()
  const title = useTitleChoice()
  const kept = mine?.profile === undefined ? null : JSON.stringify(mine.profile)
  const id = mine?.id
  const bot = mine?.bot !== undefined
  useEffect(() => {
    if (id === undefined || bot) return
    if (!shared || !isCardShared()) {
      if (kept !== null) send(null)
      return
    }
    // After a game the engine counts its result first (RoomWatch): read the save a moment later
    const timer = window.setTimeout(
      () => {
        const summary = currentSummary()
        if (summary && JSON.stringify(summary) !== kept) send(summary)
      },
      status === 'ended' ? 1500 : 0,
    )
    return () => window.clearTimeout(timer)
  }, [id, bot, shared, title, kept, status, send])
}

/** A soft sound for each reaction as it comes (one's own too: it says it went) */
function useReactionSounds(reactions: readonly FloatingReaction[]) {
  const heard = useRef(0)
  const newest = reactions.at(-1)
  useEffect(() => {
    if (!newest || newest.id <= heard.current) return
    heard.current = newest.id
    playSocial(isPhrase(newest.reaction) ? 'phrase' : 'emote')
  }, [newest])
}

// ── The button and its panel ─────────────────────────────────────────────────────────────────

interface EmotePickerProps {
  onReact(reaction: number): void
  /** The race room: the panel also has "show emotes during races" */
  raceToggle: boolean
}

/** The corner button and the panel it opens; during a race, halfway up the left edge */
export function EmoteDock({ racing, ...props }: EmotePickerProps & { racing: boolean }) {
  return (
    <Dock data-racing={racing ? '' : undefined} data-social-dock="">
      <EmotePicker {...props} />
    </Dock>
  )
}

/** The button and its panel, for a screen to place itself (the fixed-screen shell's button panel) */
export function EmotePicker({ onReact, raceToggle }: EmotePickerProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [tooFast, setTooFast] = useState(false)
  // The room's own limits, so that a refused one says so instead of vanishing
  const [gate] = useState(() => new ReactionGate())
  const raceShown = useRaceEmotesShown()
  const label = (reaction: number) => t(`room.extra.react.${reaction}`)
  const pick = (reaction: number) => {
    if (!gate.take()) {
      setTooFast(true)
      return
    }
    setTooFast(false)
    onReact(reaction)
    setOpen(false)
  }
  return (
    <Holder
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          // Not the race's pause menu as well
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <Toggle
        type="button"
        aria-expanded={open}
        aria-controls="room-reactions"
        aria-label={t('room.extra.react.bar')}
        title={t('room.extra.react.bar')}
        onClick={() => {
          setOpen(!open)
          setTooFast(false)
        }}
        data-testid="emote-toggle"
      >
        <ToggleFace aria-hidden="true">
          {EMOTE_GLYPHS[0]}
          <Dots />
        </ToggleFace>
      </Toggle>
      <Panel id="room-reactions" role="group" aria-label={t('room.extra.react.bar')} hidden={!open}>
        <PanelHeading>{t('room.extra.react.emotes')}</PanelHeading>
        <Grid>
          {EMOTE_GLYPHS.map((glyph, reaction) => (
            <Pick
              key={glyph}
              type="button"
              aria-label={label(reaction)}
              title={label(reaction)}
              onClick={() => pick(reaction)}
            >
              <span aria-hidden="true">{glyph}</span>
            </Pick>
          ))}
        </Grid>
        <PanelHeading>{t('room.extra.react.phrases')}</PanelHeading>
        <Phrases>
          {Array.from({ length: PHRASE_COUNT }, (_, index) => EMOTE_COUNT + index).map((reaction) => (
            <Phrase key={reaction} type="button" onClick={() => pick(reaction)}>
              {label(reaction)}
            </Phrase>
          ))}
        </Phrases>
        <Status role="status">{tooFast ? t('room.extra.react.tooFast') : ''}</Status>
        {raceToggle && (
          <Check>
            <input
              type="checkbox"
              checked={raceShown}
              onChange={(event) => setRaceEmotesShown(event.target.checked)}
            />
            {t('room.extra.react.inRace')}
          </Check>
        )}
      </Panel>
    </Holder>
  )
}

// ── The bubbles ──────────────────────────────────────────────────────────────────────────────

interface BubblesProps {
  reactions: readonly FloatingReaction[]
  members: Readonly<Record<string, RoomMember>>
  nameOf(member: string): string
  racing: boolean
}

/** Where on screen `member` is: their name or card, else their seat's tag; null when nowhere */
function anchorOf(member: RoomMember | undefined): DOMRect | null {
  if (!member) return null
  const candidates = [
    ...document.querySelectorAll<HTMLElement>(`[${SOCIAL_MEMBER}="${CSS.escape(member.id)}"]`),
    ...(member.seat === null
      ? []
      : document.querySelectorAll<HTMLElement>(`[${SOCIAL_SEAT}="${member.seat}"]`)),
  ]
  for (const element of candidates) {
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) continue
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      continue
    }
    // Inside a closed drawer, or under a modal: not where anyone looks
    if (element.closest('[inert], [hidden]')) continue
    return rect
  }
  return null
}

/**
 * Each member's latest reaction, by their name or seat, followed every frame while any shows (a
 * kart's tag moves with it); one with nowhere to go waits by the corner button, with the name
 */
export function Bubbles({ reactions, members, nameOf, racing }: BubblesProps) {
  const t = useT()
  const still = useReducedMotion()
  const layer = useRef<HTMLDivElement>(null)
  // The newest per member: a second emote replaces the first rather than stacking on a name
  const latest = new Map<string, FloatingReaction>()
  for (const one of reactions) latest.set(one.member, one)
  const shown = [...latest.values()]
  const label = (reaction: number) => t(`room.extra.react.${reaction}`)
  const membersNow = useRef(members)
  useLayoutEffect(() => {
    membersNow.current = members
  })
  const showing = shown.length > 0

  useLayoutEffect(() => {
    if (!showing) return
    let frame = 0
    const place = () => {
      const root = layer.current
      if (!root) return
      let corner = 0
      const dock = document.querySelector('[data-social-dock]')?.getBoundingClientRect()
      for (const element of root.querySelectorAll<HTMLElement>('[data-bubble]')) {
        const rect = anchorOf(membersNow.current[element.dataset.bubble ?? ''])
        if (rect) {
          const below = rect.top < 72
          const x = Math.min(Math.max(rect.left + rect.width / 2, 48), window.innerWidth - 48)
          const y = below ? rect.bottom + 6 : rect.top - 6
          element.dataset.anchored = ''
          element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, ${below ? '0' : '-100%'})`
        } else {
          delete element.dataset.anchored
          // Stacked up from beside the corner button
          const x = (dock?.right ?? 64) + space.sm
          const y = (dock?.bottom ?? window.innerHeight - 16) - corner * 72
          element.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(0, -100%)`
          corner += 1
        }
      }
      frame = window.requestAnimationFrame(place)
    }
    place()
    return () => window.cancelAnimationFrame(frame)
  }, [showing])

  return (
    <Layer ref={layer} aria-live="polite">
      {shown.map((one) => (
        <Bubble
          key={one.id}
          data-bubble={one.member}
          data-testid="emote-bubble"
          $still={still}
          $racing={racing}
        >
          {isPhrase(one.reaction) ? (
            <Said aria-hidden="true" $racing={racing}>
              {label(one.reaction)}
            </Said>
          ) : (
            <Face aria-hidden="true" $racing={racing}>
              {EMOTE_GLYPHS[one.reaction]}
            </Face>
          )}
          <Who aria-hidden="true">{nameOf(one.member)}</Who>
          <VisuallyHidden>
            {t('room.extra.react.heard', { name: nameOf(one.member), reaction: label(one.reaction) })}
          </VisuallyHidden>
        </Bubble>
      ))}
    </Layer>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────────────────────

const Root = styled.div`
  display: contents;
`

// A corner of the screen, over the race too (20) and its podium (30), under its pause menu (40)
const Dock = styled.div`
  position: fixed;
  bottom: calc(${space.lg}px + env(safe-area-inset-bottom));
  left: calc(${space.lg}px + env(safe-area-inset-left));
  z-index: 35;

  /* A phone's bottom is the chat's bar and a game's buttons; a race's bottom corners are its touch
     controls: on the left edge instead, a little above the middle */
  @media (max-width: 899px) {
    top: 52%;
    bottom: auto;
    left: calc(${space.xs}px + env(safe-area-inset-left));
  }

  &[data-racing] {
    top: 40%;
    bottom: auto;
    left: calc(${space.sm}px + env(safe-area-inset-left));
  }
`

const Holder = styled.div`
  position: relative;
`

const Toggle = styled.button`
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  padding: 0;
  color: ${color.text};
  background: color-mix(in srgb, ${color.panel} 88%, transparent);
  border: 1px solid ${color.border};
  clip-path: polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px);
  line-height: 1;
  cursor: pointer;
  backdrop-filter: blur(6px);

  &[aria-expanded='true'] {
    background: color-mix(in srgb, ${color.accent} 30%, ${color.panel});
  }

  @media (max-width: 899px) {
    width: 40px;
    height: 40px;
    opacity: 0.85;
  }

  [data-racing] & {
    opacity: 0.8;
  }
`

const ToggleFace = styled.span`
  position: relative;
  font-size: 22px;
`

// A speech mark by the face: it says "talk", not only "smile"
const Dots = styled.span`
  position: absolute;
  right: -10px;
  bottom: -6px;
  width: 14px;
  height: 10px;
  background: radial-gradient(circle, ${color.accent} 1.5px, transparent 2px) 0 50% / 5px 5px repeat-x;
`

// Opens upwards from the button, over the page, pushing nothing; to its right during a race or on
// a short screen
const Panel = styled.div`
  position: absolute;
  bottom: calc(100% + ${space.sm}px);
  left: 0;
  display: grid;
  gap: ${space.xs}px;
  width: min(300px, calc(100vw - ${space.xxl}px));
  max-height: calc(100dvh - 140px);
  padding: ${space.sm}px;
  overflow-y: auto;
  background: ${color.panel};
  box-shadow:
    0 0 0 1px ${color.line},
    0 ${space.sm}px ${space.xl}px color-mix(in srgb, ${color.bg} 60%, transparent);

  &[hidden] {
    display: none;
  }

  [data-racing] & {
    top: 50%;
    bottom: auto;
    left: calc(100% + ${space.sm}px);
    max-height: calc(100dvh - ${space.xl}px);
    transform: translateY(-50%);
  }

  @media (max-width: 899px) {
    top: 50%;
    bottom: auto;
    left: calc(100% + ${space.xs}px);
    width: min(300px, calc(100vw - 64px));
    max-height: calc(100dvh - ${space.xl}px);
    transform: translateY(-50%);
  }

  /* A phone on its side: the whole height, beside the button */
  @media (max-height: 520px) {
    position: fixed;
    top: ${space.sm}px;
    bottom: auto;
    left: calc(64px + env(safe-area-inset-left));
    width: min(380px, calc(100vw - 80px));
    max-height: calc(100dvh - ${space.lg}px);
    transform: none;
  }
`

const PanelHeading = styled.p`
  margin: 0;
  color: ${color.muted};
  ${displayType}
  font-size: 12px;
  text-transform: uppercase;
`

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: ${space.xs}px;
`

const Pick = styled.button`
  display: grid;
  place-items: center;
  min-width: 40px;
  min-height: 44px;
  padding: 0;
  background: ${color.sunken};
  border: 1px solid ${color.border};
  font-size: ${fontSize.xl}px;
  line-height: 1;
  cursor: pointer;

  &:hover {
    background: ${color.raised};
  }

  &:active {
    transform: scale(0.92);
  }
`

const Phrases = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${space.xs}px;
`

const Phrase = styled.button`
  min-height: 40px;
  padding: ${space.xs}px ${space.sm}px;
  color: ${color.text};
  background: ${color.sunken};
  border: 1px solid ${color.border};
  border-left: 3px solid ${color.accent};
  font: inherit;
  font-size: ${fontSize.sm}px;
  font-weight: 700;
  text-align: left;
  cursor: pointer;

  &:hover {
    background: ${color.raised};
  }
`

const Status = styled.p`
  margin: 0;
  color: ${color.warning};
  font-size: ${fontSize.sm}px;

  &:empty {
    display: none;
  }
`

const Check = styled.label`
  display: flex;
  align-items: center;
  gap: ${space.sm}px;
  min-height: 40px;
  font-size: ${fontSize.sm}px;
  cursor: pointer;

  input {
    width: 18px;
    height: 18px;
    accent-color: ${color.accent};
  }
`

// Over everything, catching no taps: the bubbles only show
const Layer = styled.div`
  position: fixed;
  inset: 0;
  z-index: 36;
  overflow: hidden;
  pointer-events: none;
`

const pop = keyframes`
  0% {
    opacity: 0;
    scale: 0.4;
  }

  12% {
    opacity: 1;
    scale: 1.12;
  }

  20%,
  80% {
    opacity: 1;
    scale: 1;
  }

  100% {
    opacity: 0;
    scale: 0.9;
  }
`

const fade = keyframes`
  0%,
  100% {
    opacity: 0;
  }

  10%,
  80% {
    opacity: 1;
  }
`

const Bubble = styled.div<{ $still: boolean; $racing: boolean }>`
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  justify-items: center;
  gap: 2px;
  transform-origin: 50% 100%;
  ${(p) => css`
    animation: ${p.$still ? fade : pop} ${REACTION_FLOAT_MS}ms ease-out forwards;
  `}
`

// A speech bubble with a tail towards whoever sent it. In a race: smaller and a little see-through,
// so that a bubble over a tag never hides the road
const Face = styled.span<{ $racing: boolean }>`
  position: relative;
  padding: 2px ${space.sm}px;
  font-size: ${(p) => (p.$racing ? 22 : 30)}px;
  line-height: 1.15;
  background: color-mix(in srgb, ${color.panel} ${(p) => (p.$racing ? 70 : 92)}%, transparent);
  border: 2px solid ${color.accent};
  border-radius: 16px;
  opacity: ${(p) => (p.$racing ? 0.9 : 1)};
  box-shadow: 0 2px 8px color-mix(in srgb, ${color.bg} 60%, transparent);

  &::after {
    content: '';
    position: absolute;
    bottom: -7px;
    left: 50%;
    width: 10px;
    height: 10px;
    background: ${color.panel};
    border-right: 2px solid ${color.accent};
    border-bottom: 2px solid ${color.accent};
    transform: translateX(-50%) rotate(45deg);
  }
`

// A phrase: a slanted tag in the game's hue
const Said = styled.span<{ $racing: boolean }>`
  padding: ${space.xs}px ${space.md}px;
  color: ${color.onAccent};
  background: ${color.accent};
  font-size: ${(p) => (p.$racing ? fontSize.sm : fontSize.md)}px;
  font-weight: 800;
  white-space: nowrap;
  opacity: ${(p) => (p.$racing ? 0.85 : 1)};
  clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
`

// The sender's name, only where the bubble is not by it already
const Who = styled.span`
  max-width: 140px;
  padding: 0 ${space.xs}px;
  overflow: hidden;
  color: ${color.text};
  background: ${color.panel};
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;

  [data-anchored] > & {
    display: none;
  }
`

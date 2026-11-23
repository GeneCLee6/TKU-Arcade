// 2026-11-23 (e11-t06, AC-11.3; docs/DESIGN.md §3.8): the badge that slides in at the top right when
// an achievement unlocks, as a race broadcast puts up a lower third: a cut panel, the accent's bar,
// the emblem, the name, a chime. One at a time, about five seconds each (longer while pointed at or
// focused); never during a race (track.ts's hold: they wait for the finish or the pause menu). Its
// own React root, put on the page with the first badge, so no screen has to make room for it.
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react'
import styled, { keyframes } from 'styled-components'
import type { TextKey } from '../i18n/t.ts'
import { useT } from '../i18n/useT.ts'
import { clippedFill, displayType, monoType } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'
import { BadgeEmblem } from './Badge.tsx'
import { TIER_COLORS } from './tiers.ts'
import { nextPopup, popupQueue, subscribePopups, type PopupItem } from './popups.ts'
import { RULES } from './rules.ts'
import { playUnlock } from './sound.ts'
import './strings.ts'
import { achievementsHeld, onAchievementHold } from './track.ts'

/** How long a badge stays, ms */
export const POPUP_MS = 5000

const ruleOf = (id: string) => RULES.find((rule) => rule.id === id)

/** Goes to the profile page through the site's router (it listens for popstate), without a reload */
function openProfile(event: MouseEvent<HTMLAnchorElement>) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  window.history.pushState(null, '', '/me')
  window.dispatchEvent(new PopStateEvent('popstate'))
  nextPopup()
}

export function Popups() {
  const t = useT()
  const queue = useSyncExternalStore(subscribePopups, popupQueue)
  const held = useSyncExternalStore(onAchievementHold, achievementsHeld)
  const [paused, setPaused] = useState(false)
  const item: PopupItem | undefined = held ? undefined : queue[0]

  // Its chime once, as it comes up
  useEffect(() => {
    if (!item) return
    const tier = item.kind === 'rule' ? (ruleOf(item.id)?.tier ?? 1) : 2
    playUnlock(tier)
  }, [item])

  useEffect(() => {
    if (!item || paused) return
    const timer = window.setTimeout(nextPopup, POPUP_MS)
    return () => window.clearTimeout(timer)
  }, [item, paused])

  const rule = item?.kind === 'rule' ? ruleOf(item.id) : undefined
  const tier = rule?.tier ?? 2
  return (
    // Always on the page: a screen reader announces changes only in a region it already knows
    <Region role="status" aria-live="polite" aria-label={t('ach.popup.region')}>
      {item && (
        <Card
          key={item.kind === 'rule' ? item.id : `more-${item.count}`}
          data-testid="achievement-popup"
          $tier={TIER_COLORS[tier]}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {item.kind === 'rule' && rule ? (
            <>
              <BadgeEmblem category={rule.category} tier={rule.tier} unlocked hidden={false} size={52} />
              <Text>
                <Kicker>
                  {t('ach.popup.kicker')} · {t(`ach.tier.${rule.tier}` as TextKey)}
                </Kicker>
                <Name>{t(`ach.rule.${rule.id}.name` as TextKey)}</Name>
                <Line>
                  {t(`ach.rule.${rule.id}.desc` as TextKey, rule.game ? { game: t(`games.${rule.game}.name`) } : undefined)}
                </Line>
                <Open href="/me" onClick={openProfile}>
                  {t('ach.popup.open')}
                </Open>
              </Text>
            </>
          ) : (
            <Text>
              <Kicker>{t('ach.popup.kicker')}</Kicker>
              <Name>{t('ach.popup.more', { count: item.kind === 'more' ? item.count : 0 })}</Name>
              <Line>{t('ach.popup.moreHint')}</Line>
              <Open href="/me" onClick={openProfile}>
                {t('ach.popup.open')}
              </Open>
            </Text>
          )}
          <Close type="button" aria-label={t('ach.popup.dismiss')} onClick={nextPopup}>
            ×
          </Close>
        </Card>
      )}
    </Region>
  )
}

const slideIn = keyframes`
  0% { opacity: 0; transform: translateX(40px) skewX(-8deg); }
  60% { opacity: 1; transform: translateX(-4px) skewX(0); }
  100% { opacity: 1; transform: translateX(0); }
`

const sweep = keyframes`
  0% { transform: translateX(-120%); }
  100% { transform: translateX(220%); }
`

const Region = styled.div`
  position: fixed;
  top: calc(env(safe-area-inset-top) + 64px);
  right: max(${space.lg}px, env(safe-area-inset-right));
  z-index: 60;
  display: grid;
  justify-items: end;
  width: min(360px, calc(100vw - ${space.lg * 2}px));
  pointer-events: none;
`

const cut = 'polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 14px 100%, 0 calc(100% - 14px))'

const Card = styled.div<{ $tier: string }>`
  ${({ $tier }) =>
    clippedFill(
      cut,
      `linear-gradient(${$tier}, ${$tier}) 0 0 / 44px 3px no-repeat, linear-gradient(${color.line}, ${color.line}) 0 100% / 100% 1px no-repeat, ${color.surface}`,
    )}
  display: flex;
  align-items: flex-start;
  gap: ${space.md}px;
  width: 100%;
  padding: ${space.md}px ${space.md}px ${space.md}px ${space.md}px;
  overflow: hidden;
  color: ${color.text};
  box-shadow: 0 10px 28px color-mix(in srgb, ${color.overlay} 80%, transparent);
  pointer-events: auto;
  animation: ${slideIn} 420ms cubic-bezier(0.2, 0.9, 0.2, 1) both;

  /* A glint across it as it lands */
  &::after {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 40%;
    background: linear-gradient(100deg, transparent, color-mix(in srgb, ${({ $tier }) => $tier} 30%, transparent), transparent);
    transform: translateX(-120%);
    animation: ${sweep} 900ms 260ms ease-out both;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;

    &::after {
      display: none;
    }
  }
`

const Text = styled.div`
  display: grid;
  gap: 2px;
  min-width: 0;
  flex: 1;
`

const Kicker = styled.span`
  ${monoType}
  color: ${color.muted};
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`

const Name = styled.strong`
  ${displayType}
  font-size: ${fontSize.lg}px;
  line-height: 1.2;
`

const Line = styled.span`
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

const Open = styled.a`
  justify-self: start;
  margin-top: ${space.xs}px;
  color: ${color.accent};
  font-size: ${fontSize.sm}px;
  font-weight: 700;
`

const Close = styled.button`
  flex: none;
  width: 32px;
  height: 32px;
  margin: -${space.xs}px -${space.xs}px 0 0;
  border: 0;
  background: transparent;
  color: ${color.muted};
  font-size: ${fontSize.lg}px;
  cursor: pointer;

  &:hover {
    color: ${color.text};
  }
`

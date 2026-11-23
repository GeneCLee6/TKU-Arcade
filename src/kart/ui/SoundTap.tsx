// 2026-11-23 (audio/unlock.ts): on the race screen, while the browser holds the kart's sound back (a
// race opened straight from a link, nothing touched yet), a button at the top: "Tap for sound". Any
// tap or key anywhere starts it as well; the button only says so. Gone once the sound runs.
import styled from 'styled-components'
import { monoType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { unlockKartAudio } from '../audio/bus.ts'
import { useKartSoundLocked } from '../audio/unlock.ts'

export function SoundTap({ label }: { readonly label: string }) {
  const locked = useKartSoundLocked()
  if (!locked) return null
  return (
    <Tap type="button" onClick={() => unlockKartAudio()} data-testid="kart-sound-tap">
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
        <path d="M3 8h3l4-4v12l-4-4H3Z" fill="currentColor" />
        <path d="M13 7c1.2 1.6 1.2 4.4 0 6M15.5 5c2.4 2.8 2.4 7.2 0 10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      {label}
    </Tap>
  )
}

const Tap = styled.button`
  ${monoType}
  position: absolute;
  top: max(${space.md}px, env(safe-area-inset-top));
  left: 50%;
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: ${space.xs}px;
  min-height: 44px;
  padding: 0 ${space.lg}px;
  translate: -50% 0;
  color: ${color.onAccent};
  background: ${color.accent};
  border: 0;
  font-size: ${fontSize.md}px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 0 18px color-mix(in srgb, ${color.accent} 60%, transparent);
`

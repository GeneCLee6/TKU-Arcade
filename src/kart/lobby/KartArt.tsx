// 2026-11-22: a racer drawn flat, for a waiting room without WebGL (or before its 3D has come) and
// its upright list: their kart from the front in the kart's own neon (kartTokens.ts), the driver's
// helmet and visor in their colours, a glow on the floor. Our own drawing, a few shapes of SVG.
import { memo } from 'react'
import type { DriverId, KartId } from '../../../shared/kart/karts.ts'
import { kartBodies, kartDrivers } from '../../styles/kartTokens.ts'

export interface KartArtProps {
  kart: KartId
  driver: DriverId
}

export const KartArt = memo(function KartArt({ kart, driver }: KartArtProps) {
  const body = kartBodies[kart]
  const rider = kartDrivers[driver]
  const id = `kart-art-${kart}-${driver}`
  return (
    <svg viewBox="0 0 200 160" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMax meet">
      <defs>
        <radialGradient id={`${id}-floor`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={body.glow} stopOpacity="0.55" />
          <stop offset="1" stopColor={body.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={body.second} />
          <stop offset="1" stopColor={body.main} />
        </linearGradient>
      </defs>
      <ellipse cx="100" cy="146" rx="92" ry="12" fill={`url(#${id}-floor)`} />
      {/* The driver: shoulders, helmet, visor, a crest down the middle */}
      <path d="M70 96 Q100 74 130 96 L128 108 L72 108 Z" fill={rider.suit} />
      <path d="M78 98 Q100 86 122 98 L120 104 L80 104 Z" fill={rider.panel} />
      <circle cx="100" cy="66" r="22" fill={rider.helmet} />
      <path d="M82 64 Q100 54 118 64 L116 74 Q100 80 84 74 Z" fill={rider.visor} />
      <rect x="97" y="44" width="6" height="14" rx="2" fill={rider.crest} />
      {/* The kart: wheels, then the shell in front of them, the nose and its neon line */}
      <rect x="18" y="104" width="30" height="40" rx="6" fill={body.main} />
      <rect x="152" y="104" width="30" height="40" rx="6" fill={body.main} />
      <path d="M40 104 L160 104 L172 132 L28 132 Z" fill={`url(#${id}-shell)`} />
      <path d="M64 110 L136 110 L146 132 L54 132 Z" fill={body.main} />
      <path d="M36 122 L164 122" stroke={body.accent} strokeWidth="4" strokeLinecap="round" />
      <rect x="84" y="126" width="32" height="10" rx="2" fill={body.accent} />
      <path d="M28 132 L172 132 L164 140 L36 140 Z" fill={body.second} />
    </svg>
  )
})

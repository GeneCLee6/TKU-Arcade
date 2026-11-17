// A cup's trophy (docs/ARCHITECTURE.md §4.24), drawn by code: no picture file, and a shape of our own
// rather than any game's. Every cup gets its own from its id: how wide the bowl opens, how many bands
// run round it, how many points the crest's star has; the plinth has one step for each race. The
// handles curl like the river's waves. Colours from the tokens.
import { color } from '../../styles/tokens.ts'
import { trophyShape } from './trophyShape.ts'

/** The points of a star round (cx, cy) */
function star(cx: number, cy: number, points: number, outer: number, inner: number): string {
  const corners: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    corners.push(
      `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`,
    )
  }
  return corners.join(' ')
}

export function Trophy({
  cup,
  races,
  label,
  size = 140,
}: {
  cup: string
  races: number
  label: string
  size?: number
}) {
  const { rim, bands, starPoints, steps } = trophyShape(cup, races)
  const cx = 60
  const top = 34
  const neck = 96
  const left = cx - rim
  const right = cx + rim
  // The bowl: a rim, sides that swell then draw in to the neck
  const bowl = `M ${left} ${top} L ${right} ${top} C ${right + 4} ${top + 34}, ${cx + 14} ${neck - 10}, ${cx + 6} ${neck} L ${cx - 6} ${neck} C ${cx - 14} ${neck - 10}, ${left - 4} ${top + 34}, ${left} ${top} Z`
  const bandAt = (index: number) => top + 10 + index * 9
  const stepHeight = 7
  const plinthTop = 128 - steps * stepHeight
  return (
    <svg
      width={size}
      height={(size * 160) / 120}
      viewBox="0 0 120 160"
      role="img"
      aria-label={label}
      data-testid="kart-cup-trophy"
    >
      {/* The handles: a wave curling out from each side */}
      <path
        d={`M ${right - 2} ${top + 8} c 18 -6, 24 14, 10 24 c -6 4, -12 0, -8 -6`}
        fill="none"
        stroke={color.warning}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d={`M ${left + 2} ${top + 8} c -18 -6, -24 14, -10 24 c 6 4, 12 0, 8 -6`}
        fill="none"
        stroke={color.warning}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path d={bowl} fill={color.chipFace} stroke={color.warning} strokeWidth={2} />
      {Array.from({ length: bands }, (_, index) => {
        const y = bandAt(index)
        const half = rim - 4 - index * 4
        return (
          <path
            key={index}
            d={`M ${cx - half} ${y} q ${half / 2} 4, ${half} 0 t ${half} 0`}
            fill="none"
            stroke={color.warning}
            strokeWidth={1.5}
          />
        )
      })}
      <polygon
        points={star(cx, top - 12, starPoints, 11, 5)}
        fill={color.chipFace}
        stroke={color.warning}
        strokeWidth={1.5}
      />
      {/* The stem and the plinth, a step for each race */}
      <rect x={cx - 5} y={neck} width={10} height={plinthTop - neck} fill={color.warning} />
      {Array.from({ length: steps }, (_, index) => {
        const width = 30 + (index + 1) * 8
        return (
          <rect
            key={index}
            x={cx - width / 2}
            y={plinthTop + index * stepHeight}
            width={width}
            height={stepHeight}
            rx={1.5}
            fill={index % 2 === 0 ? color.brand : color.magenta}
          />
        )
      })}
    </svg>
  )
}

import styled, { css, keyframes } from 'styled-components'
import type { WasabiDisc } from '../../../shared/games/wasabi/types.ts'
import { dumpling } from './palette.ts'

/**
 * One dumpling, side on, drawn here (no artwork). `disc` null is one you may not see: it sits under
 * a little bamboo cover. `open` is one eaten, face up for all, with a bite out of it, which flips in
 * when it turns. A closed one of your own has a dashed edge (still hidden from the others) and shows
 * its filling as a small mark, so that you remember where your wasabi is. An empty `label` hides it
 * from screen readers, for a button that names it itself.
 */
export function Dumpling({ disc, open, label }: { disc: WasabiDisc | null; open: boolean; label: string }) {
  const wasabi = disc === 'wasabi'
  const hidden = disc === null
  const body = hidden ? dumpling.steamerDeep : open && wasabi ? dumpling.wasabi : dumpling.dough
  const shade = hidden ? dumpling.steamer : open && wasabi ? dumpling.wasabiDeep : dumpling.doughShade
  return (
    <Shape
      key={open ? 'open' : 'closed'}
      $open={open}
      viewBox="0 0 40 24"
      role={label === '' ? undefined : 'img'}
      aria-label={label === '' ? undefined : label}
      aria-hidden={label === '' ? true : undefined}
      data-disc={open ? disc : (disc ?? 'hidden')}
    >
      {hidden ? (
        <>
          <path d="M3 21 Q20 -3 37 21 Z" fill={body} stroke={shade} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M9 15 Q20 3 31 15 M20 2 v3" fill="none" stroke={shade} strokeWidth="1.3" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path
            d="M3 20 Q20 -4 37 20 Z"
            fill={body}
            stroke={shade}
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeDasharray={open ? undefined : '3 2'}
          />
          <path
            d="M12 10 l2 4 M18 6 l1 5 M24 6 l-1 5 M30 10 l-2 4"
            fill="none"
            stroke={shade}
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          {open && <circle cx="33" cy="12" r="5" fill={dumpling.steamer} stroke={shade} strokeWidth="1.2" />}
          {!open && wasabi && <circle cx="20" cy="16" r="3" fill={dumpling.wasabi} stroke={dumpling.wasabiDeep} />}
        </>
      )}
    </Shape>
  )
}

const flip = keyframes`
  from { transform: rotateX(90deg); }
  to { transform: rotateX(0); }
`

const Shape = styled.svg<{ $open: boolean }>`
  display: block;
  width: 100%;
  height: auto;
  ${({ $open }) =>
    $open &&
    css`
      animation: ${flip} 0.45s ease-out;
    `}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`

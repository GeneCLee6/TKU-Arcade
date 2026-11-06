import qrcode from 'qrcode-generator'
import { useMemo } from 'react'
import styled from 'styled-components'
import { color, radius } from '../styles/tokens.ts'

// Light modules around the code, as the QR standard asks
const QUIET = 4

// The dark modules as one path: a 1×1 square for each
function qrPath(text: string): { size: number; d: string } {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const size = qr.getModuleCount()
  let d = ''
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
    }
  }
  return { size, d }
}

// Drawn in the page, so sharing a room link asks no other site to encode it
export function QrCode({ text, label }: { text: string; label: string }) {
  const { size, d } = useMemo(() => qrPath(text), [text])
  const full = size + QUIET * 2
  return (
    <Svg
      role="img"
      aria-label={label}
      viewBox={`${-QUIET} ${-QUIET} ${full} ${full}`}
      shapeRendering="crispEdges"
    >
      <rect x={-QUIET} y={-QUIET} width={full} height={full} fill={color.qrLight} />
      <path d={d} fill={color.qrDark} />
    </Svg>
  )
}

const Svg = styled.svg`
  display: block;
  width: 100%;
  max-width: 200px;
  height: auto;
  border-radius: ${radius.component}px;
`

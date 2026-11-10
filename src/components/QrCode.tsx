import { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { color, radius } from '../styles/tokens.ts'

// Light modules around the code, as the QR standard asks
const QUIET = 4

type Encoder = typeof import('qrcode-generator')

// The encoder is fetched when a code is first drawn, not with the room page: only the waiting room
// shows one, and a game's first screen should not carry it (the first-screen budget, e12)
let encoder: Encoder | null = null
const loadEncoder = (): Promise<Encoder> =>
  import('qrcode-generator').then((loaded) => (encoder = loaded.default))

// The dark modules as one path: a 1×1 square for each
function qrPath(qrcode: Encoder, text: string): { size: number; d: string } {
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

// Drawn in the page, so sharing a room link asks no other site to encode it. Until the encoder is
// here it is the light square alone, the same size, so nothing moves when the code appears
export function QrCode({ text, label }: { text: string; label: string }) {
  const [qrcode, setQrcode] = useState<Encoder | null>(() => encoder)
  useEffect(() => {
    if (qrcode) return undefined
    let live = true
    void loadEncoder().then((loaded) => live && setQrcode(() => loaded))
    return () => {
      live = false
    }
  }, [qrcode])
  const drawn = useMemo(() => (qrcode ? qrPath(qrcode, text) : null), [qrcode, text])
  const full = (drawn?.size ?? 21) + QUIET * 2
  return (
    <Svg
      role="img"
      aria-label={label}
      viewBox={`${-QUIET} ${-QUIET} ${full} ${full}`}
      shapeRendering="crispEdges"
    >
      <rect x={-QUIET} y={-QUIET} width={full} height={full} fill={color.qrLight} />
      {drawn && <path d={drawn.d} fill={color.qrDark} />}
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

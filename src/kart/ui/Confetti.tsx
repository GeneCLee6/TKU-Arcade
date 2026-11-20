// 2026-11-20 (the race's show, docs/ARCHITECTURE.md §4.43): confetti and bursts of sparks over the
// finish, drawn by the program on a canvas of its own (no images). The colours are the festival's
// (kartTokens.ts: a canvas cannot read CSS variables). Nothing at all under prefers-reduced-motion.
import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { CONFETTI_MS, confettiPieces, GRAVITY } from './confettiPieces.ts'

export function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const element = canvas.current
    if (!element) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const context = element.getContext('2d')
    if (!context) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    const width = element.clientWidth
    const height = element.clientHeight
    element.width = Math.round(width * ratio)
    element.height = Math.round(height * ratio)
    context.scale(ratio, ratio)
    const pieces = confettiPieces(width, height)
    const started = performance.now()
    let handle = 0
    const draw = (now: number) => {
      const elapsed = now - started
      context.clearRect(0, 0, width, height)
      if (elapsed > CONFETTI_MS) return
      // Everything fades over the last 0.6 s
      const fade = Math.min(1, (CONFETTI_MS - elapsed) / 600)
      for (const piece of pieces) {
        const t = (elapsed - piece.at) / 1000
        if (t < 0) continue
        if (piece.spark) {
          const life = 1 - t / 1.1
          if (life <= 0) continue
          const drag = Math.exp(-2.2 * t)
          const x = piece.x + (piece.vx * (1 - drag)) / 2.2
          const y = piece.y + (piece.vy * (1 - drag)) / 2.2 + 0.5 * 260 * t * t
          context.globalAlpha = life * fade
          context.fillStyle = piece.fill
          context.beginPath()
          context.arc(x, y, piece.size * life, 0, Math.PI * 2)
          context.fill()
          continue
        }
        const x = piece.x + piece.vx * t + Math.sin(t * 3 + piece.spin) * 18
        const y = piece.y + piece.vy * t + 0.5 * GRAVITY * 0.15 * t * t
        if (y > height + 20) continue
        context.globalAlpha = fade
        context.fillStyle = piece.fill
        context.save()
        context.translate(x, y)
        context.rotate(piece.spin + piece.turn * t)
        // A strip of paper turning over: its width swings with the turn
        context.fillRect(
          -piece.size / 2,
          -piece.size / 4,
          piece.size * Math.abs(Math.cos(t * 6 + piece.spin)),
          piece.size / 2,
        )
        context.restore()
      }
      context.globalAlpha = 1
      handle = requestAnimationFrame(draw)
    }
    handle = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(handle)
  }, [])
  return <Layer ref={canvas} aria-hidden="true" data-testid="kart-confetti" />
}

const Layer = styled.canvas`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;

  @media (prefers-reduced-motion: reduce) {
    display: none;
  }
`

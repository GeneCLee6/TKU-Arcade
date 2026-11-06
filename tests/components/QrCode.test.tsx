import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QrCode } from '../../src/components/QrCode.tsx'
import { color } from '../../src/styles/tokens.ts'

describe('QrCode', () => {
  it('is an image with its label and draws dark modules on a light ground', () => {
    render(<QrCode text="https://example.com/r/abcdefghij" label="Room link" />)
    const image = screen.getByRole('img', { name: 'Room link' })
    expect(image.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/)
    expect(image.querySelector('path')).toHaveAttribute('fill', color.qrDark)
    expect(image.querySelector('rect')).toHaveAttribute('fill', color.qrLight)
  })

  it('draws a different code for different text', () => {
    const { container, rerender } = render(<QrCode text="one" label="Code" />)
    const first = container.querySelector('path')?.getAttribute('d')
    rerender(<QrCode text="two" label="Code" />)
    expect(container.querySelector('path')?.getAttribute('d')).not.toBe(first)
  })
})

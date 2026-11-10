import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { QrCode } from '../../src/components/QrCode.tsx'
import { color } from '../../src/styles/tokens.ts'

describe('QrCode', () => {
  it('is an image with its label and draws dark modules on a light ground', async () => {
    render(<QrCode text="https://example.com/r/abcdefghij" label="Room link" />)
    const image = screen.getByRole('img', { name: 'Room link' })
    // The light square is there at once; the code once its encoder has loaded
    expect(image.querySelector('rect')).toHaveAttribute('fill', color.qrLight)
    await waitFor(() => expect(image.querySelector('path')).not.toBeNull())
    expect(image.querySelector('path')?.getAttribute('d')).toMatch(/^M\d+ \d+h1v1h-1z/)
    expect(image.querySelector('path')).toHaveAttribute('fill', color.qrDark)
  })

  it('draws a different code for different text', async () => {
    const { container, rerender } = render(<QrCode text="one" label="Code" />)
    await waitFor(() => expect(container.querySelector('path')).not.toBeNull())
    const first = container.querySelector('path')?.getAttribute('d')
    rerender(<QrCode text="two" label="Code" />)
    expect(container.querySelector('path')?.getAttribute('d')).not.toBe(first)
  })
})

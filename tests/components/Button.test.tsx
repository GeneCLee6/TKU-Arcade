import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../../src/components/Button.tsx'
import { Card } from '../../src/components/Card.tsx'
import { color } from '../../src/styles/tokens.ts'

// jsdom cannot compute var() in shorthands, so read the rule styled-components wrote for the element
function ownCss(element: Element): string {
  const css = [...document.querySelectorAll('style')].map((style) => style.textContent).join('')
  return [...element.classList]
    .map((name) => css.match(new RegExp(`\\.${name}\\s*\\{[^}]*\\}`))?.[0] ?? '')
    .join('')
}

describe('Button', () => {
  it('defaults to type="button", and keeps an explicit type', () => {
    render(
      <>
        <Button>Default</Button>
        <Button type="submit">Send</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Default' })).toHaveAttribute('type', 'button')
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit')
  })

  it('does not leak style props to the DOM', () => {
    render(
      <Button $variant="danger" $size="sm">
        Remove
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Remove' })
    expect(button.getAttributeNames().filter((name) => name.includes('variant'))).toEqual([])
    expect(button.getAttributeNames().filter((name) => name.includes('size'))).toEqual([])
  })

  it('styles differ by variant and use tokens', () => {
    render(
      <>
        <Button>Primary</Button>
        <Button $variant="danger">Danger</Button>
      </>,
    )
    expect(ownCss(screen.getByRole('button', { name: 'Primary' }))).toContain(
      `background:${color.accent}`,
    )
    expect(ownCss(screen.getByRole('button', { name: 'Danger' }))).toContain(
      `color:${color.danger}`,
    )
  })

  it('does not fire onClick when disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Off
      </Button>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Off' }))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('Card', () => {
  it('renders its children on the surface colour, and accepts another element', () => {
    render(
      <Card as="section" aria-label="Panel">
        Content
      </Card>,
    )
    const card = screen.getByRole('region', { name: 'Panel' })
    expect(card).toHaveTextContent('Content')
    expect(card.tagName).toBe('SECTION')
    expect(ownCss(card)).toContain(`background:${color.surface}`)
  })
})

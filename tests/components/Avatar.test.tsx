import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from '../../src/components/Avatar.tsx'
import { avatarColor, initialOf } from '../../src/lib/avatar.ts'
import { avatarColors } from '../../src/styles/tokens.ts'

describe('initialOf', () => {
  it('takes the first character as a person reads it', () => {
    expect(initialOf('Bo')).toBe('B')
    expect(initialOf('小明')).toBe('小')
    expect(initialOf('  Cy')).toBe('C')
    expect(initialOf('👨‍👩‍👧 family')).toBe('👨‍👩‍👧')
    expect(initialOf('')).toBe('')
  })
})

describe('avatarColor', () => {
  it('gives a name the same token colour every time', () => {
    expect(avatarColor('Bo')).toBe(avatarColor('Bo'))
    expect(avatarColors).toContain(avatarColor('小明'))
  })

  it('tells names apart', () => {
    const names = ['Al', 'Bo', 'Cy', 'Di', 'Ed', 'Fay', '小明', '阿美']
    expect(new Set(names.map(avatarColor)).size).toBeGreaterThan(1)
  })
})

describe('Avatar', () => {
  it('shows the initial, hidden from screen readers as the name is beside it', () => {
    render(<Avatar name="Bo" />)
    const mark = screen.getByText('B')
    expect(mark).toHaveAttribute('aria-hidden', 'true')
  })

  it("takes the colour it is given over the name's", () => {
    render(<Avatar name="Bo" tint="var(--color-seat3)" />)
    expect(screen.getByText('B').style.background).toContain('--color-seat3')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { Tabs } from '../../src/components/Tabs.tsx'

type Id = 'a' | 'b' | 'c'

function Harness() {
  const [value, setValue] = useState<Id>('a')
  return (
    <Tabs<Id>
      label="Things"
      value={value}
      onChange={setValue}
      tabs={[
        { id: 'a', label: 'One', content: <p>first</p> },
        { id: 'b', label: 'Two', content: <p>second</p> },
        { id: 'c', label: 'Three', content: <p>third</p> },
      ]}
    />
  )
}

const tab = (name: string) => screen.getByRole('tab', { name })

describe('Tabs', () => {
  it('shows the selected tab only, tied to its panel', () => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Things' })).toBeInTheDocument()
    expect(tab('One')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'One' })).toHaveTextContent('first')
    expect(screen.queryByText('second')).toBeNull()
  })

  it('switches on a click', () => {
    render(<Harness />)
    fireEvent.click(tab('Two'))
    expect(tab('Two')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('second')).toBeInTheDocument()
  })

  it('is one Tab stop', () => {
    render(<Harness />)
    expect(tab('One')).toHaveAttribute('tabindex', '0')
    expect(tab('Two')).toHaveAttribute('tabindex', '-1')
  })

  it('moves with the arrows, wrapping, and Home and End; focus goes along', () => {
    render(<Harness />)
    tab('One').focus()
    fireEvent.keyDown(tab('One'), { key: 'ArrowLeft' })
    expect(tab('Three')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Three')).toHaveFocus()

    fireEvent.keyDown(tab('Three'), { key: 'ArrowRight' })
    expect(tab('One')).toHaveFocus()

    fireEvent.keyDown(tab('One'), { key: 'End' })
    expect(tab('Three')).toHaveFocus()

    fireEvent.keyDown(tab('Three'), { key: 'Home' })
    expect(tab('One')).toHaveFocus()
  })

  it('leaves other keys alone', () => {
    render(<Harness />)
    fireEvent.keyDown(tab('One'), { key: 'a' })
    expect(tab('One')).toHaveAttribute('aria-selected', 'true')
  })
})

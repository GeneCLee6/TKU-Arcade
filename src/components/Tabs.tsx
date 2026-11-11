import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import styled from 'styled-components'
import { clippedFill, displayType, slantClip } from '../styles/esports.ts'
import { color, fontSize, space } from '../styles/tokens.ts'

export interface TabItem<Id extends string> {
  id: Id
  label: ReactNode
  content: ReactNode
}

export interface TabsProps<Id extends string> {
  /** For screen readers: what these tabs switch between */
  label: string
  tabs: readonly TabItem<Id>[]
  value: Id
  onChange(id: Id): void
}

/** The WAI-ARIA tabs pattern: one Tab stop, arrows and Home and End move along the tabs */
export function Tabs<Id extends string>({ label, tabs, value, onChange }: TabsProps<Id>) {
  const base = useId()
  const buttons = useRef(new Map<Id, HTMLButtonElement>())
  const active = tabs.find((tab) => tab.id === value) ?? tabs[0]

  const onKeyDown = (event: KeyboardEvent) => {
    const at = tabs.indexOf(active)
    const next: Partial<Record<string, number>> = {
      ArrowRight: (at + 1) % tabs.length,
      ArrowLeft: (at - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    }
    const target = next[event.key]
    if (target === undefined) return
    event.preventDefault()
    onChange(tabs[target].id)
    buttons.current.get(tabs[target].id)?.focus()
  }

  return (
    <div>
      <List role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const selected = tab === active
          return (
            <Tab
              key={tab.id}
              ref={(button) => {
                if (button) buttons.current.set(tab.id, button)
                else buttons.current.delete(tab.id)
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              $selected={selected}
              onClick={() => onChange(tab.id)}
            >
              {tab.label}
            </Tab>
          )
        })}
      </List>
      <Panel
        role="tabpanel"
        id={`${base}-panel-${active.id}`}
        aria-labelledby={`${base}-tab-${active.id}`}
      >
        {active.content}
      </Panel>
    </div>
  )
}

const List = styled.div`
  display: flex;
  gap: ${space.xs}px;
`

// Slanted. The selected tab is told by its underline and its weight, not only a colour
const Tab = styled.button<{ $selected: boolean }>`
  ${clippedFill(slantClip(10), color.raised)}
  flex: 1;
  min-height: 44px;
  padding: 0 ${space.md}px;
  background: transparent;
  color: ${(p) => (p.$selected ? color.text : color.muted)};
  border: none;
  ${displayType}
  font-size: ${fontSize.md}px;
  font-weight: ${(p) => (p.$selected ? 900 : 700)};
  cursor: pointer;

  &::before {
    ${(p) =>
      p.$selected &&
      `background: linear-gradient(180deg, color-mix(in srgb, ${color.accent} 24%, transparent), transparent);
      box-shadow: inset 0 -3px 0 ${color.accent};`}
  }
`

const Panel = styled.div`
  padding-top: ${space.lg}px;
`

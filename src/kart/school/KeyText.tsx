// 2026-11-20 (docs/ARCHITECTURE.md §4.50): a line of help with the player's own controls in it,
// drawn as key caps (controls.ts says which). A message names a control as {throttle}, {drift} and
// so on.
import type { ReactNode } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import type { MessageParams } from '../../i18n/t.ts'
import { monoType } from '../../styles/esports.ts'
import { color, radius, space } from '../../styles/tokens.ts'
import { NAMED_CONTROLS, type Named } from './controls.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

const MARK = '\u0001'

/** The message with each control it names as a key cap */
export function KeyText({
  t,
  id,
  params = {},
  labels,
}: {
  t: KartT
  id: KartMessageKey
  params?: MessageParams
  labels: Readonly<Record<Named, string>>
}): ReactNode {
  const marks = Object.fromEntries(NAMED_CONTROLS.map((name) => [name, `${MARK}${name}${MARK}`]))
  const parts = t(id, { ...marks, ...params }).split(MARK)
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <Cap key={index} data-testid="kart-school-key">
        {labels[part as Named] ?? part}
      </Cap>
    ) : (
      part
    ),
  )
}

const Cap = styled.kbd`
  ${monoType}
  display: inline-block;
  min-width: 1.6em;
  margin: 0 2px;
  padding: 0 ${space.xs}px;
  border: 1px solid ${color.border};
  border-bottom-width: 3px;
  border-radius: ${radius.component}px;
  background: ${color.sunken};
  color: ${color.text};
  font-size: 0.9em;
  font-weight: 700;
  line-height: 1.5;
  text-align: center;
  white-space: nowrap;
`

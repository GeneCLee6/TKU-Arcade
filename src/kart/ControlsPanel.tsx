import { memo, useEffect, useId, useRef, useState } from 'react'
import styled from 'styled-components'
import type { KartMessageKey } from '../../shared/kart/i18n.ts'
import {
  activeControls,
  bindKey,
  bindPad,
  DEFAULT_BINDINGS,
  KART_ACTIONS,
  newPress,
  RESERVED_KEYS,
  samePad,
  SLOTS,
  type Bindings,
  type Device,
  type KartAction,
  type Moved,
  type PadBinding,
  type Rebound,
} from '../../shared/kart/input.ts'
import type { KartRules } from '../../shared/kart/physics.ts'
import { Button } from '../components/Button.tsx'
import type { MessageParams } from '../i18n/t.ts'
import { color, fontSize, radius, space } from '../styles/tokens.ts'
import { keyLabel, padLabel, readGamepad } from './devices.ts'

type KartT = (key: KartMessageKey, params?: MessageParams) => string

interface Capture {
  readonly device: Device
  readonly action: KartAction
  readonly slot: number
}

interface ControlsPanelProps {
  readonly t: KartT
  readonly bindings: Bindings
  readonly rules: KartRules
  /** Returns false when the browser would not store it */
  readonly onBindings: (bindings: Bindings) => boolean
  readonly onRules: (rules: KartRules) => boolean
  readonly onClose: () => void
}

/** e8-t12: every action, two keys and two gamepad controls each, all changeable */
export const ControlsPanel = memo(function ControlsPanel({
  t,
  bindings,
  rules,
  onBindings,
  onRules,
  onClose,
}: ControlsPanelProps) {
  const titleId = useId()
  const title = useRef<HTMLHeadingElement>(null)
  const [capture, setCapture] = useState<Capture>()
  const [status, setStatus] = useState('')

  useEffect(() => title.current?.focus(), [])

  const actionName = (action: KartAction) => t(`kart.action.${action}`)
  const deviceName = (device: Device) =>
    t(device === 'keys' ? 'kart.controls.keyboard' : 'kart.controls.gamepad')
  const bindingName = (device: Device, action: KartAction, slot: number, from = bindings) => {
    const value = from[device][action][slot]
    if (value === null || value === undefined) return t('kart.controls.none')
    return device === 'keys' ? keyLabel(value as string, t) : padLabel(value as PadBinding, t)
  }
  const placeName = ({ action, slot }: Moved, device: Device) =>
    `${actionName(action)}, ${deviceName(device)} ${slot + 1}`

  const apply = (target: Capture, rebound: Rebound) => {
    const saved = onBindings(rebound.bindings)
    const binding = bindingName(target.device, target.action, target.slot, rebound.bindings)
    const isEmpty = rebound.bindings[target.device][target.action][target.slot] === null
    let message = isEmpty
      ? t('kart.controls.cleared', { action: actionName(target.action) })
      : rebound.movedFrom
        ? t('kart.controls.moved', {
            action: actionName(target.action),
            binding,
            from: placeName(rebound.movedFrom, target.device),
          })
        : t('kart.controls.bound', { action: actionName(target.action), binding })
    if (!saved) message = `${message} ${t('kart.controls.notSaved')}`
    setStatus(message)
    setCapture(undefined)
  }

  // While waiting for a key, the panel has the keyboard to itself: nothing drives, F does nothing
  useEffect(() => {
    if (!capture) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Tab') {
        setCapture(undefined)
        setStatus(t('kart.controls.cancelled'))
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat) return
      if (event.code === 'Escape') {
        setCapture(undefined)
        setStatus(t('kart.controls.cancelled'))
      } else if (event.code === 'Backspace' || event.code === 'Delete') {
        const { action, slot } = capture
        apply(
          capture,
          capture.device === 'keys'
            ? bindKey(bindings, action, slot, null)
            : bindPad(bindings, action, slot, null),
        )
      } else if (capture.device === 'pad') {
        // Keys do not bind gamepad places
      } else if (RESERVED_KEYS.has(event.code)) {
        setStatus(t('kart.controls.reserved', { key: keyLabel(event.code, t) }))
      } else {
        apply(capture, bindKey(bindings, capture.action, capture.slot, event.code))
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  })

  // The Gamepad API has no events for buttons: watch it every frame while waiting for one
  useEffect(() => {
    if (capture?.device !== 'pad') return
    let held = activeControls(readGamepad()?.snapshot ?? { buttons: [], axes: [] })
    let handle = requestAnimationFrame(function watch() {
      handle = requestAnimationFrame(watch)
      const reading = readGamepad()
      if (!reading) return
      const pressed = newPress(held, reading.snapshot)
      if (pressed) {
        apply(capture, bindPad(bindings, capture.action, capture.slot, pressed))
        return
      }
      // A control held when the wait began counts once it has been let go and pressed again
      const now = activeControls(reading.snapshot)
      held = held.filter((old) => now.some((control) => samePad(control, old)))
    })
    return () => cancelAnimationFrame(handle)
    // Restarting on every render would forget what was held when the wait began
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture, bindings])

  // Escape closes the panel when it is not waiting for a key
  useEffect(() => {
    if (capture) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [capture, onClose])

  const start = (target: Capture) => {
    setCapture(target)
    const action = actionName(target.action)
    if (target.device === 'keys') setStatus(t('kart.controls.waitingKey', { action }))
    else {
      setStatus(
        readGamepad()
          ? t('kart.controls.waitingPad', { action })
          : `${t('kart.controls.waitingPad', { action })} ${t('kart.controls.noPad')}`,
      )
    }
  }

  const reset = () => {
    const saved = onBindings(DEFAULT_BINDINGS)
    setCapture(undefined)
    setStatus(
      saved
        ? t('kart.controls.wasReset')
        : `${t('kart.controls.wasReset')} ${t('kart.controls.notSaved')}`,
    )
  }

  const setRule = (rule: keyof KartRules, value: boolean) => {
    if (!onRules({ ...rules, [rule]: value })) setStatus(t('kart.controls.notSaved'))
  }

  const slotButton = (device: Device, action: KartAction, slot: number) => {
    const waiting = capture?.device === device && capture.action === action && capture.slot === slot
    const shown = waiting
      ? t(device === 'keys' ? 'kart.controls.pressKey' : 'kart.controls.pressPad')
      : bindingName(device, action, slot)
    return (
      <SlotButton
        key={`${device}${slot}`}
        type="button"
        $variant={waiting ? 'primary' : 'secondary'}
        $size="sm"
        data-testid={`bind-${device}-${action}-${slot}`}
        aria-label={t('kart.controls.slot', {
          action: actionName(action),
          device: deviceName(device),
          slot: slot + 1,
          binding: shown,
        })}
        onClick={() => (waiting ? setCapture(undefined) : start({ device, action, slot }))}
      >
        {shown}
      </SlotButton>
    )
  }

  const slots = Array.from({ length: SLOTS }, (_, slot) => slot)

  return (
    <Panel aria-labelledby={titleId} data-testid="kart-controls">
      <Header>
        <Title id={titleId} ref={title} tabIndex={-1}>
          {t('kart.controls.title')}
        </Title>
        <Button type="button" $variant="secondary" $size="sm" onClick={onClose}>
          {t('kart.controls.close')}
        </Button>
      </Header>
      <Intro>{t('kart.controls.intro')}</Intro>
      <Table>
        <thead>
          <tr>
            <th scope="col">{t('kart.controls.action')}</th>
            <th scope="col">{t('kart.controls.keyboard')}</th>
            <th scope="col">{t('kart.controls.gamepad')}</th>
          </tr>
        </thead>
        <tbody>
          {KART_ACTIONS.map((action) => (
            <tr key={action}>
              <th scope="row">{actionName(action)}</th>
              <td>
                <Slots>{slots.map((slot) => slotButton('keys', action, slot))}</Slots>
              </td>
              <td>
                <Slots>{slots.map((slot) => slotButton('pad', action, slot))}</Slots>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Status role="status" data-testid="kart-controls-status">
        {status}
      </Status>
      <Button type="button" $variant="secondary" $size="sm" onClick={reset}>
        {t('kart.controls.reset')}
      </Button>
      <Rules>
        <legend>{t('kart.controls.rules')}</legend>
        <label>
          <input
            type="checkbox"
            checked={rules.autoBoost}
            onChange={(event) => setRule('autoBoost', event.target.checked)}
          />
          {t('kart.controls.autoBoost')}
        </label>
        <label>
          <input
            type="checkbox"
            checked={rules.chainBoosts}
            onChange={(event) => setRule('chainBoosts', event.target.checked)}
          />
          {t('kart.controls.chainBoosts')}
        </label>
      </Rules>
    </Panel>
  )
})

const Panel = styled.section`
  position: absolute;
  top: 56px;
  right: ${space.sm}px;
  width: min(560px, calc(100% - ${2 * space.sm}px));
  max-height: calc(100% - 64px);
  overflow-y: auto;
  display: grid;
  gap: ${space.md}px;
  justify-items: start;
  padding: ${space.md}px;
  border: 1px solid ${color.border};
  border-radius: ${radius.card}px;
  background: ${color.surface};
  color: ${color.text};
  font-size: ${fontSize.sm}px;
`

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${space.sm}px;
  width: 100%;
`

const Title = styled.h2`
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Intro = styled.p`
  margin: 0;
  color: ${color.muted};
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;

  th,
  td {
    padding: ${space.xs}px;
    text-align: start;
    vertical-align: middle;
  }

  thead th {
    color: ${color.muted};
    font-weight: normal;
  }

  tbody tr + tr {
    border-top: 1px solid ${color.border};
  }
`

const Slots = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.xs}px;
`

const SlotButton = styled(Button)`
  min-width: 64px;
  max-width: 100%;
  overflow-wrap: anywhere;
`

const Status = styled.p`
  margin: 0;
  min-height: 1.5em;
`

const Rules = styled.fieldset`
  display: grid;
  gap: ${space.xs}px;
  margin: 0;
  padding: ${space.sm}px ${space.md}px;
  border: 1px solid ${color.border};
  border-radius: ${radius.component}px;

  label {
    display: flex;
    align-items: center;
    gap: ${space.sm}px;
  }
`

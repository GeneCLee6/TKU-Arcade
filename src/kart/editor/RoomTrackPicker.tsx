// e10-t08: the race room's custom track option (shared/games/kart/info.ts, `custom`). The host
// pastes a track's link from the editor, or picks one of this browser's saved tracks; everyone else
// sees which track it is and can try it alone. Checked here as the room will check it (custom.ts),
// so that a host hears at once what is wrong; the room checks again whatever it is sent.
import { useId, useState } from 'react'
import styled from 'styled-components'
import { decodeSpec } from '../../../shared/kart/editor/codec.ts'
import { customTrack } from '../../../shared/kart/editor/custom.ts'
import { Button } from '../../components/Button.tsx'
import { FieldError, FieldRow, SelectInput, TextInput } from '../../components/Field.tsx'
import type { OptionControlProps } from '../../components/optionControls.ts'
import { useT } from '../../i18n/useT.ts'
import { Link } from '../../lib/router.tsx'
import { color, fontSize, space } from '../../styles/tokens.ts'
import { codeFromText } from './link.ts'
import { loadSaves } from './saves.ts'

type Trouble = 'bad' | 'illegal' | null

export default function RoomTrackPicker({ value, editable, onPick }: OptionControlProps) {
  const t = useT()
  const pasteId = useId()
  const mineId = useId()
  const errorId = useId()
  const [text, setText] = useState('')
  const [trouble, setTrouble] = useState<Trouble>(null)
  const [saves] = useState(loadSaves)
  const result = value ? customTrack(value) : null

  const summary = !result
    ? t('games.kart.custom.none')
    : result.ok
      ? t('games.kart.custom.summary', {
          name: result.spec.name || t('games.kart.custom.untitled'),
          length: Math.round(result.length),
        })
      : t(result.reason === 'code' ? 'games.kart.custom.bad' : 'games.kart.custom.illegal')

  /** Checks a code before the host sends it: the room would only drop a bad one */
  const pick = (code: string | null) => {
    if (code === null) return setTrouble('bad')
    const checked = customTrack(code)
    if (!checked.ok) return setTrouble(checked.reason === 'code' ? 'bad' : 'illegal')
    setTrouble(null)
    setText('')
    onPick(code)
  }

  if (!editable) {
    return (
      <Summary data-testid="kart-custom-summary">
        {summary}
        {result?.ok && (
          <>
            {' · '}
            <Link to={`/kart?custom=${value}`}>{t('games.kart.custom.tryAlone')}</Link>
          </>
        )}
      </Summary>
    )
  }

  return (
    <Fields>
      <Summary data-testid="kart-custom-summary">{summary}</Summary>
      <div>
        <Label htmlFor={pasteId}>{t('games.kart.custom.paste')}</Label>
        <FieldRow>
          <TextInput
            id={pasteId}
            value={text}
            aria-invalid={trouble !== null}
            aria-describedby={trouble ? errorId : undefined}
            onChange={(event) => {
              setText(event.target.value)
              setTrouble(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') pick(codeFromText(text))
            }}
            data-testid="kart-custom-paste"
          />
          <Button
            type="button"
            $variant="secondary"
            onClick={() => pick(codeFromText(text))}
            data-testid="kart-custom-use"
          >
            {t('games.kart.custom.use')}
          </Button>
        </FieldRow>
        {trouble && (
          <FieldError id={errorId} role="alert">
            {t(trouble === 'bad' ? 'games.kart.custom.bad' : 'games.kart.custom.illegal')}
          </FieldError>
        )}
      </div>
      {saves.length > 0 && (
        <div>
          <Label htmlFor={mineId}>{t('games.kart.custom.mine')}</Label>
          <SelectInput
            id={mineId}
            value=""
            onChange={(event) => pick(event.target.value || null)}
            data-testid="kart-custom-mine"
          >
            <option value="">{t('games.kart.custom.pick')}</option>
            {saves.map((save) => (
              <option key={save.id} value={save.code}>
                {decodeSpec(save.code)?.name || t('games.kart.custom.untitled')}
              </option>
            ))}
          </SelectInput>
        </div>
      )}
      <Summary>
        <Link to="/kart/editor">{t('games.kart.custom.editor')}</Link>
      </Summary>
    </Fields>
  )
}

const Fields = styled.div`
  display: grid;
  gap: ${space.sm}px;
`

const Label = styled.label`
  display: block;
  margin-bottom: ${space.xs}px;
  font-size: ${fontSize.sm}px;
  font-weight: 600;
`

const Summary = styled.p`
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.sm}px;
  overflow-wrap: anywhere;
`

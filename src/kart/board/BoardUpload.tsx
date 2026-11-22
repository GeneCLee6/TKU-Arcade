// The results' "upload to the leaderboard" card (2026-11-23, docs/ARCHITECTURE.md §4.80): asks for
// the nickname (the site's own, src/lib/nickname.ts, filled in when there is one), offers to send new
// bests by themselves from then on, and says where the run now ranks. Its own lazy chunk: a time trial
// loads it only once a run on a board track has finished.
import { useEffect, useId, useRef, useState } from 'react'
import styled from 'styled-components'
import { boardTime } from '../../../shared/kart/board.ts'
import { KART_BOARD_MESSAGES } from '../../../shared/kart/i18n.board.ts'
import type { KartMessageKey } from '../../../shared/kart/i18n.ts'
import { nameIssue } from '../../../shared/nickname.ts'
import { normalizeName } from '../../../shared/protocol.ts'
import { Button } from '../../components/Button.tsx'
import { registerMessages, type MessageParams } from '../../i18n/t.ts'
import { useT } from '../../i18n/useT.ts'
import { readNickname, writeNickname } from '../../lib/nickname.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'
import type { BoardRunDone } from '../spikeLoop.ts'
import { digits, ticker } from '../ui/broadcast.ts'
import { loadAutoUpload, saveAutoUpload, uploadRun, type UploadResult } from './api.ts'

registerMessages(KART_BOARD_MESSAGES)

type T = (key: KartMessageKey, params?: MessageParams) => string

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'sending' }
  | { readonly kind: 'done'; readonly result: UploadResult }

/** The runs already sent from this page: a run is sent once, whatever re-renders */
const sent = new WeakSet<object>()

export default function BoardUpload({
  run,
  onBoard,
}: {
  run: BoardRunDone
  /** Opens the leaderboard on this run's track */
  onBoard?: (track: string) => void
}) {
  const t: T = useT()
  const fieldId = useId()
  const [nick, setNick] = useState(() => readNickname() ?? '')
  const [auto, setAuto] = useState(loadAutoUpload)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const issue = nick.trim() === '' ? 'empty' : nameIssue(nick)
  const running = useRef(false)

  const send = async (name: string) => {
    if (running.current) return
    running.current = true
    sent.add(run.replay)
    setStatus({ kind: 'sending' })
    const result = await uploadRun(run, name)
    running.current = false
    setStatus({ kind: 'done', result })
  }

  // A new best goes up by itself once the player has said so, under the nickname they gave
  useEffect(() => {
    const name = normalizeName(readNickname() ?? '')
    if (!loadAutoUpload() || !run.newBest || !name || nameIssue(name) || sent.has(run.replay)) return
    void send(name)
    // Once per run
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run])

  const submit = () => {
    const name = normalizeName(nick)
    if (!name || nameIssue(name)) return
    writeNickname(name)
    saveAutoUpload(auto)
    void send(name)
  }

  const result = status.kind === 'done' ? status.result : null
  return (
    <Card data-testid="kart-board-upload" aria-live="polite">
      <Heading>{t('kart.board.upload.title')}</Heading>
      {result?.ok ? (
        <>
          <Placed data-testid="kart-board-placed" data-rank={result.entry.rank}>
            {t(result.improved ? 'kart.board.upload.placed' : 'kart.board.upload.kept', {
              rank: result.entry.rank,
              total: result.total,
              time: boardTime(result.entry.totalMs),
            })}
          </Placed>
          {onBoard && (
            <Button
              type="button"
              $size="sm"
              $variant="secondary"
              onClick={() => onBoard(run.track)}
              data-testid="kart-board-view"
            >
              {t('kart.board.upload.view')}
            </Button>
          )}
        </>
      ) : (
        <Form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Label htmlFor={fieldId}>{t('kart.board.upload.nick')}</Label>
          <Field
            id={fieldId}
            value={nick}
            maxLength={40}
            autoComplete="nickname"
            onChange={(event) => setNick(event.target.value)}
            aria-invalid={issue !== null && issue !== 'empty'}
            data-testid="kart-board-nick"
          />
          <Check>
            <input
              type="checkbox"
              checked={auto}
              onChange={(event) => setAuto(event.target.checked)}
              data-testid="kart-board-auto"
            />
            <span>{t('kart.board.upload.auto')}</span>
          </Check>
          {result && !result.ok && (
            <Problem role="alert" data-testid="kart-board-problem" data-error={result.error}>
              {problemText(t, result.error)}
            </Problem>
          )}
          <Button
            type="submit"
            $size="sm"
            disabled={issue !== null || status.kind === 'sending'}
            data-testid="kart-board-send"
          >
            {t(
              status.kind === 'sending'
                ? 'kart.board.upload.sending'
                : result
                  ? 'kart.board.upload.again'
                  : 'kart.board.upload.send',
            )}
          </Button>
          <Note>{t('kart.board.upload.note')}</Note>
        </Form>
      )}
    </Card>
  )
}

function problemText(t: T, error: Exclude<UploadResult, { ok: true }>['error']): string {
  switch (error) {
    case 'nickname':
    case 'physics':
    case 'revision':
    case 'rateLimited':
    case 'unavailable':
    case 'network':
      return t(`kart.board.upload.error.${error}`)
    default:
      return t('kart.board.upload.error.refused', { why: error })
  }
}

const Card = styled.section`
  display: grid;
  gap: ${space.xs}px;
  justify-items: start;
  width: 100%;
  padding-top: ${space.sm}px;
  border-top: 1px solid ${color.line};
`

const Heading = styled.h3`
  ${ticker(color.accent)}
  margin: 0;
  padding: 0 ${space.md}px;
  color: ${color.onAccent};
  font-size: ${fontSize.sm}px;
  text-transform: uppercase;
`

const Placed = styled.p`
  ${digits}
  margin: 0;
  font-size: ${fontSize.lg}px;
`

const Form = styled.form`
  display: grid;
  gap: ${space.xs}px;
  justify-items: start;
  width: 100%;
`

const Label = styled.label`
  font-size: ${fontSize.sm}px;
  color: ${color.muted};
`

const Field = styled.input`
  width: min(260px, 100%);
  min-height: 36px;
  padding: 0 ${space.sm}px;
  border: 1px solid ${color.border};
  border-radius: 4px;
  background: ${color.sunken};
  color: ${color.text};
  font: inherit;
`

const Check = styled.label`
  display: flex;
  gap: ${space.xs}px;
  align-items: center;
  font-size: ${fontSize.sm}px;
`

const Problem = styled.p`
  margin: 0;
  color: ${color.danger};
  font-size: ${fontSize.sm}px;
`

const Note = styled.p`
  margin: 0;
  color: ${color.muted};
  font-size: ${fontSize.sm}px;
`

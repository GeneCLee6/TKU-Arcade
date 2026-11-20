// 2026-11-20 (docs/KART-NETCODE.md §11.4): /kart/replay, a replay from a file or a link played in
// this browser. Pick a `.tkureplay` (or drop one on the page), or open a link whose hash carries a
// small one; it is read with nothing trusted (shared/kart/replayFile.ts) and played on the replay
// screen. A track whose road has changed since is played with a warning; an unknown one is not.
import { lazy, Suspense, useEffect, useRef, useState, type DragEvent } from 'react'
import styled from 'styled-components'
import {
  linkedReplay,
  MAX_FILE_BYTES,
  readReplayFile,
  REPLAY_FILE_EXTENSION,
  type ReplayFile,
  type ReplayFileProblem,
} from '../../../shared/kart/replayFile.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'
import { Button } from '../../components/Button.tsx'
import '../../games/kart/messages.ts'
import './replayMessages.ts'
import { useT } from '../../i18n/useT.ts'
import { Link } from '../../lib/router.tsx'
import { broadcast } from '../ui/broadcast.ts'
import { displayType } from '../../styles/esports.ts'
import { color, fontSize, space } from '../../styles/tokens.ts'

const ReplayView = lazy(() => import('./ReplayView.tsx'))

type Problem = ReplayFileProblem | 'track' | 'link'

type Opened =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'problem'; readonly problem: Problem }
  | { readonly kind: 'ready'; readonly file: ReplayFile; readonly changed: boolean }

/** A file read, checked against the tracks here */
async function open(bytes: Uint8Array): Promise<Opened> {
  const read = await readReplayFile(bytes)
  if (!read.ok) return { kind: 'problem', problem: read.problem }
  let track = null
  try {
    track = raceTrack(read.file.replay.track)
  } catch {
    track = null
  }
  if (!track) return { kind: 'problem', problem: 'track' }
  return { kind: 'ready', file: read.file, changed: (track.revision ?? 1) !== read.file.revision }
}

export default function ReplayFilePage() {
  const t = useT()
  const [opened, setOpened] = useState<Opened>(() =>
    window.location.hash ? { kind: 'reading' } : { kind: 'idle' },
  )
  const input = useRef<HTMLInputElement>(null)

  // A link: the replay is in the hash
  useEffect(() => {
    if (!window.location.hash) return
    const bytes = linkedReplay(window.location.hash)
    let live = true
    if (!bytes) queueMicrotask(() => live && setOpened({ kind: 'problem', problem: 'link' }))
    else void open(bytes).then((result) => live && setOpened(result))
    return () => {
      live = false
    }
  }, [])

  const readFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setOpened({ kind: 'problem', problem: 'tooBig' })
      return
    }
    setOpened({ kind: 'reading' })
    try {
      setOpened(await open(new Uint8Array(await file.arrayBuffer())))
    } catch {
      setOpened({ kind: 'problem', problem: 'broken' })
    }
  }

  if (opened.kind === 'ready') {
    const { file, changed } = opened
    const names = new Map(file.names.map((one) => [one.seat, one.name]))
    return (
      <Suspense fallback={<p role="status">{t('games.kart.replay.reading')}</p>}>
        <ReplayView
          replay={file.replay}
          nameOf={(seat) => names.get(seat) || t('games.kart.replay.seat', { seat: seat + 1 })}
          you={file.you}
          revision={file.revision}
          notice={changed ? t('games.kart.replay.revision') : null}
          onClose={() => {
            // Back to the picker; a link's replay is not opened again on a reload
            if (window.location.hash) history.replaceState(null, '', window.location.pathname)
            setOpened({ kind: 'idle' })
          }}
        />
      </Suspense>
    )
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    void readFile(event.dataTransfer.files[0])
  }

  return (
    <Page onDragOver={(event) => event.preventDefault()} onDrop={onDrop} data-testid="kart-replay-file">
      <Card>
        <Heading>{t('games.kart.replay.fileTitle')}</Heading>
        <p>{t('games.kart.replay.fileHelp')}</p>
        <input
          ref={input}
          type="file"
          accept={REPLAY_FILE_EXTENSION}
          hidden
          onChange={(event) => {
            void readFile(event.target.files?.[0])
            event.target.value = ''
          }}
          data-testid="kart-replay-file-input"
        />
        <Actions>
          <Button type="button" onClick={() => input.current?.click()} data-testid="kart-replay-pick">
            {t('games.kart.replay.pick')}
          </Button>
          <Link to="/kart">{t('games.kart.replay.toMenu')}</Link>
        </Actions>
        {opened.kind === 'reading' && <p role="status">{t('games.kart.replay.reading')}</p>}
        {opened.kind === 'problem' && (
          <Problem role="alert" data-testid="kart-replay-problem" data-problem={opened.problem}>
            {t(`games.kart.replay.problem.${opened.problem}`)}
          </Problem>
        )}
      </Card>
    </Page>
  )
}

const Page = styled.main`
  display: grid;
  place-items: center;
  min-height: 100dvh;
  padding: ${space.lg}px;
  background: ${color.bg};
`

const Card = styled.section`
  ${broadcast}
  display: grid;
  gap: ${space.md}px;
  width: min(480px, 100%);
  padding: ${space.lg}px;

  p {
    margin: 0;
  }
`

const Heading = styled.h1`
  ${displayType}
  margin: 0;
  color: ${color.text};
  font-size: ${fontSize.xl}px;
  text-transform: uppercase;
`

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${space.md}px;
  align-items: center;
`

const Problem = styled.p`
  color: ${color.danger};
  font-weight: 700;
`

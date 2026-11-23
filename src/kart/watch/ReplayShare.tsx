// 2026-11-20 (docs/KART-NETCODE.md §11.4): a replay kept and passed on without an account. Download
// saves it as a `.tkureplay` file (shared/kart/replayFile.ts) for anyone to open at /kart/replay;
// when the file is small enough a link carries it whole in its hash, which never reaches a server.
// Its own small chunk where the room's first screen offers it (KartScreen.tsx).
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { OutfitId } from '../../../shared/kart/outfits.ts'
import type { Replay } from '../../../shared/kart/replay.ts'
import { replayLink, writeReplayFile, type ReplayFileInfo } from '../../../shared/kart/replayFile.ts'
import { Button } from '../../components/Button.tsx'
import '../../games/kart/messages.ts'
import './replayMessages.ts'
import { useT } from '../../i18n/useT.ts'
import { download, fileInfo, replayFileName } from './replayFiles.ts'

export interface ReplayShareProps {
  readonly replay: Replay
  readonly nameOf: (seat: number) => string
  /** Whoever saves it, if they raced */
  readonly you: number | null
  /**
   * The track's revision the replay was recorded on, where it is known (a replay opened from a
   * file); left out, the track's as it is now
   */
  readonly revision?: number
  readonly size?: 'sm' | 'md'
  /** 2026-11-23: what each racer's driver wore, kept in the file's header */
  readonly outfitOf?: (seat: number) => OutfitId | undefined
}

export default function ReplayShare({
  replay,
  nameOf,
  you,
  revision,
  size = 'md',
  outfitOf,
}: ReplayShareProps) {
  const t = useT()
  // The file, made once: a link is offered only when it is small enough for one
  const [file, setFile] = useState<{ bytes: Uint8Array; info: ReplayFileInfo } | null>(null)
  const [copied, setCopied] = useState(false)
  // The names as they are when the file is made (a new function every render is no new replay)
  const names = useRef(nameOf)
  const outfits = useRef(outfitOf)
  useLayoutEffect(() => {
    names.current = nameOf
    outfits.current = outfitOf
  })
  useEffect(() => {
    let live = true
    const info = fileInfo(replay, names.current, you, revision, outfits.current)
    writeReplayFile(replay, info)
      .then((bytes) => live && setFile({ bytes, info }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [replay, you, revision])
  const link = file ? replayLink(window.location.origin, file.bytes) : null

  return (
    <>
      <Button
        type="button"
        $variant="secondary"
        $size={size}
        disabled={!file}
        onClick={() => file && download(file.bytes, replayFileName(replay, file.info.savedAt))}
        data-testid="kart-replay-download"
      >
        {t('games.kart.replay.download')}
      </Button>
      {link && (
        <Button
          type="button"
          $variant="ghost"
          $size={size}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(link)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }}
          data-testid="kart-replay-link"
          data-link={link}
        >
          {t(copied ? 'games.kart.replay.copied' : 'games.kart.replay.copyLink')}
        </Button>
      )}
    </>
  )
}

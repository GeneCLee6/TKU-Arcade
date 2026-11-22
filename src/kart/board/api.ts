// The leaderboard's side of the browser (2026-11-23, docs/ARCHITECTURE.md §4.81): reading a board,
// uploading a run, fetching a row's replay as a ghost, and the two things it remembers here (the
// nickname is the site's own, src/lib/nickname.ts; whether new bests go up by themselves). Only the
// board's lazy chunks import it.
import {
  BOARD_API,
  isBoardTrack,
  type BoardRefusal,
  type BoardResponse,
  type BoardUploadResponse,
} from '../../../shared/kart/board.ts'
import { ghostFromReplay } from '../../../shared/kart/boardRun.ts'
import { physicsStamp } from '../../../shared/kart/boardStamp.ts'
import type { Ghost } from '../../../shared/kart/ghost.ts'
import type { Replay } from '../../../shared/kart/replay.ts'
import { readReplayFile, writeReplayFile } from '../../../shared/kart/replayFile.ts'
import { recordKey } from '../../../shared/kart/track.ts'
import { readStored, writeStored } from '../../lib/storage.ts'
import { spikeTrack, type SpikeCourse } from '../courses.ts'

const AUTO_KEY = 'tku-arcade.kart.board.auto'

export const loadAutoUpload = (): boolean => readStored(AUTO_KEY) === '1'
export const saveAutoUpload = (on: boolean): void => writeStored(AUTO_KEY, on ? '1' : '0')

/** A board, with the nickname's own row when one is given */
export async function fetchBoard(track: string, nick: string | null): Promise<BoardResponse> {
  const query = new URLSearchParams({ track, ...(nick ? { nick } : {}) })
  const response = await fetch(`${BOARD_API}?${query}`, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`board ${response.status}`)
  return (await response.json()) as BoardResponse
}

/** Why an upload did not go through, as the card says it */
export type UploadProblem = BoardRefusal | 'network'

export type UploadResult =
  | Extract<BoardUploadResponse, { ok: true }>
  | { readonly ok: false; readonly error: UploadProblem }

/** A finished run's replay, as a file with the nickname in it, sent to the board */
export async function uploadRun(
  run: { readonly replay: Replay; readonly track: string; readonly revision: number },
  nick: string,
): Promise<UploadResult> {
  try {
    const file = await writeReplayFile(run.replay, {
      revision: run.revision,
      names: [{ seat: 0, name: nick }],
      you: 0,
      savedAt: Date.now(),
    })
    const query = new URLSearchParams({
      track: run.track,
      revision: String(run.revision),
      nick,
      physics: physicsStamp(),
    })
    const response = await fetch(`${BOARD_API}?${query}`, {
      method: 'POST',
      body: file as Uint8Array<ArrayBuffer>,
      headers: { 'content-type': 'application/octet-stream' },
    })
    const body = (await response.json().catch(() => null)) as BoardUploadResponse | null
    if (body && typeof body === 'object' && 'ok' in body) return body
    return { ok: false, error: 'unavailable' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

/** Where a row's replay file is */
export const replayAddress = (id: string): string => `${BOARD_API}/replay?id=${encodeURIComponent(id)}`

/** A row's replay, fetched and read, as a ghost for the time trial on its track; null if it cannot be */
export async function fetchGhost(id: string, track: string): Promise<Ghost | null> {
  try {
    const response = await fetch(replayAddress(id))
    if (!response.ok) return null
    const read = await readReplayFile(new Uint8Array(await response.arrayBuffer()))
    const known = isBoardTrack(track) ? spikeTrack(track as SpikeCourse) : null
    if (!read.ok || !known || read.file.replay.track !== track) return null
    return ghostFromReplay(read.file.replay, recordKey(known))
  } catch {
    return null
  }
}

// 2026-11-20 (docs/KART-NETCODE.md §11.4): what ReplayShare.tsx needs to make and save a replay's file
import type { Replay } from '../../../shared/kart/replay.ts'
import {
  REPLAY_FILE_EXTENSION,
  REPLAY_FILE_TYPE,
  type ReplayFileInfo,
} from '../../../shared/kart/replayFile.ts'
import { raceTrack } from '../../../shared/kart/tracks/registry.ts'

/** What a file keeps besides the replay */
export function fileInfo(
  replay: Replay,
  nameOf: (seat: number) => string,
  you: number | null,
  revision?: number,
): ReplayFileInfo {
  let current = 1
  try {
    current = raceTrack(replay.track)?.revision ?? 1
  } catch {
    current = 1
  }
  return {
    revision: revision ?? current,
    names: replay.racers.map((racer) => ({ seat: racer.seat, name: nameOf(racer.seat) })),
    you,
    savedAt: Date.now(),
  }
}

/** `tku-kart-riverside-20261120-2130.tkureplay` */
export function replayFileName(replay: Replay, savedAt: number): string {
  const track = replay.track.startsWith('custom:') ? 'custom' : replay.track.replace(/[^a-z0-9-]/gi, '')
  const when = new Date(savedAt)
  const two = (value: number) => String(value).padStart(2, '0')
  const stamp = `${when.getFullYear()}${two(when.getMonth() + 1)}${two(when.getDate())}-${two(when.getHours())}${two(when.getMinutes())}`
  return `tku-kart-${track || 'track'}-${stamp}${REPLAY_FILE_EXTENSION}`
}

export function download(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: REPLAY_FILE_TYPE }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.rel = 'noopener'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  // After the browser has taken the file
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}


// 2026-11-23 (e11-t06): the profile page's sums, pure (ProfilePage.tsx)

/** The id counted most often in a tally, and how often; null for an empty one */
export function favourite(tally: Readonly<Record<string, number>> | undefined): [string, number] | null {
  let best: [string, number] | null = null
  for (const [id, count] of Object.entries(tally ?? {})) {
    if (count > 0 && (best === null || count > best[1])) best = [id, count]
  }
  return best
}

/** A lap in ms as m:ss.mmm */
export function lapTime(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  const thousandths = Math.round(ms % 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(thousandths).padStart(3, '0')}`
}

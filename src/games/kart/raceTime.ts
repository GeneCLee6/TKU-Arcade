/** "1:02.345", as the race clock writes it (not imported: that would bring the physics along) */
export function raceTime(ms: number): string {
  const millis = Math.max(0, Math.round(ms))
  const minutes = Math.floor(millis / 60_000)
  const seconds = Math.floor((millis % 60_000) / 1000)
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis % 1000).padStart(3, '0')}`
}

// 2026-11-20 (§4.46): the quiet song, for a screen between races (a room's results, the race against
// the computer's results, the Grand Prix's card and podium). A race claims the music over it
// (musicPlayer.ts) and gives it back when it ends. Any key or tap may start the sound. The player is
// fetched once the screen is up, not with it: a room's first screen carries none of the music.
import { useEffect } from 'react'

type Player = typeof import('./musicPlayer.ts') & typeof import('./bus.ts')

let loaded: Player | null = null
const load = async (): Promise<Player> => {
  if (loaded) return loaded
  const [player, bus] = await Promise.all([import('./musicPlayer.ts'), import('./bus.ts')])
  loaded = { ...player, ...bus }
  return loaded
}

export function useMenuMusic(on = true): void {
  useEffect(() => {
    if (!on) return
    let release: (() => void) | null = null
    let gone = false
    void load().then((player) => {
      if (gone) return
      const claim = player.claimMusic()
      claim.set({ song: 'lounge', section: 'menu' })
      release = () => claim.release()
    })
    // Within the gesture itself, once the player is here (Safari asks for that)
    const unlock = () => loaded?.unlockKartAudio()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      gone = true
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      release?.()
    }
  }, [on])
}

import { handleRequest, type Env } from './app.ts'
import { runBackup } from './backup.ts'
import { checkUsage } from './usage.ts'
import { withSecurityHeaders } from './security.ts'

// The Durable Object classes must be exported from the Worker's entry module
export { LobbyDO } from './lobby.ts'
export { RoomDO } from './room.ts'

export default {
  fetch: async (request, env) => withSecurityHeaders(await handleRequest(request, env)),
  // The daily D1 backup and the cost check (wrangler.jsonc `triggers`): one does not stop the other
  async scheduled(_controller, env) {
    const results = await Promise.allSettled([runBackup(env), checkUsage(env)])
    // Still a failed run in the Worker's log (Cron Events) when either failed
    const failed = results.find((result) => result.status === 'rejected')
    if (failed) throw failed.reason
  },
} satisfies ExportedHandler<Env>

import { handleRequest, type Env } from './app.ts'
import { runBackup } from './backup.ts'

// The Durable Object classes must be exported from the Worker's entry module
export { LobbyDO } from './lobby.ts'
export { RoomDO } from './room.ts'

export default {
  fetch: handleRequest,
  // Only the daily backup so far (wrangler.jsonc `triggers`)
  async scheduled(_controller, env) {
    await runBackup(env)
  },
} satisfies ExportedHandler<Env>

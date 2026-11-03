import { handleRequest, type Env } from './app.ts'

// The Durable Object classes must be exported from the Worker's entry module
export { LobbyDO } from './lobby.ts'
export { RoomDO } from './room.ts'

export default {
  fetch: handleRequest,
} satisfies ExportedHandler<Env>

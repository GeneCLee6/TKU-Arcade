-- Per-game flags (e12-t11, worker/flags.ts): a game the owner has paused, for a notice or for
-- maintenance. No row means open; only `enabled = 0` closes a game. Changed from /stats, no deploy.
CREATE TABLE IF NOT EXISTS game_flags (
  game TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

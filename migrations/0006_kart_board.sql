-- The kart time trial's leaderboard (docs/ARCHITECTURE.md §4.80, worker/kartBoard.ts): one row per
-- nickname per board, a board being a built-in track at one layout revision. A row holds that
-- nickname's best run and its replay file (.tkureplay, deflated, about 10 to 25 kB; a BLOB here
-- rather than R2: no bucket to set up, and a board of a hundred is a few MB). The replay is the last
-- column, so that reading a board's times never pages through it.
--
-- No account yet (E11's F1): `nick_key` is the nickname folded (NFKC, lower case). When accounts come,
-- an `account_id` column is added and a signed-in player claims the rows of their nickname
-- (docs/SECURITY.md §11).
CREATE TABLE IF NOT EXISTS kart_board (
  track TEXT NOT NULL,
  revision INTEGER NOT NULL,
  nick_key TEXT NOT NULL,
  nick TEXT NOT NULL,
  id TEXT NOT NULL,
  kart TEXT NOT NULL,
  driver TEXT NOT NULL,
  total_ms INTEGER NOT NULL,
  best_lap_ms INTEGER NOT NULL,
  lap_ms TEXT NOT NULL,
  physics TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  replay BLOB,
  PRIMARY KEY (track, revision, nick_key)
);

-- A board in order, fastest first; ties to the one set first
CREATE INDEX IF NOT EXISTS kart_board_rank ON kart_board (track, revision, total_ms, created_at);

-- A replay by its row's id (GET /api/kart/board/replay)
CREATE UNIQUE INDEX IF NOT EXISTS kart_board_id ON kart_board (id);

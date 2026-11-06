-- The D1 skeleton (e12-t05): one small table, so that the migration flow and the backups run for
-- real. prompts, results and the rest come with the batches that use them (e5-t01, e11-t01).
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO app_meta (key, value) VALUES ('schema_started_at', datetime('now'));

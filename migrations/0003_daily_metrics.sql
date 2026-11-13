-- Daily metrics (e12-t07, worker/metrics.ts): how many rooms were opened and games started and
-- finished, per day (Taipei time) and game. Counts only: no room ids, no names, nothing about anyone.
CREATE TABLE IF NOT EXISTS daily_metrics (
  day TEXT NOT NULL,
  metric TEXT NOT NULL,
  game TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, metric, game)
);

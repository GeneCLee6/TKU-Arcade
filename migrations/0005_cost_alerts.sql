-- Cost alerts (e12-t15, worker/usage.ts): the daily check's record of a metric past 80% of the
-- plan's allowance. One row per metric and period (a UTC day or month), so an alert is raised once.
CREATE TABLE IF NOT EXISTS cost_alerts (
  period TEXT NOT NULL,
  metric TEXT NOT NULL,
  used REAL NOT NULL,
  allowance REAL NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (period, metric)
);

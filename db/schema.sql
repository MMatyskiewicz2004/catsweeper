-- PostgreSQL schema for Cat Sweeper leaderboard

CREATE TABLE IF NOT EXISTS leaderboard_runs (
  id BIGSERIAL PRIMARY KEY,
  player_name VARCHAR(32) NOT NULL,
  result VARCHAR(5) NOT NULL CHECK (result IN ('win', 'loss')),
  completion_time_ms INTEGER NULL,
  rows INTEGER NOT NULL,
  cols INTEGER NOT NULL,
  mines INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leaderboard_runs_result_time_idx
  ON leaderboard_runs (result, completion_time_ms ASC, created_at ASC);


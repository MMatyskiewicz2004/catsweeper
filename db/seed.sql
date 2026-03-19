-- Optional sample data (safe to run multiple times)

INSERT INTO leaderboard_runs (player_name, result, completion_time_ms, rows, cols, mines, created_at)
SELECT
  v.player_name,
  v.result,
  v.completion_time_ms,
  10,
  10,
  15,
  NOW() - (v.hours_ago * INTERVAL '1 hour')
FROM (VALUES
  ('Alex', 'win', 42000, 10),
  ('Sam', 'win', 53000, 8),
  ('Taylor', 'win', 61000, 6)
) AS v(player_name, result, completion_time_ms, hours_ago)
WHERE NOT EXISTS (
  SELECT 1
  FROM leaderboard_runs
  WHERE player_name = v.player_name
    AND result = 'win'
    AND completion_time_ms = v.completion_time_ms
);


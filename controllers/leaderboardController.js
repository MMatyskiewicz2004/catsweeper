const { pool } = require('../db/pool');
const {
  normalizePlayerName,
  validatePlayerName,
  assertValidResult,
  validateCompletionTimeMs
} = require('../lib/validation');

async function getFastestWins(limit = 10) {
  try {
    const lim = Number(limit) || 10;
    const { rows } = await pool.query(
      `
        SELECT
          player_name,
          completion_time_ms,
          created_at
        FROM leaderboard_runs
        WHERE result = 'win'
        ORDER BY completion_time_ms ASC, created_at ASC
        LIMIT $1
      `,
      [lim]
    );
    return rows.map((r) => ({
      playerName: r.player_name,
      completionTimeMs: r.completion_time_ms,
      datePlayed: r.created_at
    }));
  } catch (err) {
    // If DB is down, we still want the game to load for gameplay.
    // eslint-disable-next-line no-console
    console.warn('Leaderboard query failed (returning empty list):', err.message);
    return [];
  }
}

async function getPlayerWins(playerName, limit = 10) {
  try {
    const lim = Number(limit) || 10;
    const { rows } = await pool.query(
      `
        SELECT
          player_name,
          completion_time_ms,
          created_at,
          rows,
          cols,
          mines
        FROM leaderboard_runs
        WHERE result = 'win' AND player_name = $1
        ORDER BY completion_time_ms ASC, created_at ASC
        LIMIT $2
      `,
      [normalizePlayerName(playerName), lim]
    );

    return rows.map((r) => ({
      playerName: r.player_name,
      completionTimeMs: r.completion_time_ms,
      datePlayed: r.created_at,
      rows: r.rows,
      cols: r.cols,
      mines: r.mines
    }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Player scores query failed (returning empty list):', err.message);
    return [];
  }
}

function formatServerError(err) {
  return err && err.message ? err.message : 'Database error';
}

async function submitScore(req, res, next) {
  try {
    const { playerName, result, completionTimeMs, rows: gameRows, cols: gameCols, mines } = req.body || {};

    const v = validatePlayerName(playerName);
    if (!v.ok) {
      return res.status(400).json({ error: true, message: 'Invalid player name.' });
    }

    assertValidResult(result);

    let completionMsToStore = null;
    if (result === 'win') {
      validateCompletionTimeMs(completionTimeMs);
      completionMsToStore = completionTimeMs;
    }

    const intRows = Number(gameRows) || 10;
    const intCols = Number(gameCols) || 10;
    const intMines = Number(mines) || 15;

    await pool.query(
      `
        INSERT INTO leaderboard_runs (player_name, result, completion_time_ms, rows, cols, mines)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [normalizePlayerName(playerName), result, completionMsToStore, intRows, intCols, intMines]
    );

    res.json({ ok: true });
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: true, message: err.message });
    }
    // If DB is down/unavailable, tell the client without crashing the server.
    return res.status(503).json({ error: true, message: formatServerError(err) });
  }
}

async function getPlayerWinsJson(req, res, next) {
  try {
    const { playerName } = req.query || {};
    const limit = Number(req.query.limit) || 10;

    const v = validatePlayerName(playerName);
    if (!v.ok) {
      return res.status(400).json({ error: true, message: 'Invalid player name.' });
    }

    const wins = await getPlayerWins(v.normalized, limit);
    return res.json({ ok: true, wins });
  } catch (err) {
    next(err);
  }
}

async function getLeaderboardJson(req, res, next) {
  try {
    const limit = Number(req.query.limit) || 20;
    const fastest = await getFastestWins(limit);
    res.json({ ok: true, fastestWins: fastest });
  } catch (err) {
    next(err);
  }
}

async function leaderboardPage(req, res, next) {
  try {
    const fastestWins = await getFastestWins(30);
    res.render('leaderboard', { fastestWins, title: 'Leaderboard' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getFastestWins,
  getPlayerWins,
  submitScore,
  getPlayerWinsJson,
  getLeaderboardJson,
  leaderboardPage
};


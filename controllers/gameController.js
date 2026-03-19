const { generateMinesweeperGame } = require('../game/minesweeper');
const { getFastestWins } = require('./leaderboardController');
const { validatePlayerName, normalizePlayerName } = require('../lib/validation');

async function startGame(req, res, next) {
  try {
    const { name } = req.query;
    let playerName = null;
    if (typeof name === 'string' && name.trim() !== '') {
      const v = validatePlayerName(name);
      if (!v.ok) {
        return res.redirect('/?error=' + encodeURIComponent('Please enter a valid player name (1-20 characters).'));
      }
      playerName = normalizePlayerName(name);
    }

    const fastestWins = await getFastestWins(10);

    res.render('game', {
      title: 'Minesweeper',
      playerName,
      gameMeta: {
        rows: 5,
        cols: 5,
        mines: 8
      },
      fastestWins
    });
  } catch (err) {
    next(err);
  }
}

function validateStartCoord(value, maxExclusive) {
  const n = Number(value);
  if (!Number.isInteger(n)) return { ok: false };
  if (n < 0 || n >= maxExclusive) return { ok: false };
  return { ok: true, n };
}

async function initGameApi(req, res, next) {
  try {
    const { rows: bodyRows, cols: bodyCols, mines: bodyMines, startRow, startCol } = req.body || {};

    const rows = Number(bodyRows) || 10;
    const cols = Number(bodyCols) || 10;
    const mines = Number(bodyMines) || 15;

    if (!Number.isInteger(rows) || !Number.isInteger(cols) || !Number.isInteger(mines)) {
      return res.status(400).json({ error: true, message: 'Invalid board settings.' });
    }

    if (rows <= 1 || cols <= 1 || mines <= 0 || mines >= rows * cols) {
      return res.status(400).json({ error: true, message: 'Invalid board size or mine count.' });
    }

    const vr = validateStartCoord(startRow, rows);
    const vc = validateStartCoord(startCol, cols);
    if (!vr.ok || !vc.ok) {
      return res.status(400).json({ error: true, message: 'Invalid starting tile coordinates.' });
    }

    const game = generateMinesweeperGame({
      rows,
      cols,
      mines,
      startRow: vr.n,
      startCol: vc.n
    });

    return res.json({
      ok: true,
      gameInit: {
        rows: game.rows,
        cols: game.cols,
        mines: game.mines,
        startRow: game.startRow,
        startCol: game.startCol,
        totalSafeTiles: game.totalSafeTiles,
        tiles: game.tiles
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { startGame, initGameApi };


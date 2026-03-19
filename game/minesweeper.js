function createEmptyBoard(rows, cols) {
  const tiles = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      row,
      col,
      isBomb: false,
      isRevealed: false,
      isFlagged: false,
      adjacentBombs: 0
    }))
  );
  return tiles;
}

function neighborsOf(row, col, rows, cols) {
  const out = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
        out.push([nr, nc]);
      }
    }
  }
  return out;
}

function randInt(maxExclusive) {
  return Math.floor(Math.random() * maxExclusive);
}

function pickMinePositions({
  rows,
  cols,
  mines,
  excluded,
  // Minimum distance between mine tiles (in "tile steps").
  // Higher = mines are more spread out; generator auto-relaxes if it can't fit.
  minMineDistance = 3.6
}) {
  // excluded is a Set of "r,c" strings that must not become mines.
  const total = rows * cols;
  const candidates = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const key = `${r},${c}`;
      if (!excluded.has(key)) candidates.push([r, c]);
    }
  }

  if (mines > candidates.length) {
    throw new Error('Mines count is too large for the board size and exclusions.');
  }

  // Place mines with a "spread" constraint so they are not clustered.
  // We try decreasing the minimum distance until we can place all mines.
  let currentMinDist = minMineDistance;
  const maxAttemptsPerDist = 300;
  const minDistLowerBound = 1.2;
  const minDistStep = 0.2;

  function canPlaceAt(selected, r, c, dist2) {
    for (const [sr, sc] of selected) {
      const dr = sr - r;
      const dc = sc - c;
      if (dr * dr + dc * dc < dist2) return false;
    }
    return true;
  }

  while (currentMinDist >= minDistLowerBound) {
    const dist2 = currentMinDist * currentMinDist;

    for (let attempt = 0; attempt < maxAttemptsPerDist; attempt++) {
      // Start from a random mine to reduce bias.
      const shuffled = candidates.slice();
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randInt(i + 1);
        const tmp = shuffled[i];
        shuffled[i] = shuffled[j];
        shuffled[j] = tmp;
      }

      const selected = [];
      // Greedy: each time pick the candidate that is farthest (by min distance to existing mines).
      for (let pick = 0; pick < mines; pick++) {
        let bestIdx = -1;
        let bestScore = -Infinity;

        for (let i = 0; i < shuffled.length; i++) {
          const [r, c] = shuffled[i];
          if (!canPlaceAt(selected, r, c, dist2)) continue;

          let score = Infinity;
          for (const [sr, sc] of selected) {
            const dr = sr - r;
            const dc = sc - c;
            const d2 = dr * dr + dc * dc;
            if (d2 < score) score = d2;
          }

          // If none selected yet, first placement is arbitrary.
          if (selected.length === 0) score = 0;

          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }

        if (bestIdx === -1) break; // failed attempt for this minDist

        const chosen = shuffled[bestIdx];
        selected.push(chosen);
        shuffled.splice(bestIdx, 1);
      }

      if (selected.length === mines) {
        return selected;
      }
    }

    currentMinDist -= minDistStep;
  }

  // Fallback to classic random selection if constraints are too strict for this board.
  const shuffledFallback = candidates.slice();
  for (let i = shuffledFallback.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const tmp = shuffledFallback[i];
    shuffledFallback[i] = shuffledFallback[j];
    shuffledFallback[j] = tmp;
  }
  return shuffledFallback.slice(0, mines);
}

function placeMines(tiles, minePositions) {
  for (const [r, c] of minePositions) {
    tiles[r][c].isBomb = true;
  }
}

function computeAdjacentBombs(tiles) {
  const rows = tiles.length;
  const cols = tiles[0].length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (tiles[r][c].isBomb) continue;

      const n = neighborsOf(r, c, rows, cols);
      let count = 0;
      for (const [nr, nc] of n) {
        if (tiles[nr][nc].isBomb) count++;
      }
      tiles[r][c].adjacentBombs = count;
    }
  }
}

function generateMinesweeperGame({
  rows = 10,
  cols = 10,
  mines = 15,
  startRow = 0,
  startCol = 0,
  minMineDistance = 2.2
} = {}) {
  const tiles = createEmptyBoard(rows, cols);

  // Guarantee the start tile is safe AND is a ZERO.
  // By excluding mines from the 3x3 region centered at the chosen start tile,
  // the chosen tile will have adjacentBombs = 0, causing a satisfying first reveal.
  const excluded = new Set();
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = startRow + dr;
      const c = startCol + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        excluded.add(`${r},${c}`);
      }
    }
  }
  const minePositions = pickMinePositions({ rows, cols, mines, excluded, minMineDistance });

  placeMines(tiles, minePositions);
  computeAdjacentBombs(tiles);

  const totalSafeTiles = rows * cols - mines;
  return {
    rows,
    cols,
    mines,
    startRow,
    startCol,
    totalSafeTiles,
    tiles
  };
}

module.exports = { generateMinesweeperGame };


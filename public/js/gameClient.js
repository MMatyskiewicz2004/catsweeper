(function () {
  const meta = window.__GAME_META__;
  const playerName = window.__PLAYER_NAME__;

  if (!meta) {
    // eslint-disable-next-line no-console
    console.error('Missing window.__GAME_META__');
    return;
  }

  const rows = meta.rows;
  const cols = meta.cols;
  let mines = meta.mines;
  let totalSafeTiles = 0;

  const boardEl = document.getElementById('board');
  const modeHint = document.getElementById('modeHint');
  const restartBtn = document.getElementById('restartBtn');
  const bombCounterEl = document.getElementById('bombCounter');
  const flagCounterEl = document.getElementById('flagCounter');
  const timerEl = document.getElementById('timer');

  const deathOverlay = document.getElementById('deathOverlay');
  const deathDetails = document.getElementById('deathDetails');
  const deathPlayAgainBtn = document.getElementById('deathPlayAgainBtn');

  const winOverlay = document.getElementById('winOverlay');
  const winTimeEl = document.getElementById('winTime');
  const winForm = document.getElementById('winForm');
  const winNameInput = document.getElementById('winName');
  const winSubmitMsg = document.getElementById('winSubmitMsg');
  const winPlayAgainBtn = document.getElementById('winPlayAgainBtn');

  let tileEls = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));

  function createPlaceholderTiles() {
    return Array.from({ length: rows }, (_, r) =>
      Array.from({ length: cols }, (_, c) => ({
        row: r,
        col: c,
        isBomb: false,
        isRevealed: false,
        isFlagged: false,
        adjacentBombs: 0
      }))
    );
  }

  let awaitingStart = true;
  let tilesInitialized = false;
  let tilesState = createPlaceholderTiles();
  let tiles = tilesState;

  let cursor = { row: 0, col: 0 };
  let flagMode = false;
  let flagCursor = { row: 0, col: 0 };

  let revealedSafeCount = 0;
  let flagsPlaced = 0;

  let gameOver = false;
  let win = false;
  let showMines = false;

  const FLAG_RADIUS_TILES = 1.5; // max distance from cat to allow flag targeting (in tile steps)
  let WALK_RADIUS_PX = 0;
  let TILE_STEP_PX = 80; // estimated neighbor tile center-to-center distance
  let SELECT_THRESHOLD_PX = 28; // how close cat must be to a tile center to reveal it

  let tileCenters = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ x: 0, y: 0 })));
  let tileCentersReady = false;

  const catRadiusPx = 9;
  const catMoveSpeedPxPerSec = 220;
  let catPos = { x: 0, y: 0 }; // position relative to `boardEl`

  const moveKeys = { up: false, down: false, left: false, right: false };
  let rafId = null;
  let lastTs = null;
  let loopStarted = false;

  let lastFlagTargetKey = null;

  let timerStarted = false;
  let timerMs = 0;
  let timerInterval = null;
  let hasSubmittedEnd = false; // ensures we only save once on death

  let rafNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  let timerT0 = null;

  const catEl = document.createElement('div');
  catEl.className = 'cat';
  catEl.setAttribute('aria-hidden', 'true');

  const flagRadiusEl = document.createElement('div');
  flagRadiusEl.className = 'flagRadius';
  flagRadiusEl.setAttribute('aria-hidden', 'true');

  function setModeHint() {
    if (!modeHint) return;
    if (awaitingStart) {
      modeHint.innerHTML =
        'Choose your starting tile: walk with <span class="kbd">Arrows</span> / <span class="kbd">WASD</span> and press <span class="kbd">Enter</span>. The board spawns after you pick.';
    } else if (flagMode) {
      modeHint.innerHTML =
        'Flag Mode: move the flag cursor with <span class="kbd">Arrows</span> / <span class="kbd">WASD</span>, then press <span class="kbd">Enter</span> to place/remove the flag. Press <span class="kbd">F</span> again to exit.';
    } else {
      modeHint.innerHTML =
        'Move with <span class="kbd">Arrows</span> or <span class="kbd">WASD</span>. Press <span class="kbd">F</span> for Flag Mode.';
    }
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${pad2(m)}:${pad2(s)}`;
  }

  function startTimer() {
    if (timerStarted) return;
    timerStarted = true;
    timerT0 = rafNow();
    timerInterval = window.setInterval(() => {
      timerMs = Math.floor(rafNow() - timerT0);
      timerEl.textContent = formatTime(timerMs);
    }, 250);
  }

  function stopTimer() {
    if (timerInterval) window.clearInterval(timerInterval);
    timerInterval = null;
    if (timerT0 != null) timerMs = Math.floor(rafNow() - timerT0);
    timerEl.textContent = formatTime(timerMs);
  }

  function updateHUD() {
    const bombsRemaining = mines - flagsPlaced;
    bombCounterEl.textContent = bombsRemaining;
    flagCounterEl.textContent = flagsPlaced;
  }

  function computeNumberClass(adj) {
    if (adj <= 0) return '';
    return `n${adj}`;
  }

  function isWithinFlagRadius(row, col) {
    // Flags can be placed anywhere on the board (free-roam design).
    return true;
  }

  function renderCatAndOverlays() {
    // Ensure overlays exist.
    if (!catEl.parentElement) boardEl.appendChild(catEl);
    if (!flagRadiusEl.parentElement) boardEl.appendChild(flagRadiusEl);

    catEl.style.left = `${catPos.x}px`;
    catEl.style.top = `${catPos.y}px`;

    // Visual radius is no longer the limiting factor for flag placement.
    flagRadiusEl.style.display = 'none';
  }

  function computeTileCenters() {
    let sumStep = 0;
    let stepCount = 0;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const el = tileEls[r][c];
        tileCenters[r][c] = {
          x: el.offsetLeft + el.clientWidth / 2,
          y: el.offsetTop + el.clientHeight / 2
        };
      }
    }

    // Estimate tile step based on neighbor centers.
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (c + 1 < cols) {
          const a = tileCenters[r][c];
          const b = tileCenters[r][c + 1];
          sumStep += Math.hypot(b.x - a.x, b.y - a.y);
          stepCount++;
        }
        if (r + 1 < rows) {
          const a = tileCenters[r][c];
          const b = tileCenters[r + 1][c];
          sumStep += Math.hypot(b.x - a.x, b.y - a.y);
          stepCount++;
        }
      }
    }

    const avgStep = stepCount > 0 ? sumStep / stepCount : TILE_STEP_PX;
    TILE_STEP_PX = avgStep;
    WALK_RADIUS_PX = TILE_STEP_PX * FLAG_RADIUS_TILES;
    SELECT_THRESHOLD_PX = Math.max(16, TILE_STEP_PX * 0.35);
    tileCentersReady = true;
  }

  function setCatToTile(row, col) {
    if (!tileCentersReady) return;
    catPos = { x: tileCenters[row][col].x, y: tileCenters[row][col].y };
    cursor = { row, col };
  }

  function getNearestTileToCat() {
    let best = { row: cursor.row, col: cursor.col, d2: Infinity };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const center = tileCenters[r][c];
        const dx = center.x - catPos.x;
        const dy = center.y - catPos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best.d2) best = { row: r, col: c, d2 };
      }
    }
    return best;
  }

  let initializingGame = false;

  async function chooseStartingTile() {
    if (awaitingStart === false) return;
    if (initializingGame) return;
    if (!tileCentersReady) return;

    const best = getNearestTileToCat();
    const threshold2 = SELECT_THRESHOLD_PX * SELECT_THRESHOLD_PX;
    if (best.d2 > threshold2) {
      modeHint.innerHTML =
        'Move closer to a tile center, then press <span class="kbd">Enter</span> to choose your starting tile.';
      return;
    }

    initializingGame = true;
    flagMode = false;
    flagCursor = { row: best.row, col: best.col };

    // Snap the cat/cursor to the chosen starting tile.
    setCatToTile(best.row, best.col);

    try {
      const resp = await fetch('/api/game/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows,
          cols,
          mines: meta.mines,
          startRow: best.row,
          startCol: best.col
        })
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error((data && data.message) || 'Failed to create board.');
      }

      const data = await resp.json();

      // Switch from placeholder tiles to real minesweeper tiles.
      tilesInitialized = true;
      awaitingStart = false;
      mines = data.gameInit.mines;
      totalSafeTiles = data.gameInit.totalSafeTiles;
      tiles = data.gameInit.tiles;

      // Reset counters/state for a new board.
      revealedSafeCount = 0;
      flagsPlaced = 0;
      gameOver = false;
      win = false;
      showMines = false;
      hasSubmittedEnd = false;

      timerMs = 0;
      timerEl.textContent = formatTime(0);
      timerStarted = false;
      stopTimer();
      startTimer();

      // Cat has chosen its starting tile: step onto it (bombs only kill on direct step).
      stepOnTile(best.row, best.col);
      renderBoard();
      updateHUD();
      setModeHint();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Failed to init game:', e);
      modeHint.innerHTML = 'Could not generate the board. Try again.';
    } finally {
      initializingGame = false;
    }
  }

  function updateFlagTargetVisual() {
    if (!flagMode || gameOver || !tileCentersReady) {
      if (lastFlagTargetKey) {
        const [lr, lc] = lastFlagTargetKey.split(',').map(Number);
        if (tileEls[lr] && tileEls[lr][lc]) tileEls[lr][lc].classList.remove('tile--flagTarget');
      }
      lastFlagTargetKey = null;
      return;
    }

    const r = flagCursor.row;
    const c = flagCursor.col;
    const el = tileEls[r] && tileEls[r][c];
    if (!el) return;

    const key = `${r},${c}`;
    const canTarget = !tiles[r][c].isRevealed;

    if (canTarget) {
      if (lastFlagTargetKey && lastFlagTargetKey !== key) {
        const [lr, lc] = lastFlagTargetKey.split(',').map(Number);
        if (tileEls[lr] && tileEls[lr][lc]) tileEls[lr][lc].classList.remove('tile--flagTarget');
      }
      el.classList.add('tile--flagTarget');
      lastFlagTargetKey = key;
    } else if (lastFlagTargetKey === key) {
      el.classList.remove('tile--flagTarget');
      lastFlagTargetKey = null;
    } else {
      el.classList.remove('tile--flagTarget');
    }
  }

  function updateCatTileFromPosition() {
    if (gameOver || !tileCentersReady) return;

    // Find nearest tile center to the cat position.
    let best = { row: cursor.row, col: cursor.col, d2: Infinity };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const center = tileCenters[r][c];
        const dx = center.x - catPos.x;
        const dy = center.y - catPos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best.d2) best = { row: r, col: c, d2 };
      }
    }

    if (best.d2 > SELECT_THRESHOLD_PX * SELECT_THRESHOLD_PX) return;
    if (best.row === cursor.row && best.col === cursor.col) return;

    cursor = { row: best.row, col: best.col };
    if (!awaitingStart) {
      if (!timerStarted) startTimer();
      stepOnTile(cursor.row, cursor.col);
    }
    renderBoard();
  }

  function clampCat() {
    const w = boardEl.clientWidth;
    const h = boardEl.clientHeight;
    catPos.x = Math.max(catRadiusPx, Math.min(w - catRadiusPx, catPos.x));
    catPos.y = Math.max(catRadiusPx, Math.min(h - catRadiusPx, catPos.y));
  }

  function startAnimationLoop() {
    if (loopStarted) return;
    loopStarted = true;

    const tick = (ts) => {
      if (!lastTs) lastTs = ts;
      const dt = Math.min(0.05, (ts - lastTs) / 1000);
      lastTs = ts;

      if (!gameOver && !flagMode && tileCentersReady) {
        let vx = 0;
        let vy = 0;
        if (moveKeys.left) vx -= 1;
        if (moveKeys.right) vx += 1;
        if (moveKeys.up) vy -= 1;
        if (moveKeys.down) vy += 1;

        if (vx !== 0 || vy !== 0) {
          const mag = Math.hypot(vx, vy) || 1;
          vx /= mag;
          vy /= mag;
          catPos.x += vx * catMoveSpeedPxPerSec * dt;
          catPos.y += vy * catMoveSpeedPxPerSec * dt;
          clampCat();
          updateCatTileFromPosition();
        }
      }

      renderCatAndOverlays();
      updateFlagTargetVisual();
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
  }

  function setTileContent(tileEl, tile) {
    tileEl.classList.remove(
      'tile--revealed',
      'tile--flagged',
      'tile--mine',
      'tile--flagTarget',
      'n1',
      'n2',
      'n3',
      'n4',
      'n5',
      'n6',
      'n7',
      'n8'
    );

    tileEl.textContent = '';

    if (gameOver && showMines) {
      if (tile.isBomb) {
        tileEl.classList.add('tile--mine');
        tileEl.textContent = '*';
        return;
      }
    }

    if (tile.isFlagged && !tile.isRevealed) {
      tileEl.classList.add('tile--flagged');
      tileEl.textContent = '🚩';
      return;
    }

    if (tile.isRevealed) {
      tileEl.classList.add('tile--revealed');
      if (!tile.isBomb && tile.adjacentBombs > 0) {
        tileEl.textContent = String(tile.adjacentBombs);
        tileEl.classList.add(computeNumberClass(tile.adjacentBombs));
      } else {
        // empty zeros intentionally render blank
        tileEl.textContent = '';
      }
      return;
    }

  }

  function renderBoard() {
    updateHUD();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = tiles[r][c];
        const el = tileEls[r][c];
        if (!el) continue;
        // Keep CSS classes in sync with state.
        setTileContent(el, tile);
      }
    }
    renderCatAndOverlays();
  }

  function revealSafeTile(row, col) {
    const tile = tiles[row][col];
    if (tile.isRevealed || tile.isBomb) return 0;

    tile.isRevealed = true;
    if (tile.isFlagged) {
      tile.isFlagged = false;
      flagsPlaced = Math.max(0, flagsPlaced - 1);
    }

    revealedSafeCount += 1;
    return 1;
  }

  function revealFloodFill(row, col) {
    // Standard Minesweeper-like flood fill for 0-adjacent tiles.
    const q = [[row, col]];
    while (q.length > 0) {
      const [r, c] = q.shift();
      const tile = tiles[r][c];
      if (tile.isBomb) continue;
      if (tile.adjacentBombs !== 0) continue;

      const neighbors = [
        [r - 1, c - 1],
        [r - 1, c],
        [r - 1, c + 1],
        [r, c - 1],
        [r, c + 1],
        [r + 1, c - 1],
        [r + 1, c],
        [r + 1, c + 1]
      ];

      for (const [nr, nc] of neighbors) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        const neighbor = tiles[nr][nc];
        if (neighbor.isRevealed || neighbor.isBomb) continue;

        revealSafeTile(nr, nc);
        if (!gameOver && neighbor.adjacentBombs === 0) q.push([nr, nc]);
      }
    }
  }

  function stepOnTile(centerRow, centerCol) {
    if (awaitingStart || !tilesInitialized || !tiles) return;
    // Standard Minesweeper: reveal the stepped tile only.
    // If it's a zero, flood-fill reveals neighboring zeros and their border numbers.
    revealAt(centerRow, centerCol);
  }

  function revealAt(row, col) {
    if (awaitingStart || !tilesInitialized || !tiles) return;
    const tile = tiles[row][col];

    // If stepping on a flagged tile, we treat it as a reveal attempt:
    // the flag is removed, then the tile is revealed if safe.
    if (tile.isFlagged) {
      tile.isFlagged = false;
      flagsPlaced = Math.max(0, flagsPlaced - 1);
    }

    if (tile.isRevealed) return;

    if (tile.isBomb) {
      handleDeath(row, col);
      return;
    }

    revealSafeTile(row, col);

    if (tile.adjacentBombs === 0) {
      revealFloodFill(row, col);
    }

    if (revealedSafeCount >= totalSafeTiles) {
      handleWin();
    }
  }

  function attemptMove(dr, dc) {
    if (gameOver || awaitingStart) return;

    const nr = cursor.row + dr;
    const nc = cursor.col + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return;

    cursor = { row: nr, col: nc };
    if (!timerStarted) startTimer();

    stepOnTile(nr, nc);
    renderBoard();
  }

  function toggleFlagHere() {
    if (gameOver) return;
    toggleFlagAt(flagCursor.row, flagCursor.col);
  }

  function showOverlay(el) {
    el.classList.remove('overlay--hidden');
  }

  function hideOverlay(el) {
    el.classList.add('overlay--hidden');
  }

  function setDeathUI() {
    showOverlay(deathOverlay);
    const timeSeconds = Math.floor(timerMs / 1000);
    deathDetails.textContent = `Time survived: ${timeSeconds}s`;
  }

  async function submitEndRun(result) {
    if (hasSubmittedEnd) return;
    hasSubmittedEnd = true;

    const payload = {
      playerName,
      result,
      completionTimeMs: result === 'win' ? timerMs : null,
      rows,
      cols,
      mines
    };

    try {
      const resp = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        // eslint-disable-next-line no-console
        console.warn('Score submit failed:', await resp.text());
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Score submit error:', e);
    }
  }

  function handleDeath(explodedRow, explodedCol) {
    gameOver = true;
    flagMode = false;
    win = false;
    showMines = true;

    stopTimer();
    // Render first so the UI freezes on death.
    renderBoard();
    setDeathUI();

    // Auto-store loss.
    submitEndRun('loss');
  }

  function handleWin() {
    gameOver = true;
    flagMode = false;
    win = true;
    showMines = false;

    stopTimer();
    renderBoard();

    winTimeEl.textContent = formatTime(timerMs);
    winNameInput.value = playerName || '';

    hideOverlay(deathOverlay);
    showOverlay(winOverlay);
  }

  async function submitWinScore(winName) {
    if (!winName || typeof winName !== 'string') {
      winSubmitMsg.textContent = 'Enter a player name.';
      winSubmitMsg.classList.remove('alert--hidden');
      return;
    }

    winSubmitMsg.textContent = '';
    winSubmitMsg.classList.add('alert--hidden');

    const payload = {
      playerName: winName,
      result: 'win',
      completionTimeMs: timerMs,
      rows,
      cols,
      mines
    };

    try {
      const resp = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error(data && data.message ? data.message : 'Failed to save score.');
      }

      winSubmitMsg.textContent = 'Score saved! Redirecting to leaderboard...';
      winSubmitMsg.classList.remove('alert--hidden');
      window.setTimeout(() => {
        window.location.href = '/leaderboard';
      }, 700);
    } catch (e) {
      winSubmitMsg.textContent = e.message || 'Failed to save score.';
      winSubmitMsg.classList.remove('alert--hidden');
    }
  }

  function restartToNewBoard() {
    const name = encodeURIComponent(playerName || '');
    window.location.href = `/game?name=${name}`;
  }

  function refreshSidebarLeaderboard() {
    const listEl = document.getElementById('sideLeaderboardList');
    if (!listEl) return;

    fetch('/api/leaderboard?limit=5')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || !data.fastestWins) return;

        const rowsHtml = data.fastestWins
          .map((w, idx) => {
            const time = w.completionTimeMs ? Math.round(w.completionTimeMs / 1000) : '-';
            return `
              <div class="leaderboard__row leaderboard__row--compact">
                <div class="leaderboard__rank">#${idx + 1}</div>
                <div class="leaderboard__name">${escapeHtml(w.playerName)}</div>
                <div class="leaderboard__time hud__value--mono">${time}s</div>
              </div>
            `;
          })
          .join('');

        if (!rowsHtml) {
          listEl.innerHTML = `<div class="muted">No wins recorded yet.</div>`;
        } else {
          listEl.innerHTML = rowsHtml;
        }
      })
      .catch(() => {
        // eslint-disable-next-line no-console
        console.warn('Failed to refresh leaderboard');
      });
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function buildBoardDom() {
    // Remove tiles while keeping overlays fresh (we append them in renderCatAndOverlays).
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tileEl = document.createElement('div');
        tileEl.className = 'tile tile--hidden';
        tileEl.dataset.row = String(r);
        tileEl.dataset.col = String(c);

        tileEls[r][c] = tileEl;
        boardEl.appendChild(tileEl);
      }
    }
  }

  function toggleFlagAt(row, col) {
    if (gameOver) return;
    if (awaitingStart || !tilesInitialized) return;
    if (!isWithinBounds(row, col)) return;

    const tile = tiles[row][col];
    if (tile.isRevealed) return; // cannot flag revealed tiles

    tile.isFlagged = !tile.isFlagged;
    flagsPlaced += tile.isFlagged ? 1 : -1;
    flagsPlaced = Math.max(0, flagsPlaced);
    renderBoard();
  }

  function isWithinBounds(row, col) {
    return row >= 0 && row < rows && col >= 0 && col < cols;
  }

  function bindControls() {
    window.addEventListener('keydown', (e) => {
      const key = e.key;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      const overlayOpen = !winOverlay.classList.contains('overlay--hidden') || !deathOverlay.classList.contains('overlay--hidden');

      if (overlayOpen && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON')) {
        return;
      }

      if (awaitingStart && (key === 'Enter' || key === ' ')) {
        e.preventDefault();
        chooseStartingTile();
        return;
      }

      if (key === 'f' || key === 'F') {
        e.preventDefault();
        if (awaitingStart) {
          setModeHint();
          return;
        }
        if (!gameOver) {
          flagMode = !flagMode;
          moveKeys.left = false;
          moveKeys.right = false;
          moveKeys.up = false;
          moveKeys.down = false;

          // When entering flag mode, start targeting the current tile the cat is nearest to.
          if (flagMode) flagCursor = { row: cursor.row, col: cursor.col };
          setModeHint();
          renderBoard();
          updateFlagTargetVisual();
        }
        return;
      }

      if (key === 'r' || key === 'R') {
        e.preventDefault();
        restartToNewBoard();
        return;
      }

      if (!flagMode) {
        // Continuous free-roam movement keys
        if (key === 'ArrowUp' || key === 'w' || key === 'W') {
          e.preventDefault();
          moveKeys.up = true;
        } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
          e.preventDefault();
          moveKeys.down = true;
        } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
          e.preventDefault();
          moveKeys.left = true;
        } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
          e.preventDefault();
          moveKeys.right = true;
        }
        return;
      }

      // Flag mode controls
      if (key === 'Escape') {
        e.preventDefault();
        flagMode = false;
        setModeHint();
        renderBoard();
        updateFlagTargetVisual();
        return;
      }

      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        if (awaitingStart) return;
        toggleFlagHere(); // place/remove flag on the targeted tile
        return;
      }

      let dr = 0;
      let dc = 0;

      if (key === 'ArrowUp' || key === 'w' || key === 'W') {
        dr = -1;
      } else if (key === 'ArrowDown' || key === 's' || key === 'S') {
        dr = 1;
      } else if (key === 'ArrowLeft' || key === 'a' || key === 'A') {
        dc = -1;
      } else if (key === 'ArrowRight' || key === 'd' || key === 'D') {
        dc = 1;
      } else {
        return;
      }

      e.preventDefault();

      const nr = flagCursor.row + dr;
      const nc = flagCursor.col + dc;
      if (!isWithinBounds(nr, nc)) return;
      if (tiles[nr][nc].isRevealed) return;

      flagCursor = { row: nr, col: nc };
      renderBoard();
      updateFlagTargetVisual();
    });

    window.addEventListener('keyup', (e) => {
      if (flagMode) return; // in flag mode arrows control selection, not movement
      const key = e.key;
      if (key === 'ArrowUp' || key === 'w' || key === 'W') moveKeys.up = false;
      if (key === 'ArrowDown' || key === 's' || key === 'S') moveKeys.down = false;
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') moveKeys.left = false;
      if (key === 'ArrowRight' || key === 'd' || key === 'D') moveKeys.right = false;
    });

    restartBtn.addEventListener('click', restartToNewBoard);
    deathPlayAgainBtn.addEventListener('click', restartToNewBoard);
    winPlayAgainBtn.addEventListener('click', restartToNewBoard);

    winForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitWinScore(winNameInput.value);
    });
  }

  function initGame() {
    hideOverlay(deathOverlay);
    hideOverlay(winOverlay);
    buildBoardDom();
    revealedSafeCount = 0;
    flagsPlaced = 0;

    awaitingStart = true;
    tilesInitialized = false;
    tilesState = createPlaceholderTiles();
    tiles = tilesState;

    flagMode = false;
    flagCursor = { row: 0, col: 0 };

    timerMs = 0;
    timerEl.textContent = formatTime(0);
    timerStarted = false;

    setModeHint();

    computeTileCenters();

    // Start the cat in the middle of the board (not snapped to a tile).
    catPos = { x: boardEl.clientWidth / 2, y: boardEl.clientHeight / 2 };
    clampCat();

    // Set cursor/flag cursor to the nearest tile center so selection starts sane,
    // but do NOT reveal anything until the player chooses a starting tile.
    let best = { row: 0, col: 0, d2: Infinity };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const center = tileCenters[r][c];
        const dx = center.x - catPos.x;
        const dy = center.y - catPos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < best.d2) best = { row: r, col: c, d2 };
      }
    }
    cursor = { row: best.row, col: best.col };
    flagCursor = { row: best.row, col: best.col };

    renderBoard();
    bindControls();
    updateHUD();
    refreshSidebarLeaderboard();

    startAnimationLoop();

    // Keep cat position + flag radius visuals aligned if the browser is resized.
    window.addEventListener('resize', () => {
      computeTileCenters();
      if (awaitingStart) {
        catPos = { x: boardEl.clientWidth / 2, y: boardEl.clientHeight / 2 };
        clampCat();
      } else {
        setCatToTile(cursor.row, cursor.col);
      }
      renderBoard();
    });
  }

  initGame();
})();



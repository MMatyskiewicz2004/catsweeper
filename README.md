# Cat Sweeper (COMP 4170)

Browser-based Minesweeper with movement-based gameplay, built with:
`HTML` + `CSS` + `JavaScript` (client), `Node.js` + `Express.js` + `EJS` (server), and `PostgreSQL` (persistent leaderboard).

## Features

- Classic Minesweeper-inspired board (`10x10`, default `15` mines)
- Keyboard movement reveals tiles like Minesweeper (including zero flood-fill)
- Flags can be placed/removed on the current tile with `F`
- Walking onto a bomb ends the game immediately (full-screen black game-over overlay)
- Winning reveals all non-bomb tiles, then prompts the player to submit a score
- PostgreSQL-backed leaderboard (`Fastest Wins` sorted by completion time)
- Proper error handling + input validation for player names and score submissions

## Project Structure

```txt
cat-sweeper/
  server.js
  app.js
  controllers/
    gameController.js
    homeController.js
    leaderboardController.js
  routes/
    home.js
    game.js
    leaderboard.js
    scores.js
  game/
    minesweeper.js
  lib/
    validation.js
  db/
    pool.js
    schema.sql
    seed.sql
  views/
    index.ejs
    game.ejs
    leaderboard.ejs
    error.ejs
    partials/
      header.ejs
      footer.ejs
  public/
    css/styles.css
    js/gameClient.js
```

## Setup (PostgreSQL)

1. Create a database:

```sql
CREATE DATABASE cat_sweeper;
```

2. Create the table(s) and indexes:

```bash
psql -d cat_sweeper -f db/schema.sql
```

3. (Optional) Load sample data:

```bash
psql -d cat_sweeper -f db/seed.sql
```

## Setup (Node / Express)

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables:

- Copy `env.example` to `.env` and update values if needed.
- The app uses `DATABASE_URL` by default.

3. Run locally (development):

```bash
npm run dev
```

4. Or run in production mode:

```bash
npm start
```

Then open:

`http://localhost:3000`

## Environment Variables

Create a `.env` file in the project root. Use one of the following approaches:

- Recommended:
  - `DATABASE_URL=postgres://USER:PASSWORD@HOST:5432/cat_sweeper`
- Or individual parameters:
  - `PGHOST`
  - `PGPORT`
  - `PGUSER`
  - `PGPASSWORD`
  - `PGDATABASE`

Other:
- `PORT` (default: `3000`)

## How Saving Works

- When the player dies, the client auto-saves a run with `result = 'loss'`.
- When the player wins, the client submits a score only when the player clicks **Submit** on the win overlay.
- Only completed runs are stored.
- The leaderboard query filters to wins and sorts by `completion_time_ms` (fastest first).

## Game Controls

- Move: `Arrow keys` or `WASD`
- Flag current tile: `F`
- Restart: `Restart` button or `R`

## Notes for Presentation / Explainability

- Board generation and adjacency counts are handled server-side in `game/minesweeper.js`.
- The client performs reveal + zero flood-fill to match classic Minesweeper behavior (`public/js/gameClient.js`).
- Score persistence is handled by `routes/scores.js` -> `controllers/leaderboardController.js`, using parameterized PostgreSQL queries.


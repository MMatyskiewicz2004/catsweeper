require('dotenv').config();

const { createApp } = require('./app');
const { initDb } = require('./db/pool');

const port = Number(process.env.PORT || 3000);

async function main() {
  try {
    await initDb();
  } catch (err) {
    // Let the app start so you can still view/play the game UI.
    // Score persistence/leaderboard will show empty/fail gracefully until DB is available.
    // eslint-disable-next-line no-console
    console.warn('PostgreSQL not reachable; starting server without DB connectivity:', err.message);
  }
  const app = createApp();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Cat Sweeper listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});


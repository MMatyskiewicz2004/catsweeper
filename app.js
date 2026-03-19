const path = require('path');
const express = require('express');
const morgan = require('morgan');

const homeRoutes = require('./routes/home');
const gameRoutes = require('./routes/game');
const leaderboardRoutes = require('./routes/leaderboard');
const scoresRoutes = require('./routes/scores');

function createApp() {
  const app = express();

  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'ejs');

  app.use(morgan('dev'));
  app.use(express.json({ limit: '50kb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use(express.static(path.join(__dirname, 'public')));
  // Serve game assets (cat, landmine, etc.) under /assets
  app.use('/assets', express.static(path.join(__dirname, 'game_assets')));

  app.use('/', homeRoutes);
  app.use('/', gameRoutes);
  app.use('/', leaderboardRoutes);
  app.use('/', scoresRoutes);

  // 404 for unknown routes
  app.use((req, res) => {
    res.status(404).render('error', {
      title: 'Page not found',
      message: `No route matches ${req.method} ${req.path}`
    });
  });

  // Central error handler (supports both HTML and JSON for /api/*)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // eslint-disable-next-line no-console
    console.error(err);

    const isApi = req.path.startsWith('/api/');
    const status = err.statusCode || 500;

    const payload = {
      error: true,
      message: err.message || 'Unexpected error'
    };

    if (isApi) {
      return res.status(status).json(payload);
    }

    res.status(status).render('error', {
      title: 'Something went wrong',
      message: payload.message
    });
  });

  return app;
}

module.exports = { createApp };


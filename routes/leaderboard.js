const express = require('express');
const {
  leaderboardPage,
  getLeaderboardJson
} = require('../controllers/leaderboardController');

const router = express.Router();

router.get('/leaderboard', leaderboardPage);
router.get('/api/leaderboard', getLeaderboardJson);

module.exports = router;


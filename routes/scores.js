const express = require('express');
const { submitScore } = require('../controllers/leaderboardController');

const router = express.Router();

router.post('/api/scores', submitScore);

module.exports = router;


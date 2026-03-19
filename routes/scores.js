const express = require('express');
const { submitScore, getPlayerWinsJson } = require('../controllers/leaderboardController');

const router = express.Router();

router.post('/api/scores', submitScore);
router.get('/api/scores', getPlayerWinsJson);

module.exports = router;


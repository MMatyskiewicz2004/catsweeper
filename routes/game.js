const express = require('express');
const { startGame, initGameApi } = require('../controllers/gameController');

const router = express.Router();

router.get('/game', startGame);
router.post('/api/game/init', initGameApi);

module.exports = router;


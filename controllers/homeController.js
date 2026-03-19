const { getFastestWins } = require('./leaderboardController');

async function homePage(req, res, next) {
  try {
    const error = req.query.error ? String(req.query.error) : null;
    const fastestWins = await getFastestWins(10);
    res.render('index', { fastestWins, error, title: 'Cat Sweeper' });
  } catch (err) {
    next(err);
  }
}

module.exports = { homePage };


function normalizePlayerName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ');
}

function validatePlayerName(name) {
  const normalized = normalizePlayerName(name);
  // Keep it presentation-friendly: readable names only.
  // Allows letters, numbers, spaces, underscores, hyphens, and periods.
  const ok = /^[A-Za-z0-9._ -]{1,20}$/.test(normalized);
  return { ok, normalized };
}

function assertValidResult(result) {
  if (result !== 'win' && result !== 'loss') {
    const err = new Error('Invalid result value');
    err.statusCode = 400;
    throw err;
  }
}

function validateCompletionTimeMs(completionTimeMs) {
  if (!Number.isInteger(completionTimeMs) || completionTimeMs < 0) {
    const err = new Error('completionTimeMs must be a non-negative integer');
    err.statusCode = 400;
    throw err;
  }
}

module.exports = {
  normalizePlayerName,
  validatePlayerName,
  assertValidResult,
  validateCompletionTimeMs
};


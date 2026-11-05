/**
 * Silverleaf score adapter: one group per substrand a lesson gave evidence for. A substrand with nothing observed is
 * left off the scorecard, because an empty bar would read as a poor score.
 */
function buildSilverleafGroups(a) {
  return ((a && a.substrand_scores) || [])
    .filter((s) => s.rated > 0)
    .map((s) => ({
      key: s.id, name: s.title, score: s.score, max: s.max, pct: Math.round((s.score / s.max) * 100),
    }));
}

module.exports = { buildSilverleafGroups };

/**
 * One lesson's full report, built from what the coaching pipeline already stored.
 *
 * It reads through the caller's scoped database client, so a partner's access scope applies here as it does on the
 * list. "Not observed" is kept apart from a low score throughout: a recording that could not show something is not
 * evidence against the teacher.
 */
const { getScoringConstants } = require('../../bot/shared/services/coaching/frameworks/silverleaf-framework');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getSessionReport(dbClient, sessionId) {
  if (!UUID_RE.test(String(sessionId))) return null;
  const { rows } = await dbClient.query(`
    SELECT cs.id, cs.status, cs.created_at, cs.audio_duration_seconds, cs.analysis_data, cs.conversation_state,
           u.first_name, u.last_name, u.school_name
    FROM coaching_sessions cs
    INNER JOIN users u ON cs.user_id = u.id
    WHERE cs.id = $1
  `, [sessionId]);
  return rows[0] || null;
}

function buildSubstrand(substrand, indicators, nameOf, levels) {
  const own = indicators.filter((i) => i.id.startsWith(`${substrand.id}.`));
  const rated = own.filter((i) => i.level !== null);
  const observed = substrand.rated > 0;
  return {
    id: substrand.id,
    title: substrand.title,
    observed,
    percentage: observed ? Math.round((substrand.score / substrand.max) * 100) : null,
    levelName: observed ? levels[Math.round(substrand.score / substrand.rated) - 1] : null,
    indicators: rated.map((i) => ({
      id: i.id, name: nameOf(i.id), level: i.level, levelName: levels[i.level - 1], evidence: i.evidence,
    })),
    notObserved: own.filter((i) => i.level === null).map((i) => nameOf(i.id)),
  };
}

function buildReportView(row) {
  const analysis = row.analysis_data || {};
  const state = row.conversation_state || {};
  const header = {
    teacher: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Teacher',
    school: row.school_name || null,
    date: row.created_at,
    durationSeconds: row.audio_duration_seconds,
    id: row.id,
    summary: analysis.executive_summary || null,
  };
  if (analysis.framework !== 'silverleaf' || !analysis.observation_record) return { ...header, available: false };

  const { indicators: rubric, levels } = getScoringConstants();
  const nameOf = (id) => (rubric.find((i) => i.id === id) || {}).name || id;
  const indicators = analysis.indicators || [];

  const strands = [];
  (analysis.substrand_scores || []).forEach((substrand) => {
    let strand = strands.find((s) => s.name === substrand.strand);
    if (!strand) {
      strand = { name: substrand.strand, substrands: [] };
      strands.push(strand);
    }
    strand.substrands.push(buildSubstrand(substrand, indicators, nameOf, levels));
  });

  return {
    ...header,
    available: true,
    topic: analysis.topic || null,
    subject: analysis.subject || null,
    scores: analysis.scores || {},
    record: analysis.observation_record,
    strands,
    reflection: (state.questions || []).filter((q) => q.answer).map((q) => ({ question: q.question, answer: q.answer })),
    videoStats: state.video_observation_stats || null,
    videoEvidence: state.video_observations || null,
  };
}

module.exports = { getSessionReport, buildReportView };

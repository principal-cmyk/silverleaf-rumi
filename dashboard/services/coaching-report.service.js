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
    SELECT cs.id, cs.user_id, cs.observation_type, cs.status, cs.created_at, cs.audio_duration_seconds,
           cs.analysis_data, cs.conversation_state,
           u.first_name, u.last_name, u.school_name, u.grades_taught, u.preferences
    FROM coaching_sessions cs
    INNER JOIN users u ON cs.user_id = u.id
    WHERE cs.id = $1
  `, [sessionId]);
  return rows[0] || null;
}

const TREND_LIMIT = 12;

/**
 * The teacher's Silverleaf lessons up to and including this one, oldest first, so the report shows progress as of
 * the lesson being read. Only lessons of the same kind are compared: a teacher's own recordings with each other, a
 * coach's observations with each other, because a coach's rating is a different measurement.
 */
async function getTeacherTrend(dbClient, row) {
  if (!row || !row.user_id) return [];
  const { rows } = await dbClient.query(`
    SELECT cs.id, cs.created_at, cs.analysis_data->'scores'->>'overall_percentage' AS pct,
           cs.analysis_data->'substrand_scores' AS substrand_scores
    FROM coaching_sessions cs
    WHERE cs.user_id = $1
      AND cs.observation_type IS NOT DISTINCT FROM $2
      AND cs.created_at <= $3
      AND cs.analysis_data->>'framework' = 'silverleaf'
      AND cs.analysis_data->'scores'->>'overall_percentage' IS NOT NULL
    ORDER BY cs.created_at DESC
    LIMIT ${TREND_LIMIT}
  `, [row.user_id, row.observation_type || null, row.created_at]);
  return rows.reverse();
}

/** Strand totals from substrand scores: only observed substrands count, so "not observed" never reads as zero. */
function strandTotals(substrandScores, levels) {
  const strands = [];
  (substrandScores || []).forEach((s) => {
    let strand = strands.find((x) => x.name === s.strand);
    if (!strand) {
      strand = { name: s.strand, score: 0, max: 0, rated: 0 };
      strands.push(strand);
    }
    if (s.rated > 0) {
      strand.score += s.score;
      strand.max += s.max;
      strand.rated += s.rated;
    }
  });
  return strands.map((s) => {
    const observed = s.rated > 0 && s.max > 0;
    return {
      name: s.name,
      observed,
      percentage: observed ? Math.round((s.score / s.max) * 100) : null,
      levelName: observed ? levels[Math.round(s.score / s.rated) - 1] || null : null,
    };
  });
}

const CHART = { width: 600, height: 220, left: 40, right: 16, top: 16, bottom: 36 };

/**
 * Geometry for the progress line, computed here so the view only prints escaped numbers. The y-axis is always
 * 0–100%: a zoomed axis would make a two-point wobble look like a collapse.
 */
function buildTrendChart(trendRows, currentId) {
  const points = (trendRows || [])
    .map((r) => ({ id: r.id, date: r.created_at, pct: Number(r.pct), substrands: r.substrand_scores }))
    .filter((p) => Number.isFinite(p.pct));
  if (points.length < 2) return { points: points.length, chart: null };

  const { levels } = getScoringConstants();
  const plotW = CHART.width - CHART.left - CHART.right;
  const plotH = CHART.height - CHART.top - CHART.bottom;
  const x = (i) => CHART.left + (points.length === 1 ? plotW / 2 : (i * plotW) / (points.length - 1));
  const y = (pct) => CHART.top + plotH - (Math.max(0, Math.min(100, pct)) / 100) * plotH;
  const label = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

  const marks = points.map((p, i) => ({
    x: Math.round(x(i) * 10) / 10,
    y: Math.round(y(p.pct) * 10) / 10,
    pct: Math.round(p.pct),
    label: label(p.date),
    current: p.id === currentId,
    tooltip: [`${label(p.date)}: ${Math.round(p.pct)}%`]
      .concat(strandTotals(p.substrands, levels).filter((s) => s.observed).map((s) => `${s.name} ${s.percentage}%`))
      .join('\n'),
  }));
  // Thin the date labels so they never collide: at most ~6 across the axis, always the first and last.
  const every = Math.ceil(marks.length / 6);
  marks.forEach((m, i) => { m.showLabel = i === 0 || i === marks.length - 1 || (i % every === 0 && i < marks.length - every / 2); });

  const first = marks[0].pct;
  const last = marks[marks.length - 1].pct;
  return {
    points: marks.length,
    change: last - first,
    chart: {
      ...CHART,
      marks,
      path: marks.map((m, i) => `${i ? 'L' : 'M'}${m.x} ${m.y}`).join(' '),
      gridlines: [0, 25, 50, 75, 100].map((v) => ({ value: v, y: Math.round(y(v) * 10) / 10 })),
    },
  };
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

function buildReportView(row, trendRows = []) {
  const analysis = row.analysis_data || {};
  const state = row.conversation_state || {};
  const header = {
    teacher: [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Teacher',
    school: row.school_name || null,
    classTaught: [row.grades_taught, row.preferences?.stream && `Stream ${row.preferences.stream}`].filter(Boolean).join(', ') || null,
    subject: state.subject || analysis.subject || null,
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
    scores: analysis.scores || {},
    record: analysis.observation_record,
    strands,
    strandSummary: strandTotals(analysis.substrand_scores, levels),
    trend: buildTrendChart(trendRows, row.id),
    reflection: (state.questions || []).filter((q) => q.answer).map((q) => ({ question: q.question, answer: q.answer })),
    videoStats: state.video_observation_stats || null,
    videoEvidence: state.video_observations || null,
  };
}

module.exports = { getSessionReport, getTeacherTrend, buildReportView };

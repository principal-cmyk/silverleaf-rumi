/**
 * Silverleaf report data transformer: the PDF fallback's generic shape, with substrands as goals and rated indicators
 * as criteria. The hero report is the normal path; this is what a teacher gets if it cannot render.
 */
const { formatDate, extractFidelity, buildPartialNote } = require('./_shared');
const { getScoringConstants } = require('../frameworks/silverleaf-framework');

function transformSilverleafToReportData(session, teacherName, analysis) {
  const { indicators: rubric, levelMax } = getScoringConstants();
  const nameOf = (id) => (rubric.find((i) => i.id === id) || {}).name || id;
  const rated = (analysis.indicators || []).filter((i) => i.level !== null);

  const goals = (analysis.substrand_scores || []).filter((s) => s.rated > 0).map((s) => ({
    title: `${s.id}: ${s.title}`,
    score: s.score,
    maxScore: s.max,
    criteria: rated.filter((i) => i.id.startsWith(`${s.id}.`)).map((i) => ({
      name: nameOf(i.id), score: i.level, max: levelMax, evidence: i.evidence, timestamp: null,
    })),
  }));

  return {
    teacherName,
    observationDate: formatDate(session.created_at),
    subject: session.lesson_plan_structured?.subject || analysis.subject || 'N/A',
    topic: session.lesson_plan_structured?.topic || analysis.topic || 'N/A',
    observerName: 'Rumi Digital Coach',
    frameworkDisplayName: 'Silverleaf Teacher Competency Framework',
    hasLessonPlan: !!(session.lesson_plan_structured || analysis.has_lesson_plan),
    totalScore: analysis.scores?.overall_marks || 0,
    maxScore: analysis.scores?.overall_max_marks || 0,
    priorFeedback: null,
    goals,
    debriefReflection: null,
    fidelitySection: extractFidelity(analysis),
    feedback: analysis.executive_summary || 'Analysis complete.',
    isPartialReport: session._isPartialReport || false,
    partialReportNote: buildPartialNote(session),
  };
}

module.exports = { transformSilverleafToReportData };

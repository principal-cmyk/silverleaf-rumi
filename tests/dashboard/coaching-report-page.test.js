'use strict';
/**
 * The full report for one lesson, built from what is already in the database. It has to be honest about what was not
 * observed, keep the same access rules as the rest of the coaching pages, and escape everything it shows.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../dashboard');
const { buildReportView, getSessionReport, getTeacherTrend } = require('../../dashboard/services/coaching-report.service');
const view = fs.readFileSync(path.join(root, 'views/coaching-report.ejs'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const list = fs.readFileSync(path.join(root, 'views/coaching.ejs'), 'utf8');

const row = (over = {}) => ({
  id: '9e5f6365-eae3-446a-8fe6-fe52f279c22b',
  created_at: '2026-11-05T19:57:46Z',
  audio_duration_seconds: 556,
  first_name: 'Asha', last_name: 'M', school_name: null,
  analysis_data: {
    framework: 'silverleaf',
    executive_summary: 'A warm lesson.',
    scores: { overall_percentage: 61.3, overall_marks: 92, overall_max_marks: 150, rated_indicators: 3, total_indicators: 31 },
    substrand_scores: [
      { id: '1A', title: 'Culture of Achievement', strand: 'Climate & Culture', score: 7, max: 10, rated: 2 },
      { id: '1B', title: 'Systems & Procedures', strand: 'Climate & Culture', score: 0, max: 0, rated: 0 },
      { id: '3A', title: 'Instructional Clarity', strand: 'Lesson Delivery', score: 2, max: 5, rated: 1 },
    ],
    indicators: [
      { id: '1A.i', level: 3, evidence: 'Clear directions at 02:10.' },
      { id: '1A.ii', level: 4, evidence: 'Most students engaged.' },
      { id: '1A.iii', level: null, evidence: '' },
      { id: '3A.i', level: 2, evidence: 'Goal not stated.' },
    ],
    observation_record: {
      action_step: 'Follow a monitoring pathway.', how: ['Scan'], category: 'Learning/Rigor', type: 'Whom to monitor',
      glows: ['A glow'], grows: ['A grow'], notes_for_teacher: 'Well done.', overall_level: 'Proficient',
    },
  },
  conversation_state: {
    video_observations: 'Counts from 19 readable stills:',
    video_observation_stats: { readable: 19, handsSeen: 0, handsJudged: 19 },
    questions: [{ question_number: 1, question: 'What made that successful?', answer: 'They felt proud.' }, { question_number: 2, question: 'Unanswered', answer: null }],
  },
  ...over,
});

describe('buildReportView', () => {
  test('names each indicator and its level on the school scale', () => {
    const [culture] = buildReportView(row()).strands;
    const indicator = culture.substrands[0].indicators[0];
    expect(indicator).toMatchObject({ id: '1A.i', name: 'Sets clear expectations', level: 3, levelName: 'Proficient' });
  });

  test('groups substrands under their strand', () => {
    expect(buildReportView(row()).strands.map((s) => s.name)).toEqual(['Climate & Culture', 'Lesson Delivery']);
  });

  test('a substrand gets its level from its own average', () => {
    const substrand = buildReportView(row()).strands[0].substrands[0];
    expect(substrand.levelName).toBe('Advanced');
    expect(substrand.percentage).toBe(70);
  });

  test('an indicator without evidence is listed as not observed, never scored', () => {
    const substrand = buildReportView(row()).strands[0].substrands[0];
    expect(substrand.notObserved).toEqual(['Responds to level of student engagement']);
    expect(substrand.indicators.map((i) => i.id)).not.toContain('1A.iii');
  });

  test('a substrand with nothing observed says so, rather than showing zero', () => {
    const substrand = buildReportView(row()).strands[0].substrands[1];
    expect(substrand.observed).toBe(false);
    expect(substrand.levelName).toBeNull();
  });

  test('carries the reflection, answered turns only', () => {
    expect(buildReportView(row()).reflection).toEqual([{ question: 'What made that successful?', answer: 'They felt proud.' }]);
  });

  test('a lesson from another framework has no full report, and says why', () => {
    const report = buildReportView(row({ analysis_data: { framework: 'oecd', executive_summary: 'Old.' } }));
    expect(report.available).toBe(false);
    expect(report.summary).toBe('Old.');
  });

  test('a lesson not yet analysed does not break', () => {
    expect(buildReportView(row({ analysis_data: null, conversation_state: null })).available).toBe(false);
  });
});

describe('the summary and progress charts', () => {
  test('each strand gets one score from its observed substrands only', () => {
    expect(buildReportView(row()).strandSummary).toEqual([
      { name: 'Climate & Culture', observed: true, percentage: 70, levelName: 'Advanced' },
      { name: 'Lesson Delivery', observed: true, percentage: 40, levelName: 'Novice' },
    ]);
  });

  test('a strand with nothing observed is not drawn as zero', () => {
    const r = row();
    r.analysis_data.substrand_scores[2] = { ...r.analysis_data.substrand_scores[2], score: 0, max: 0, rated: 0 };
    const delivery = buildReportView(r).strandSummary[1];
    expect(delivery).toMatchObject({ observed: false, percentage: null, levelName: null });
  });

  const trendRow = (id, date, pct) => ({ id, created_at: date, pct: String(pct), substrand_scores: row().analysis_data.substrand_scores });

  test('one lesson is not a trend', () => {
    const report = buildReportView(row(), [trendRow(row().id, row().created_at, 61.3)]);
    expect(report.trend.chart).toBeNull();
  });

  test('the progress line runs oldest to newest, marks this lesson, and keeps a 0–100 axis', () => {
    const report = buildReportView(row(), [
      trendRow('a', '2026-10-01T08:00:00Z', 40),
      trendRow('b', '2026-10-15T08:00:00Z', 100),
      trendRow(row().id, row().created_at, 61.3),
    ]);
    const { chart, change } = report.trend;
    expect(chart.marks.map((m) => m.pct)).toEqual([40, 100, 61]);
    expect(chart.marks.map((m) => m.current)).toEqual([false, false, true]);
    expect(change).toBe(21);
    expect(chart.gridlines.map((g) => g.value)).toEqual([0, 25, 50, 75, 100]);
    expect(chart.marks[1].y).toBe(chart.gridlines[4].y);
    expect(chart.marks[0].tooltip).toContain('Climate & Culture 70%');
  });
});

describe('getTeacherTrend', () => {
  test('reads the same teacher\'s lessons of the same kind, up to this one, through the scoped client', async () => {
    const db = { query: jest.fn(async () => ({ rows: [{ id: 'new' }, { id: 'old' }] })) };
    const r = { ...row(), user_id: 'u1', observation_type: null };
    const rows = await getTeacherTrend(db, r);
    expect(rows.map((x) => x.id)).toEqual(['old', 'new']);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toMatch(/observation_type IS NOT DISTINCT FROM \$2/);
    expect(sql).toMatch(/created_at <= \$3/);
    expect(params).toEqual(['u1', null, r.created_at]);
  });

  test('no teacher, no query', async () => {
    const db = { query: jest.fn() };
    await expect(getTeacherTrend(db, row())).resolves.toEqual([]);
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('getSessionReport', () => {
  test('uses the caller\'s scoped database client, so access scopes still apply', async () => {
    const db = { query: jest.fn(async () => ({ rows: [row()] })) };
    await getSessionReport(db, row().id);
    expect(db.query).toHaveBeenCalledWith(expect.stringMatching(/WHERE cs\.id = \$1/), [row().id]);
  });

  test('an unknown lesson is null', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) };
    await expect(getSessionReport(db, row().id)).resolves.toBeNull();
  });

  test('a malformed id never reaches the database', async () => {
    const db = { query: jest.fn() };
    await expect(getSessionReport(db, 'not-a-uuid')).resolves.toBeNull();
    expect(db.query).not.toHaveBeenCalled();
  });
});

describe('the page', () => {
  test('shows which grow the step came from, and flags a step for review', () => {
    expect(view).toContain('report.record.source_grow');
    expect(view).toContain('report.record.needs_review');
    const partial = fs.readFileSync(path.join(root, 'views/partials/observation-record.ejs'), 'utf8');
    expect(partial).toContain('record.needs_review');
  });

  test('keeps the same access rules as the coaching page', () => {
    const route = index.slice(index.indexOf("app.get('/observability/coaching/:sessionId/report'"));
    expect(route.slice(0, 200)).toMatch(/requireAuth,\s+requirePartnerAdmin,\s+requireFeatureAccess\('coaching'\)/);
    expect(route.slice(0, 700)).toContain('req.dbClient');
  });

  test('escapes everything: this text comes from a model and from what people said', () => {
    expect(view.replace(/<%- include\([^]*?%>/g, '')).not.toMatch(/<%-/);
  });

  test('downloads as a PDF through the print dialog, with folded sections opened and a named file', () => {
    expect(view).toMatch(/<button[^>]*data-on-click="printReport"[^>]*>[^<]*Download PDF/);
    expect(view).toContain('<script src="/js/csp-actions.js"></script>');
    const script = view.slice(view.indexOf('<script nonce="<%= cspNonce %>">'));
    expect(script).toContain("addEventListener('beforeprint'");
    expect(script).toContain("addEventListener('afterprint'");
    expect(view).toMatch(/@media print[^]*nav, \.rpt-noprint \{ display: none/);
  });

  test('the observation record downloads on its own: no charts, evidence or reflection', () => {
    expect(view).toMatch(/<button[^>]*data-on-click="printRecord"[^>]*>[^<]*Observation record/);
    expect(view).toMatch(/body\[data-print="record"\] \.rpt-report-only[^{]*\{ display: none/);
    // The element that opens each report-only part carries the class.
    for (const section of ['>Progress over time<', '>Evidence by indicator<', ">Teacher's reflection<", 'aria-label="Score by strand"']) {
      const at = view.indexOf(section);
      const opener = view.slice(Math.max(view.lastIndexOf('<section', at), view.lastIndexOf('<details', at), view.lastIndexOf('<div', at)), at);
      expect(opener).toContain('rpt-report-only');
    }
  });

  test('takes its colours, fonts and logo from the brand settings, naming no organisation itself', () => {
    for (const v of ['brand.colours.primary', 'brand.colours.accent', 'brand.colours.highlight', 'brand.colours.neutral', 'brand.fontHref']) {
      expect(view).toContain(v);
    }
    expect(view).toMatch(/<% if \(brand\.hasLogoOnDark\) \{ %>\s*<img[^>]*src="\/observability\/brand\/logo-on-dark"/);
    expect(view.toLowerCase()).not.toContain('silverleaf');
  });

  test('the logo route needs a sign-in and serves only the two configured logos', () => {
    const route = index.slice(index.indexOf("app.get('/observability/brand/"));
    expect(route.slice(0, 120)).toMatch(/\/observability\/brand\/:which\(logo\|logo-on-dark\)', requireAuth,/);
    expect(route.slice(0, 600)).toContain('logoFile(req.params.which)');
  });

  test('the coaching list links straight to both downloads', () => {
    expect(list).toContain('/report?download=record');
    expect(list).toContain('/report?download=report');
    expect(view).toContain("new URLSearchParams(window.location.search).get('download')");
  });

  test('is linked from the coaching list when a record exists', () => {
    expect(list).toMatch(/\/observability\/coaching\/<%= session\.id %>\/report/);
  });
});

'use strict';
/**
 * The full report for one lesson, built from what is already in the database. It has to be honest about what was not
 * observed, keep the same access rules as the rest of the coaching pages, and escape everything it shows.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../dashboard');
const { buildReportView, getSessionReport } = require('../../dashboard/services/coaching-report.service');
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
  test('keeps the same access rules as the coaching page', () => {
    const route = index.slice(index.indexOf("app.get('/observability/coaching/:sessionId/report'"));
    expect(route.slice(0, 200)).toMatch(/requireAuth,\s+requirePartnerAdmin,\s+requireFeatureAccess\('coaching'\)/);
    expect(route.slice(0, 700)).toContain('req.dbClient');
  });

  test('escapes everything: this text comes from a model and from what people said', () => {
    expect(view.replace(/<%- include\([^]*?%>/g, '')).not.toMatch(/<%-/);
  });

  test('is linked from the coaching list when a record exists', () => {
    expect(list).toMatch(/\/observability\/coaching\/<%= session\.id %>\/report/);
  });
});

'use strict';
/** The coaching page lists a session's results without fetching whole transcripts, and escapes everything it shows. */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../../dashboard');
const service = fs.readdirSync(path.join(root, 'services')).find((f) => f.startsWith('coaching-observability'));
const query = fs.readFileSync(path.join(root, 'services', service), 'utf8');
const partial = fs.readFileSync(path.join(root, 'views/partials/observation-record.ejs'), 'utf8');
const page = fs.readFileSync(path.join(root, 'views/coaching.ejs'), 'utf8');

test('the list fetches only the record and counts, not the whole analysis', () => {
  expect(query).toMatch(/analysis_data->'observation_record' AS observation_record/);
  expect(query).toMatch(/conversation_state->'video_observation_stats' AS video_stats/);
  expect(query).not.toMatch(/cs\.analysis_data,/);
});

test('the record survives the mapping from database row to page', async () => {
  const { getCoachingSessions } = require(path.join(root, 'services', service));
  const record = { action_step: 'Follow a monitoring pathway.' };
  const row = {
    id: 's1', observation_record: record, overall_percentage: '61.3', rated_indicators: '30', total_indicators: '31',
    video_stats: { readable: 19 }, first_name: 'A',
  };
  const db = { query: jest.fn(async (sql) => (/COUNT\(\*\)/.test(sql) ? { rows: [{ total: '1' }] } : { rows: [row] })) };
  const { sessions } = await getCoachingSessions(db, 1, 10);
  expect(sessions[0]).toMatchObject({
    observation_record: record, overall_percentage: '61.3', rated_indicators: '30', total_indicators: '31', video_stats: { readable: 19 },
  });
});

test('the coaching page shows the record for completed sessions', () => {
  expect(page).toMatch(/include\('partials\/observation-record'/);
});

test('every value is escaped: this text comes from a model and from what teachers said', () => {
  expect(partial).not.toMatch(/<%-/);
  expect(partial).toMatch(/<%=/);
});

test('sessions without a record show nothing, so older frameworks are unaffected', () => {
  expect(partial).toMatch(/if \(record && record\.action_step\)/);
});

test('video counts say how many moments they rest on', () => {
  expect(partial).toMatch(/teacherSeen/);
  expect(partial).toMatch(/readable/);
});

describe('filtering the coaching page', () => {
  const { getCoachingSessions } = require(path.join(root, 'services', service));

  /** Every $n in a query must have a value: Postgres refuses the query otherwise. */
  function expectPlaceholdersMatch(sql, params) {
    const used = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    expect(used.length === 0 ? 0 : Math.max(...used)).toBe(params.length);
    expect(new Set(used).size).toBe(params.length);
  }

  test.each([
    ['all', null, null], ['completed', null, null], ['failed', null, null], ['cancelled', null, null],
    ['in_progress', null, null], ['all', '2026-11-01', null], ['all', null, '2026-11-30'], ['completed', '2026-11-01', '2026-11-30'],
  ])('status %s, from %s, to %s sends a valid query', async (status, from, to) => {
    const calls = [];
    const db = { query: jest.fn(async (sql, params) => {
      calls.push([sql, params]);
      return /COUNT\(\*\)/.test(sql) ? { rows: [{ total: '0' }] } : { rows: [] };
    }) };
    await getCoachingSessions(db, 1, 10, status, from, to);
    expect(calls).toHaveLength(2);
    calls.forEach(([sql, params]) => expectPlaceholdersMatch(sql, params));
  });
});

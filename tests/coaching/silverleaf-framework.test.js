'use strict';
/**
 * A school's own rubric as the coaching framework: competency levels I-V, one GBF action step, and the fields of the
 * observation form. Evidence rules are enforced in code: a level with no evidence is not a level, and an action step
 * type must come from the school's own lists.
 */
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logWarn: jest.fn() }));

const framework = require('../../bot/shared/services/coaching/frameworks/silverleaf-framework');

const indicator = (id, level, evidence = 'At 02:10 the teacher said "pens down, eyes up".') => ({ id, level, evidence });
const analysis = (over = {}) => ({
  executive_summary: 'A warm lesson.',
  indicators: [indicator('1A.ii', 3), indicator('1C.iv', 2), indicator('3B.ii', 4), indicator('3C.iii', null, '')],
  action_step: {
    text: 'When circulating during independent practice, follow a planned monitoring pathway.',
    category: 'Learning/Rigor',
    type: 'Monitors learning throughout class',
    gbf_phase: 'Phase 2',
    gbf_skill: 'Monitor Aggressively',
    rationale: 'Back rows were not checked.',
    grow_number: 1,
  },
  glows: ['Glow one', 'Glow two', 'Glow three'],
  grows: ['Grow one', 'Grow two'],
  notes_for_teacher: 'You brought real warmth to this lesson.',
  ...over,
});

describe('the framework contract', () => {
  test('is registered and selectable', () => {
    const { getFramework, listFrameworks } = require('../../bot/shared/services/coaching/frameworks/framework-registry');
    expect(listFrameworks()).toContain('silverleaf');
    expect(getFramework('silverleaf').name).toBe('silverleaf');
  });

  test('exposes what analyzePedagogy needs and asks for JSON', () => {
    ['getSystemPrompt', 'buildAnalysisPrompt', 'computeScores'].forEach((m) => expect(typeof framework[m]).toBe('function'));
    expect(framework.jsonMode).toBe(true);
  });

  test('has a report renderer, score adapter and transformer', () => {
    const { getReportRenderer } = require('../../bot/shared/services/coaching/report-renderers/renderer-registry');
    const { getScoreAdapter } = require('../../bot/shared/services/coaching/report-v2/score-adapters/dispatch');
    expect(getReportRenderer('silverleaf').key).toBe('hero');
    const scored = framework.computeScores(analysis());
    const groups = getScoreAdapter('silverleaf')(scored, 'en');
    expect(groups.length).toBeGreaterThan(0);
    groups.forEach((g) => expect(g).toEqual(expect.objectContaining({ key: expect.any(String), name: expect.any(String) })));
  });
});

describe('the rubric', () => {
  const prompt = framework.getSystemPrompt();

  test.each([['1A'], ['1B'], ['1C'], ['3A'], ['3B'], ['3C'], ['3D'], ['4A']])('covers substrand %s', (id) => {
    expect(prompt).toContain(id);
  });

  test('uses the school scale', () => {
    ['Pre-Novice', 'Novice', 'Proficient', 'Advanced', 'Exceptional'].forEach((l) => expect(prompt).toContain(l));
  });

  test('leaves out planning, which a recording cannot show', () => {
    expect(prompt).not.toMatch(/2A\b.*Planning Lesson Vision/i);
    expect(framework.getScoringConstants().substrands.map((s) => s.id)).toEqual(['1A', '1B', '1C', '3A', '3B', '3C', '3D', '4A']);
  });

  test('carries the GBF action step rules and both type lists', () => {
    expect(prompt).toMatch(/WILL DO/);
    expect(prompt).toMatch(/one sentence or two short sentences/i);
    expect(prompt).toContain('Responds to level of student engagement');
    expect(prompt).toContain('Reteaches based on gaps in student learning');
    expect(prompt).toMatch(/Teacher Radar/);
    expect(prompt).toMatch(/Monitor Aggressively/);
  });

  test('speaks to the teacher, and sets a hard limit on the action step', () => {
    expect(prompt).toMatch(/address the teacher as "you"/i);
    expect(prompt).toMatch(/35 words/);
  });

  test('never calls the checklist photos', () => {
    expect(prompt).toMatch(/sampled moments/);
  });

  test('contains nobody\'s email address', () => {
    expect(prompt).not.toMatch(/@/);
  });
});

describe('computeScores', () => {
  test('averages only the indicators that were observed', () => {
    const { scores } = framework.computeScores(analysis());
    expect(scores.rated_indicators).toBe(3);
    expect(scores.overall_marks).toBe(9);
    expect(scores.overall_max_marks).toBe(15);
    expect(scores.overall_percentage).toBe(60);
  });

  test('a level with no evidence is dropped: every rating must rest on something seen', () => {
    const { scores } = framework.computeScores(analysis({ indicators: [indicator('1A.ii', 5, ''), indicator('1C.iv', 3)] }));
    expect(scores.rated_indicators).toBe(1);
  });

  test.each([[0], [6], ['3'], [2.5]])('a level outside I-V (%p) is dropped', (level) => {
    expect(framework.computeScores(analysis({ indicators: [indicator('1A.ii', level)] })).scores.rated_indicators).toBe(0);
  });

  test('an indicator the rubric does not contain is dropped', () => {
    expect(framework.computeScores(analysis({ indicators: [indicator('9Z.i', 4)] })).scores.rated_indicators).toBe(0);
  });

  test('nothing observed scores nothing, rather than dividing by zero', () => {
    expect(framework.computeScores(analysis({ indicators: [] })).scores.overall_percentage).toBe(0);
  });

  test('names the overall level on the school scale', () => {
    expect(framework.computeScores(analysis()).observation_record.overall_level).toBe('Proficient');
  });
});

describe('the observation record', () => {
  const record = (over) => framework.computeScores(analysis(over)).observation_record;

  test('holds the form fields', () => {
    expect(record()).toMatchObject({
      action_step: expect.stringContaining('monitoring pathway'),
      category: 'Learning/Rigor',
      type: 'Monitors learning throughout class',
      glows: expect.any(Array),
      grows: expect.any(Array),
      notes_for_teacher: expect.stringContaining('warmth'),
    });
  });

  test('a type outside the school list becomes Other', () => {
    expect(record({ action_step: { text: 'x', category: 'Learning/Rigor', type: 'Made up' } }).type).toBe('Other');
  });

  test('a type from the other category\'s list becomes Other', () => {
    expect(record({ action_step: { text: 'x', category: 'Learning/Rigor', type: 'Responds to misbehavior' } }).type).toBe('Other');
  });

  test('an unknown category is not guessed', () => {
    expect(record({ action_step: { text: 'x', category: 'Vibes' } }).category).toBeNull();
  });

  test('a GBF skill from the other trajectory is dropped: a live run called a monitoring pathway Teacher Radar', () => {
    const r = record({ action_step: { text: 'x', category: 'Learning/Rigor', type: 'Monitors learning throughout class', gbf_skill: 'Teacher Radar' } });
    expect(r.gbf_skill).toBeNull();
  });

  test('a GBF skill from the right trajectory is kept, whatever its detail', () => {
    const r = record({ action_step: { text: 'x', category: 'Learning/Rigor', gbf_skill: 'Monitor Aggressively: monitoring pathway' } });
    expect(r.gbf_skill).toBe('Monitor Aggressively');
  });

  test('strips numbering a model added, which the teacher message would number again', () => {
    const r = record({ glows: ['1) A glow'], grows: ['2. A grow', '3 - Another', 'Grade 4 pupils were unsure'] });
    expect(r.glows).toEqual(['A glow']);
    expect(r.grows).toEqual(['A grow', 'Another', 'Grade 4 pupils were unsure']);
  });

  test('keeps to the form limits: at most 5 glows and 3 grows', () => {
    const r = record({ glows: Array(9).fill('g'), grows: Array(9).fill('g') });
    expect(r.glows).toHaveLength(5);
    expect(r.grows).toHaveLength(3);
  });

  test('the report side gets the shapes it already reads', () => {
    const scored = framework.computeScores(analysis());
    expect(scored.strengths[0]).toEqual(expect.objectContaining({ title: 'Glow one' }));
    expect(scored.growth_opportunities[0]).toEqual(expect.objectContaining({ observation: 'Grow one' }));
    expect(scored.recommendations[0]).toContain('monitoring pathway');
  });
});

describe('the action step', () => {
  const GOOD = 'During independent practice, check the back row first using a planned monitoring pathway.';
  const step = (text, over = {}) => ({ text, category: 'Learning/Rigor', type: 'Other', grow_number: 1, ...over });
  const scored = (text, over) => framework.computeScores(analysis({ action_step: step(text, over) }));
  const revision = (over = {}) => JSON.stringify({ grow_number: 2, action_step: GOOD, how: ['Start at the back'], ...over });

  describe('must be drawn from the grows', () => {
    test('the grow it comes from moves to first place and is recorded', () => {
      const r = scored(GOOD, { grow_number: 2 }).observation_record;
      expect(r.source_grow).toBe('Grow two');
      expect(r.grows).toEqual(['Grow two', 'Grow one']);
    });

    test('the report shapes follow that order', () => {
      expect(scored(GOOD, { grow_number: 2 }).growth_opportunities[0].observation).toBe('Grow two');
    });

    test.each([[undefined], [0], [3], ['1'], [1.5]])('grow_number %p names no grow, so the step goes back', (n) => {
      const a = scored(GOOD, { grow_number: n });
      expect(a.observation_record.source_grow).toBeNull();
      expect(framework.revisionPrompt(a)).toMatch(/Grow one/);
    });

    test('the prompt requires it, and asks for the grows first', () => {
      expect(framework.getSystemPrompt()).toMatch(/drawn from one of the grows/i);
      const prompt = framework.buildAnalysisPrompt('t');
      expect(prompt.indexOf('"grows"')).toBeLessThan(prompt.indexOf('"action_step"'));
      expect(prompt).toContain('"grow_number"');
    });
  });

  describe('must be a single move', () => {
    test.each([
      ['During whole-class practice, use a short monitoring pathway: scan and note answers from three students across the room (left, middle, right), quickly mark one common error, and praise one correct approach before reteaching.'],
      ['During each 30-second partner rehearsal, follow a short monitoring pathway: scan, listen to three students, give one quick correction, then cold-call a partner to repeat.'],
      ['Check the back row; then reteach the error.'],
      ['Check three students and then reteach.'],
    ])('rejects a chain: %s', (text) => {
      expect(framework.isSingleMove(text)).toBe(false);
    });

    test.each([
      [GOOD],
      ['After every example, cold-call three students across the room.'],
      ['During independent practice, circulate to the back row first.'],
    ])('accepts one move: %s', (text) => {
      expect(framework.isSingleMove(text)).toBe(true);
    });

    test('the prompt asks for one move and puts the rest in the How', () => {
      expect(framework.getSystemPrompt()).toMatch(/single high-leverage/i);
      expect(framework.getSystemPrompt()).toMatch(/How/);
    });
  });

  describe('when it breaks a rule', () => {
    const long = `During practice ${'check every student '.repeat(14)}`;

    test('a good step needs no revision and no review', () => {
      const a = scored(GOOD);
      expect(framework.revisionPrompt(a)).toBeNull();
      expect(a.observation_record.needs_review).toBe(false);
    });

    test('it is sent back with the rules and the grows', () => {
      const prompt = framework.revisionPrompt(scored(long));
      expect(prompt).toMatch(/35 words/);
      expect(prompt).toContain('During practice');
      expect(prompt).toContain('1. Grow one');
      expect(prompt).toMatch(/never with the word "Teacher"/);
    });

    test('it is flagged until fixed', () => {
      expect(scored(long).observation_record.needs_review).toBe(true);
    });

    test('a good revision replaces it everywhere, follows the grow it names, and takes its How', () => {
      const a = framework.applyRevision(scored(long), revision());
      expect(a.observation_record).toMatchObject({
        action_step: GOOD, source_grow: 'Grow two', how: ['Start at the back'], needs_review: false,
      });
      expect(a.observation_record.grows[0]).toBe('Grow two');
      expect(a.recommendations[0]).toBe(GOOD);
      expect(a.growth_opportunities[0].strategies[0]).toBe(GOOD);
    });

    test('a fenced reply still works', () => {
      expect(framework.applyRevision(scored(long), `\`\`\`json\n${revision()}\n\`\`\``).observation_record.action_step).toBe(GOOD);
    });

    test.each([
      ['still too long', () => revision({ action_step: long })],
      ['still a chain', () => revision({ action_step: 'Check three students, then reteach.' })],
      ['names no grow', () => revision({ grow_number: 9 })],
      ['is not JSON', () => 'Just check the students.'],
      ['is empty', () => '  '],
    ])('a revision that %s changes nothing and stays flagged', (_, reply) => {
      const a = framework.applyRevision(scored(long), reply());
      expect(a.observation_record.action_step).toBe(long.trim());
      expect(a.observation_record.needs_review).toBe(true);
    });
  });
});

describe('sending a step back', () => {
  test('tries twice, and stops as soon as it is fixed', async () => {
    jest.resetModules();
    jest.doMock('../../bot/shared/config/supabase', () => ({}));
    jest.doMock('jsonrepair', () => ({ jsonrepair: (s) => s }), { virtual: true });
    const good = JSON.stringify({ grow_number: 1, action_step: 'After every example, cold-call three students.', how: [] });
    const replies = [
      JSON.stringify(analysis({ action_step: { text: 'Check three students, then reteach.', category: 'Learning/Rigor', type: 'Other', grow_number: 1 } })),
      'not json', good,
    ];
    const usage = { prompt_tokens: 1, completion_tokens: 1 };
    const create = jest.fn(async () => ({ choices: [{ message: { content: replies.shift() }, finish_reason: 'stop' }], usage }));
    jest.doMock('../../bot/shared/services/llm-client', () => ({ getClient: () => ({ chat: { completions: { create } } }) }));
    const GPT5 = require('../../bot/shared/services/gpt5-mini.service');
    GPT5.openai = { chat: { completions: { create } } };
    const fw = require('../../bot/shared/services/coaching/frameworks/silverleaf-framework');
    const { analysis: out } = await GPT5.analyzePedagogy('transcript', {}, null, fw);
    expect(create).toHaveBeenCalledTimes(3);
    expect(out.observation_record.action_step).toBe('After every example, cold-call three students.');
    expect(out.observation_record.needs_review).toBe(false);
  });
});

describe('the teacher messages', () => {
  test('give the action step, glows, grows and note, in that order', () => {
    const [message] = framework.reportChatMessages(framework.computeScores(analysis()));
    const at = ['Action step', 'Glows', 'Grows', 'Glow one', 'Grow one'].map((w) => message.indexOf(w));
    at.forEach((i) => expect(i).toBeGreaterThan(-1));
    expect(message.indexOf('Action step')).toBeLessThan(message.indexOf('Glows'));
    expect(framework.reportChatMessages(framework.computeScores(analysis())).join('\n')).toContain('real warmth');
  });

  test('stay within what WhatsApp will deliver', () => {
    const long = 'x'.repeat(900);
    framework.reportChatMessages(framework.computeScores(analysis({ glows: Array(5).fill(long), grows: Array(3).fill(long) })))
      .forEach((m) => expect(m.length).toBeLessThanOrEqual(4000));
  });
});

describe('the record survives the rest of the pipeline', () => {
  test('the reflection rewrite leaves this framework\'s analysis alone', async () => {
    jest.resetModules();
    jest.doMock('../../bot/shared/config/supabase', () => ({}));
    jest.doMock('jsonrepair', () => ({ jsonrepair: (s) => s }), { virtual: true });
    const create = jest.fn();
    jest.doMock('../../bot/shared/services/llm-client', () => ({
      getClient: () => ({ chat: { completions: { create } } }),
    }));
    const GPT5 = require('../../bot/shared/services/gpt5-mini.service');
    GPT5.openai = { chat: { completions: { create } } };
    const data = { framework: 'silverleaf', observation_record: { action_step: 'x' } };
    const out = await GPT5.enhanceAnalysisWithReflections(data, 't', { questions: [{ question_number: 1, question: 'q', answer: 'a' }] });
    expect(out).toBe(data);
    expect(create).not.toHaveBeenCalled();
  });

  test('the commitment card carries the coach\'s one action step, not a second one', async () => {
    jest.resetModules();
    const create = jest.fn(async () => ({
      choices: [{ message: { content: JSON.stringify({ commitment: 'I will check every row.', action: 'A different step.', highlights: [], lesson_label: 'Maths' }) } }],
    }));
    jest.doMock('../../bot/shared/services/gpt5-mini.service', () => ({ openai: { chat: { completions: { create } } } }));
    jest.doMock('../../bot/shared/services/coaching/coaching-card/prioritized-action.service', () => ({ generatePrioritizedAction: jest.fn() }));
    const { generateCommitmentCard } = require('../../bot/shared/services/coaching/coaching-card/commitment-card.service');
    const card = await generateCommitmentCard(
      { framework: 'silverleaf', observation_record: { action_step: 'Follow a planned monitoring pathway.' } },
      { questions: [{ question_number: 3, question: 'q', answer: 'I will check the back rows.' }] },
    );
    expect(card.action).toBe('Follow a planned monitoring pathway.');
    expect(card.commitment).toBe('I will check every row.');
  });
});

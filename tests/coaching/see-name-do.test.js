'use strict';
/**
 * The school's post-observation script as the reflection: See It, Name It, Do It, one WhatsApp turn at a time. Other
 * frameworks keep their three questions. The action step the teacher hears is the coach's exact one, never a rewording.
 */
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logWarn: jest.fn() }));

const seeNameDo = require('../../bot/shared/services/coaching/reflective-questions/see-name-do');
const { buildQuestionPrompt } = require('../../bot/shared/services/coaching/reflective-questions/question-prompt');
const { resolveProfile } = require('../../bot/shared/services/coaching/reflective-questions/language-profiles');
const framework = require('../../bot/shared/services/coaching/frameworks/silverleaf-framework');

const record = {
  action_step: 'Follow a planned monitoring pathway during independent practice.',
  how: ['Start with the fastest writers', 'Move to students who need support'],
  glows: ['You praised Lucy.'], grows: ['Back rows were not checked.'],
};
const context = { record, priorActionStep: null };

describe('the conversation', () => {
  test('is four turns and takes the commitment from the Do It answer', () => {
    expect(seeNameDo.numQuestions).toBe(4);
    expect(seeNameDo.commitmentQuestion).toBe(4);
  });

  test('See the Success names a win and asks why it worked', () => {
    const beat = seeNameDo.beat(1, context);
    expect(beat).toMatch(/SEE THE SUCCESS/);
    expect(beat).toMatch(/what made that successful/i);
    expect(beat).toMatch(/impact/i);
  });

  test('See the Success opens with last time\'s goal when there was one', () => {
    const beat = seeNameDo.beat(1, { record, priorActionStep: 'Use a what-to-do direction.' });
    expect(beat).toContain('Use a what-to-do direction.');
    expect(beat).toMatch(/we set a goal/i);
  });

  test('with no prior goal it does not invent one', () => {
    expect(seeNameDo.beat(1, context)).not.toMatch(/we set a goal/i);
    expect(seeNameDo.beat(1, context)).toMatch(/do not mention a goal/i);
  });

  test('See the Gap asks for the exemplar, then the gap, and keeps the action step back', () => {
    const beat = seeNameDo.beat(2, context);
    expect(beat).toMatch(/SEE THE GAP/);
    expect(beat).toMatch(/ideally/i);
    expect(beat).toMatch(/gap/i);
    expect(beat).toMatch(/do not name the action step/i);
    expect(beat).toMatch(/first grow/i);
  });

  test('Name It lets the teacher name it first', () => {
    const beat = seeNameDo.beat(3, context);
    expect(beat).toMatch(/NAME IT/);
    expect(beat).toMatch(/what do you think your action step should be/i);
    expect(beat).not.toContain(record.action_step);
  });

  test('Do It plans where and scripts the words, and prepares for a challenge', () => {
    const beat = seeNameDo.beat(4, context);
    expect(beat).toMatch(/DO IT/);
    expect(beat).toMatch(/upcoming lesson/i);
    expect(beat).toMatch(/do and say/i);
    expect(beat).toMatch(/what will you do if/i);
  });
});

describe('Punch it', () => {
  test('comes just before Do It, with the exact step, What and How', () => {
    const message = seeNameDo.beforeQuestion(4, record);
    expect(message).toContain(record.action_step);
    expect(message).toContain('1. Start with the fastest writers');
    expect(seeNameDo.beforeQuestion(3, record)).toBeNull();
  });

  test('still works when no How was written', () => {
    expect(seeNameDo.beforeQuestion(4, { ...record, how: [] })).toContain(record.action_step);
  });

  test('says nothing rather than an empty step', () => {
    expect(seeNameDo.beforeQuestion(4, {})).toBeNull();
  });
});

describe('Follow up', () => {
  test('tells the teacher what will be looked for next time', () => {
    expect(seeNameDo.closing(record)).toContain(record.action_step);
    expect(seeNameDo.closing(record)).toMatch(/next lesson/i);
  });
});

describe('the question prompt', () => {
  const en = resolveProfile('en');

  test('takes the beat it is given', () => {
    expect(buildQuestionPrompt(2, {}, en, '', { beat: 'A CUSTOM BEAT' })).toContain('A CUSTOM BEAT');
  });

  test('keeps its own beats for everyone else', () => {
    expect(buildQuestionPrompt(1, {}, en, '')).toMatch(/MARKED NOTICING/);
  });
});

describe('the framework', () => {
  test('carries the model, and the How, and tells the card which question holds the commitment', () => {
    expect(framework.reflection).toBe(seeNameDo);
    const scored = framework.computeScores({
      indicators: [],
      action_step: { text: 'x', how: ['one', 'two', 'three', 'four'], category: 'Learning/Rigor' },
    });
    expect(scored.observation_record.how).toEqual(['one', 'two', 'three']);
    expect(scored.observation_record.commitment_question).toBe(4);
  });

  test('asks for the How', () => {
    expect(framework.buildAnalysisPrompt('t')).toContain('"how"');
  });
});

describe('the commitment card', () => {
  test('reads the Do It answer, and defaults to question 3 for everyone else', () => {
    const { extractQ3 } = require('../../bot/shared/services/coaching/coaching-card/commitment-card.service');
    const state = { questions: [
      { question_number: 3, answer: 'A named step.' }, { question_number: 4, answer: 'I will walk the back row first.' },
    ] };
    expect(extractQ3(state, 4).answer).toBe('I will walk the back row first.');
    expect(extractQ3(state).answer).toBe('A named step.');
  });
});

describe('the conversation flow', () => {
  const answered = (n) => Array.from({ length: n }, (_, i) => ({ question_number: i + 1, question: 'q', answer: 'a' }));
  const mockSession = {};
  const mockWhatsApp = { sendAudio: jest.fn(async () => true), sendMessage: jest.fn(async () => true) };
  const mockState = { updateConversationState: jest.fn(async () => ({})), updateStatus: jest.fn(async () => ({})) };
  const mockQueue = { queueReport: jest.fn(async () => 'id') };
  const mockGenerate = jest.fn(async () => 'What made that work?');

  beforeAll(() => {
    jest.resetModules();
    jest.doMock('../../bot/shared/config/supabase', () => {
      const chain = {
        select: () => chain, eq: () => chain, neq: () => chain, order: () => chain,
        limit: async () => ({ data: [] }), maybeSingle: async () => ({ data: null }),
        single: async () => ({ data: mockSession, error: null }),
      };
      return { from: () => chain };
    });
    jest.doMock('../../bot/shared/services/coaching/own-coaching', () => ({ ownCoaching: (q) => q }));
    jest.doMock('../../bot/shared/services/whatsapp.service', () => mockWhatsApp);
    jest.doMock('../../bot/shared/services/elevenlabs.service', () => ({ generateSpeechForLanguage: jest.fn(async () => { throw new Error('no voice'); }) }));
    jest.doMock('../../bot/shared/services/coaching/coaching-session.service', () => mockState);
    jest.doMock('../../bot/shared/services/coaching/coaching-job-queue.service', () => mockQueue);
    jest.doMock('../../bot/shared/services/gpt5-mini.service', () => ({ _generateReflectiveQuestionV12: mockGenerate }));
    jest.doMock('../../bot/shared/utils/language-cache', () => ({
      getUserLanguage: jest.fn(async () => 'en'), setUserLanguage: jest.fn(async () => true),
    }));
  });

  beforeEach(() => jest.clearAllMocks());

  const service = () => require('../../bot/shared/services/coaching/reflective-conversation.service');
  const load = (framework_, done, record_ = record) => Object.assign(mockSession, {
    user_id: 'u1', transcript_text: 't',
    analysis_data: { framework: framework_, reflective_corpus: { a: 1 }, observation_record: framework_ === 'silverleaf' ? record_ : undefined },
    conversation_state: { current_state: `REFLECTIVE_QUESTION_${done}`, questions: [...answered(done - 1), { question_number: done, question: 'q', answer: null }] },
  });

  test('after the third answer the Silverleaf conversation goes on, Punch it first', async () => {
    load('silverleaf', 3);
    await service().handleReflectiveResponse('cs1', '255700000000', 'I should check the back.');
    expect(mockQueue.queueReport).not.toHaveBeenCalled();
    expect(mockWhatsApp.sendMessage.mock.calls[0][1]).toContain(record.action_step);
    expect(mockGenerate).toHaveBeenCalled();
    expect(mockGenerate.mock.calls[0][5].beat).toMatch(/DO IT/);
  });

  test('after the fourth answer it follows up and goes to the report', async () => {
    load('silverleaf', 4);
    await service().handleReflectiveResponse('cs1', '255700000000', 'I will say eyes on your work.');
    expect(mockWhatsApp.sendMessage.mock.calls.map((c) => c[1]).join(' ')).toMatch(/next lesson/i);
    expect(mockQueue.queueReport).toHaveBeenCalled();
  });

  test('every other framework still stops at three', async () => {
    load('oecd', 3);
    await service().handleReflectiveResponse('cs1', '255700000000', 'answer');
    expect(mockQueue.queueReport).toHaveBeenCalled();
  });
});

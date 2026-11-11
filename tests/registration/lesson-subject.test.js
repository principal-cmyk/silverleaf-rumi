'use strict';
/** Subject belongs to a lesson, not a teacher: it is asked when a feature needs it, and only then. */
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logWarn: jest.fn() }));
const mockSessions = [];
const mockUpdates = [];
jest.mock('../../bot/shared/config/supabase', () => {
  const chain = {
    select: () => chain, eq: () => chain, filter: () => chain, order: () => chain,
    limit: async () => ({ data: mockSessions, error: null }),
    update: (row) => { mockUpdates.push(row); return { eq: async () => ({ error: null }) }; },
  };
  return { from: () => chain };
});
const mockSend = jest.fn(async () => true);
jest.mock('../../bot/shared/services/whatsapp.service', () => ({ sendMessage: mockSend }));
const mockQueue = { queueTranscription: jest.fn(async () => 'id') };
jest.mock('../../bot/shared/services/coaching/coaching-job-queue.service', () => mockQueue);
const mockStore = new Map();
jest.mock('../../bot/shared/services/cache/railway-redis.service', () => ({
  set: jest.fn(async (k, v) => mockStore.set(k, v)), get: jest.fn(async (k) => mockStore.get(k) || null), delete: jest.fn(async (k) => mockStore.delete(k)),
}));

const Subject = require('../../bot/shared/services/lesson-subject.service');

const session = () => ({ id: 'cs1', audio_id: 'm1', conversation_state: { current_state: 'AWAITING_SUBJECT', questions: [] } });

beforeEach(() => {
  jest.clearAllMocks();
  mockSessions.length = 0;
  mockUpdates.length = 0;
  mockStore.clear();
  process.env.REGISTER_ON_FIRST_USE = 'true';
});
afterEach(() => { delete process.env.REGISTER_ON_FIRST_USE; });

describe('coaching', () => {
  test('after confirming, it asks the subject and waits to transcribe', async () => {
    await expect(Subject.askForCoaching({ id: 'cs1', conversation_state: {} }, '255700000000')).resolves.toBe(true);
    expect(mockSend.mock.calls[0][1]).toMatch(/subject/i);
    expect(mockUpdates[0].conversation_state.current_state).toBe('AWAITING_SUBJECT');
  });

  test('off, it does not ask', async () => {
    delete process.env.REGISTER_ON_FIRST_USE;
    await expect(Subject.askForCoaching({ id: 'cs1', conversation_state: {} }, '255700000000')).resolves.toBe(false);
  });

  test('the answer is kept on the lesson, and transcription starts', async () => {
    mockSessions.push(session());
    await expect(Subject.handleCoachingReply({ id: 'u1' }, '255700000000', 'maths')).resolves.toBe(true);
    expect(mockUpdates[0].conversation_state).toMatchObject({ subject: 'Mathematics', current_state: 'TRANSCRIBING' });
    expect(mockQueue.queueTranscription).toHaveBeenCalledWith('cs1', { from: '255700000000', audioId: 'm1' });
  });

  test('a subject that is not on the usual list is still accepted', async () => {
    mockSessions.push(session());
    await Subject.handleCoachingReply({ id: 'u1' }, '255700000000', 'Vocational Skills');
    expect(mockUpdates[0].conversation_state.subject).toBe('Vocational Skills');
  });

  test.each([['Hi'], ['ok'], ['/menu'], ['x'.repeat(70)]])('%s is asked again and transcription waits', async (reply) => {
    mockSessions.push(session());
    await expect(Subject.handleCoachingReply({ id: 'u1' }, '255700000000', reply)).resolves.toBe(true);
    expect(mockQueue.queueTranscription).not.toHaveBeenCalled();
    expect(mockSend.mock.calls[0][1]).toMatch(/subject/i);
  });

  test('off, it never looks: ordinary messages must not depend on this', async () => {
    delete process.env.REGISTER_ON_FIRST_USE;
    mockSessions.push(session());
    await expect(Subject.handleCoachingReply({ id: 'u1' }, '255700000000', 'maths')).resolves.toBe(false);
    expect(mockQueue.queueTranscription).not.toHaveBeenCalled();
  });

  test('a database failure never stops the message', async () => {
    const supabase = require('../../bot/shared/config/supabase');
    const spy = jest.spyOn(supabase, 'from').mockImplementationOnce(() => { throw new Error('db down'); });
    await expect(Subject.handleCoachingReply({ id: 'u1' }, '255700000000', 'maths')).resolves.toBe(false);
    spy.mockRestore();
  });

  test('with no lesson waiting, the message carries on as normal', async () => {
    await expect(Subject.handleCoachingReply({ id: 'u1' }, '255700000000', 'maths')).resolves.toBe(false);
  });
});

describe('lesson plans', () => {
  test('a request naming no subject is held, and the subject asked', async () => {
    await expect(Subject.holdLessonPlan({ id: 'u1' }, '255700000000', 'lesson plan on fractions')).resolves.toBe(true);
    expect(mockSend.mock.calls[0][1]).toMatch(/subject/i);
  });

  test.each([['lesson plan for maths on fractions'], ['Kiswahili lesson plan on nouns'], ['Create a science lesson plan']])('%s already names one', async (message) => {
    await expect(Subject.holdLessonPlan({ id: 'u1' }, '255700000000', message)).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('the reply brings the original request back, with the subject', async () => {
    await Subject.holdLessonPlan({ id: 'u1' }, '255700000000', 'lesson plan on fractions');
    await expect(Subject.resumeLessonPlan({ id: 'u1' }, 'maths')).resolves.toBe('lesson plan on fractions (Subject: Mathematics)');
  });

  test('the held request is only used once', async () => {
    await Subject.holdLessonPlan({ id: 'u1' }, '255700000000', 'lesson plan on fractions');
    await Subject.resumeLessonPlan({ id: 'u1' }, 'maths');
    await expect(Subject.resumeLessonPlan({ id: 'u1' }, 'maths')).resolves.toBeNull();
  });

  test('the resumed request is not asked again', async () => {
    await expect(Subject.holdLessonPlan({ id: 'u1' }, '255700000000', 'lesson plan on fractions (Subject: Mathematics)')).resolves.toBe(false);
  });

  test('off, it never holds a request', async () => {
    delete process.env.REGISTER_ON_FIRST_USE;
    await expect(Subject.holdLessonPlan({ id: 'u1' }, '255700000000', 'lesson plan on fractions')).resolves.toBe(false);
  });

  test('off, nothing is resumed', async () => {
    await Subject.holdLessonPlan({ id: 'u1' }, '255700000000', 'lesson plan on fractions');
    delete process.env.REGISTER_ON_FIRST_USE;
    await expect(Subject.resumeLessonPlan({ id: 'u1' }, 'maths')).resolves.toBeNull();
  });

  test('a command is not taken as the subject, and drops the held request', async () => {
    await Subject.holdLessonPlan({ id: 'u1' }, '255700000000', 'lesson plan on fractions');
    await expect(Subject.resumeLessonPlan({ id: 'u1' }, '/menu')).resolves.toBeNull();
    await expect(Subject.resumeLessonPlan({ id: 'u1' }, 'maths')).resolves.toBeNull();
  });
});

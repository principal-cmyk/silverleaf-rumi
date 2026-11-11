'use strict';
/**
 * Registration before anything else: name, grade and stream, one WhatsApp question at a time. Subject is not here,
 * because a teacher can teach several. It is asked for each lesson, by the feature using it.
 */
jest.mock('../../bot/shared/utils/logger', () => ({ logToFile: jest.fn(), logWarn: jest.fn() }));
const mockUpdates = [];
jest.mock('../../bot/shared/config/supabase', () => ({
  from: () => ({ update: (row) => { mockUpdates.push(row); return { eq: async () => ({ error: null }) }; } }),
}));
const mockSend = jest.fn(async () => true);
jest.mock('../../bot/shared/services/whatsapp.service', () => ({ sendMessage: mockSend }));

const { handleFirstUse, parseName, parseGrades, parseStream } = require('../../bot/shared/services/first-use-registration.service');

const user = (over = {}) => ({ id: 'u1', first_name: null, grades_taught: null, preferences: {}, ...over });
const asked = (step, over = {}) => user({ preferences: { onboarding_asked: step }, ...over });
const text = (body) => ({ messageType: 'text', messageBody: body });
const lastSent = () => mockSend.mock.calls.at(-1)[1];
const merged = () => Object.assign({}, ...mockUpdates);

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdates.length = 0;
  process.env.REGISTER_ON_FIRST_USE = 'true';
});
afterEach(() => { delete process.env.REGISTER_ON_FIRST_USE; });

const run = (u, input) => handleFirstUse({ user: u, from: '255700000000', ...input });

describe('the gate', () => {
  test('is off unless the deployment turns it on', async () => {
    delete process.env.REGISTER_ON_FIRST_USE;
    await expect(run(user(), text('Hi'))).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('a first message of any kind gets the welcome and the name question', async () => {
    await expect(run(user(), text('Hi'))).resolves.toBe(true);
    expect(lastSent()).toMatch(/welcome/i);
    expect(lastSent()).toMatch(/full name/i);
    expect(merged().preferences.onboarding_asked).toBe('name');
  });

  test('that first message is not taken as the answer', async () => {
    await run(user(), text('Asha Mushi'));
    expect(merged().first_name).toBeUndefined();
  });

  test('a registered teacher passes straight through', async () => {
    const done = user({ first_name: 'Asha', grades_taught: 'Grade 4', preferences: { stream: 'A' } });
    await expect(run(done, text('Hi'))).resolves.toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test.each([['video'], ['audio'], ['image'], ['document'], ['interactive']])('a %s during registration is held back', async (messageType) => {
    await expect(run(asked('name'), { messageType, messageBody: '' })).resolves.toBe(true);
    expect(lastSent()).toMatch(/finish registering/i);
    expect(lastSent()).toMatch(/full name/i);
  });

  test('a video is told it needs sending again', async () => {
    await run(asked('grade', { first_name: 'Asha' }), { messageType: 'video', messageBody: '' });
    expect(lastSent()).toMatch(/send (it|your video) again/i);
  });

  test('a command does not get around it', async () => {
    await expect(run(asked('name'), text('/menu'))).resolves.toBe(true);
    expect(merged().first_name).toBeUndefined();
  });

  test('it never stops a teacher because a message failed to save', async () => {
    mockSend.mockRejectedValueOnce(new Error('send failed'));
    await expect(run(user(), text('Hi'))).resolves.toBe(true);
  });
});

describe('the questions, in order', () => {
  test('a name moves on to grade', async () => {
    await run(asked('name'), text('Asha Mushi'));
    expect(merged()).toMatchObject({ first_name: 'Asha', last_name: 'Mushi', name: 'Asha Mushi' });
    expect(merged().preferences.onboarding_asked).toBe('grade');
    expect(lastSent()).toMatch(/Asha/);
    expect(lastSent()).toMatch(/grade/i);
  });

  test('a grade moves on to stream', async () => {
    await run(asked('grade', { first_name: 'Asha' }), text('Grade 4'));
    expect(merged().grades_taught).toBe('Grade 4');
    expect(lastSent()).toMatch(/stream/i);
  });

  test('a stream finishes registration', async () => {
    await run(asked('stream', { first_name: 'Asha', grades_taught: 'Grade 4' }), text('A'));
    expect(merged()).toMatchObject({ registration_completed: true, registration_pending_name: false });
    expect(merged().preferences.stream).toBe('A');
    expect(lastSent()).toMatch(/Grade 4/);
    expect(lastSent()).toMatch(/Stream A/i);
  });

  test('"4A" answers grade and stream together', async () => {
    await run(asked('grade', { first_name: 'Asha' }), text('4A'));
    expect(merged()).toMatchObject({ grades_taught: 'Grade 4', registration_completed: true });
    expect(merged().preferences.stream).toBe('A');
  });

  test('other preferences survive', async () => {
    await run(asked('name', { preferences: { onboarding_asked: 'name', observation_framework: 'silverleaf' } }), text('Asha'));
    expect(merged().preferences.observation_framework).toBe('silverleaf');
  });

  test('a poor answer is asked again, and stores nothing', async () => {
    await run(asked('grade', { first_name: 'Asha' }), text('I teach'));
    expect(merged().grades_taught).toBeUndefined();
    expect(lastSent()).toMatch(/grade/i);
  });

  test('someone with a name but no grade starts at grade', async () => {
    await run(user({ first_name: 'Asha' }), text('Hi'));
    expect(lastSent()).toMatch(/grade/i);
    expect(lastSent()).not.toMatch(/full name/i);
  });
});

describe('parseName', () => {
  test.each([
    ['Asha Mushi', ['Asha', 'Mushi']], ['asha', ['Asha', '']], ['My name is Asha Mushi', ['Asha', 'Mushi']],
    ["I'm Asha", ['Asha', '']], ['Mwalimu Asha', ['Asha', '']], ['Teacher Asha Mushi', ['Asha', 'Mushi']],
  ])('%s', (input, [first, last]) => {
    expect(parseName(input)).toEqual({ first, last });
  });

  test.each([['Hi'], ['Hello'], ['ok'], ['yes'], ['Habari'], ['A'], ['123'], ['Grade 4'], ['x'.repeat(70)], ['/menu'], ['Please help me with my lesson on fractions today']])('rejects %s', (input) => {
    expect(parseName(input)).toBeNull();
  });
});

describe('parseGrades', () => {
  test.each([
    ['Grade 4', ['Grade 4'], null], ['4', ['Grade 4'], null], ['G4', ['Grade 4'], null], ['Std 4', ['Grade 4'], null],
    ['Standard 7', ['Grade 7'], null], ['KG 1', ['KG 1'], null], ['kg1', ['KG 1'], null], ['G 4A', ['Grade 4'], 'A'],
    ['4b', ['Grade 4'], 'B'], ['KG 1A', ['KG 1'], 'A'], ['Grade 3 and 4', ['Grade 3', 'Grade 4'], null], ['3, 4', ['Grade 3', 'Grade 4'], null],
  ])('%s', (input, grades, stream) => {
    expect(parseGrades(input)).toEqual({ grades, stream });
  });

  test.each([['I teach'], ['Hi'], ['99'], ['0'], ['']])('rejects %s', (input) => {
    expect(parseGrades(input)).toBeNull();
  });
});

describe('parseStream', () => {
  test.each([['A', 'A'], ['a', 'A'], ['Stream B', 'B'], ['A and B', 'A, B'], ['A, B', 'A, B'], ['Blue', 'Blue']])('%s', (input, stream) => {
    expect(parseStream(input)).toBe(stream);
  });

  test.each([['Hi'], ['ok'], [''], ['x'.repeat(50)], ['/menu']])('rejects %s', (input) => {
    expect(parseStream(input)).toBeNull();
  });
});

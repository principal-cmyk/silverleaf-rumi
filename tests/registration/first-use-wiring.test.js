'use strict';
/** These decide whether the feature exists at all, so a test of the services alone is not enough. */
const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');
const bot = read('bot/whatsapp-bot.js');
const text = read('bot/shared/handlers/text-message.handler.js');
const orchestrator = read('bot/shared/services/coaching-orchestrator.service.js');
const analysis = read('bot/shared/services/coaching/analysis-processor.service.js');

test('registration runs before the message cap and every message type', () => {
  const gate = bot.indexOf('handleFirstUse');
  expect(gate).toBeGreaterThan(-1);
  expect(gate).toBeLessThan(bot.indexOf('const finishingRegistration ='));
  expect(gate).toBeLessThan(bot.indexOf("messageType === 'text' && messageBody"));
});

test('a registration message is acknowledged and goes no further', () => {
  expect(bot.slice(bot.indexOf('handleFirstUse'), bot.indexOf('handleFirstUse') + 260)).toMatch(/ack\(\);\s+return;/);
});

test('confirming a lesson asks the subject before transcribing', () => {
  const confirm = orchestrator.slice(orchestrator.indexOf('static async handleConfirmation'));
  expect(confirm.indexOf('askForCoaching')).toBeGreaterThan(-1);
  expect(confirm.indexOf('askForCoaching')).toBeLessThan(confirm.indexOf('this.queueTranscription'));
});

test('a text reply reaches the subject question before anything else', () => {
  const start = text.indexOf('async function handleTextMessage');
  expect(text.indexOf('handleCoachingReply', start)).toBeLessThan(text.indexOf('FEATURE-BASED REGISTRATION', start));
  expect(text.indexOf('resumeLessonPlan', start)).toBeLessThan(text.indexOf('FEATURE-BASED REGISTRATION', start));
});

test.each([['handleLessonPlanRequest'], ['handlePresentationRequest']])('%s holds a request with no subject, once it knows plans are available', (name) => {
  const body = text.slice(text.indexOf(`async function ${name}`));
  expect(body.indexOf('holdLessonPlan')).toBeGreaterThan(body.indexOf('explainIfUnavailable'));
  expect(body.indexOf('holdLessonPlan')).toBeLessThan(body.indexOf('createAndQueue'));
});

test('scoring knows the subject, grade and stream', () => {
  expect(analysis).toMatch(/subject: session\.conversation_state\?\.subject/);
  expect(analysis).toMatch(/grades_taught/);
});

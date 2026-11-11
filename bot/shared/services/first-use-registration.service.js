/**
 * Registration before anything else: name, grade and stream, one question at a time in chat.
 *
 * Subject is deliberately not here. A teacher can teach several, so it is asked for each lesson by the feature using
 * it (lesson-subject.service.js). This replaces the after-first-feature name question for deployments that turn it on
 * with REGISTER_ON_FIRST_USE, so that every report is tied to a named teacher and class.
 */
const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const WhatsAppService = require('./whatsapp.service');
const { registersOnFirstUse, NOT_AN_ANSWER } = require('../config/first-use');
const { botName } = require('../config/branding');

const MAX_NAME_CHARS = 60;
const MAX_NAME_WORDS = 5;
const MAX_STREAM_CHARS = 30;
const MAX_GRADE = 13;

const QUESTIONS = {
  name: 'What is your full name?',
  grade: 'Which grade do you teach? For example: Grade 4 or KG 1. If you teach more than one, list them: Grade 3 and 4.',
  stream: 'Which stream do you teach? For example: A. If you teach more than one, list them: A and B.',
};

function nextStep(user) {
  if (!user.first_name) return 'name';
  if (!user.grades_taught) return 'grade';
  if (!(user.preferences && user.preferences.stream)) return 'stream';
  return null;
}

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function parseName(input) {
  const text = String(input || '').trim();
  if (text.startsWith('/') || NOT_AN_ANSWER.test(text) || /\d/.test(text) || text.length > MAX_NAME_CHARS) return null;
  const cleaned = text
    .replace(/^(my name is|my name's|i am|i'm|this is|it's|name:?|jina langu ni|naitwa)\s+/i, '')
    .replace(/^(mwalimu|teacher|tr\.?|mr\.?|mrs\.?|ms\.?|miss|mwl\.?)\s+/i, '')
    .replace(/[.!]+$/, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_NAME_WORDS || words[0].length < 2) return null;
  if (!words.every((word) => /^[\p{L}'’-]+$/u.test(word))) return null;
  return { first: titleCase(words[0]), last: words.slice(1).map(titleCase).join(' ') };
}

/** One grade, optionally with its stream stuck on the end: "4", "G 4A", "KG 1". */
function parseOneGrade(input) {
  const match = /^(kg|k\.g\.?)?\s*(?:grade|gr\.?|g|std\.?|standard|class|darasa(?: la)?)?\s*(\d{1,2})\s*([a-z])?$/i.exec(input.trim());
  if (!match) return null;
  const number = Number(match[2]);
  if (number < 1 || number > (match[1] ? 3 : MAX_GRADE)) return null;
  return { grade: match[1] ? `KG ${number}` : `Grade ${number}`, stream: match[3] ? match[3].toUpperCase() : null };
}

function parseGrades(input) {
  const parts = String(input || '').split(/,|&|\band\b|\bna\b/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  const parsed = parts.map(parseOneGrade);
  if (parsed.some((p) => !p)) return null;
  return { grades: [...new Set(parsed.map((p) => p.grade))], stream: parsed.length === 1 ? parsed[0].stream : null };
}

function parseStream(input) {
  const text = String(input || '').trim().replace(/^(stream|mkondo)\s+/i, '');
  if (!text || text.startsWith('/') || NOT_AN_ANSWER.test(text) || text.length > MAX_STREAM_CHARS) return null;
  const streams = text.split(/,|&|\band\b|\bna\b/i).map((s) => s.trim()).filter(Boolean);
  if (streams.length === 0 || !streams.every((s) => /^[\p{L}\d' -]+$/u.test(s))) return null;
  return streams.map((s) => (s.length === 1 ? s.toUpperCase() : titleCase(s))).join(', ');
}

async function save(user, fields, preferences = {}) {
  const merged = { ...(user.preferences || {}), ...preferences };
  const { error } = await supabase.from('users').update({ ...fields, preferences: merged }).eq('id', user.id);
  if (error) throw error;
  return { ...user, ...fields, preferences: merged };
}

async function askNext(user, from, lead = '') {
  const step = nextStep(user);
  if (step) {
    await save(user, {}, { onboarding_asked: step });
    await WhatsAppService.sendMessage(from, `${lead}${QUESTIONS[step]}`);
    return;
  }
  await save(user, {
    registration_completed: true,
    registration_completed_at: new Date().toISOString(),
    registration_pending_name: false,
  }, { onboarding_asked: null });
  await WhatsAppService.sendMessage(from, `Thank you, ${user.first_name}. You are registered for ${user.grades_taught}, Stream ${user.preferences.stream}.\n\n`
    + 'You can now send a classroom recording for coaching, or ask me anything about your teaching.');
}

async function applyAnswer(user, step, text) {
  if (step === 'name') {
    const name = parseName(text);
    if (!name) return null;
    return save(user, { first_name: name.first, last_name: name.last || null, name: `${name.first} ${name.last}`.trim() });
  }
  if (step === 'grade') {
    const parsed = parseGrades(text);
    if (!parsed) return null;
    return save(user, { grades_taught: parsed.grades.join(', ') }, parsed.stream ? { stream: parsed.stream } : {});
  }
  const stream = parseStream(text);
  return stream ? save(user, {}, { stream }) : null;
}

/**
 * @returns {Promise<boolean>} true when this message belonged to registration, so nothing else should handle it
 */
async function handleFirstUse({ user, from, messageType, messageBody }) {
  if (!registersOnFirstUse() || !user) return false;
  const step = nextStep(user);
  if (!step) return false;

  try {
    const askedAlready = user.preferences && user.preferences.onboarding_asked === step;
    if (!askedAlready) {
      const firstContact = step === 'name';
      await askNext(user, from, firstContact ? `Welcome to ${botName}! Before we start, I need to register you. It takes a minute.\n\n` : '');
      return true;
    }
    if (messageType !== 'text') {
      const again = messageType === 'video' || messageType === 'audio' || messageType === 'voice' ? ' Then please send it again.' : '';
      await WhatsAppService.sendMessage(from, `Let's finish registering first.${again}\n\n${QUESTIONS[step]}`);
      return true;
    }
    const updated = await applyAnswer(user, step, messageBody);
    if (!updated) {
      await WhatsAppService.sendMessage(from, `Sorry, I did not catch that. ${QUESTIONS[step]}`);
      return true;
    }
    await askNext(updated, from, step === 'name' ? `Thank you, ${updated.first_name}. ` : '');
  } catch (error) {
    logToFile('❌ First-use registration failed', { userId: user.id, step, error: error.message });
  }
  return true;
}

module.exports = { handleFirstUse, parseName, parseGrades, parseStream, nextStep };

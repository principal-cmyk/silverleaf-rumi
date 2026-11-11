/**
 * The subject of one lesson, asked when a feature needs it. A teacher can teach several, so it is not part of
 * registration. Coaching waits for it before transcribing. A lesson plan request naming no subject is held and
 * brought back with the subject added, so the rest of the lesson plan path needs no change.
 */
const supabase = require('../config/supabase');
const { logToFile } = require('../utils/logger');
const WhatsAppService = require('./whatsapp.service');
const { registersOnFirstUse, NOT_AN_ANSWER } = require('../config/first-use');

const MAX_SUBJECT_CHARS = 50;
const HOLD_SECONDS = 60 * 60;
const COACHING_QUESTION = 'Which subject is this lesson? For example: Mathematics, English, Science or Kiswahili.';
const LESSON_PLAN_QUESTION = 'Which subject is this lesson plan for? For example: Mathematics, English, Science or Kiswahili.';

const KNOWN_SUBJECTS = [
  [/^(maths?|mathematics|hisabati)$/i, 'Mathematics'],
  [/^(english|kiingereza)$/i, 'English'],
  [/^(kiswahili|swahili)$/i, 'Kiswahili'],
  [/^(science|sayansi)$/i, 'Science'],
  [/^(social studies|sst|maarifa ya jamii)$/i, 'Social Studies'],
  [/^(ict|computer|computers|tehama)$/i, 'ICT'],
  [/^(civics|uraia)$/i, 'Civics'],
  [/^(history|historia)$/i, 'History'],
  [/^(geography|jiografia)$/i, 'Geography'],
];
const NAMES_A_SUBJECT = /\b(maths?|mathematics|hisabati|english|kiingereza|kiswahili|swahili|science|sayansi|social studies|civics|uraia|history|historia|geography|jiografia|ict|biology|chemistry|physics|french|arts?|music|subject:)/i;

function parseSubject(input) {
  const text = String(input || '').trim().replace(/[.!]+$/, '');
  if (!text || text.startsWith('/') || NOT_AN_ANSWER.test(text) || text.length > MAX_SUBJECT_CHARS) return null;
  const known = KNOWN_SUBJECTS.find(([pattern]) => pattern.test(text));
  if (known) return known[1];
  return text.split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

async function setState(session, state) {
  const conversationState = { ...(session.conversation_state || {}), ...state };
  const { error } = await supabase.from('coaching_sessions').update({ conversation_state: conversationState }).eq('id', session.id);
  if (error) throw error;
}

/** @returns {Promise<boolean>} true when the subject was asked, so transcription should wait for the answer */
async function askForCoaching(session, from) {
  if (!registersOnFirstUse()) return false;
  await setState(session, { current_state: 'AWAITING_SUBJECT' });
  await WhatsAppService.sendMessage(from, COACHING_QUESTION);
  return true;
}

/** @returns {Promise<boolean>} true when this message answered, or was held by, the subject question */
async function handleCoachingReply(user, from, messageBody) {
  if (!registersOnFirstUse()) return false;
  try {
    const { data } = await supabase
      .from('coaching_sessions')
      .select('id, audio_id, conversation_state')
      .eq('user_id', user.id)
      .filter('conversation_state->>current_state', 'eq', 'AWAITING_SUBJECT')
      .order('created_at', { ascending: false })
      .limit(1);
    const session = data && data[0];
    if (!session) return false;

    const subject = parseSubject(messageBody);
    if (!subject) {
      await WhatsAppService.sendMessage(from, `Sorry, I did not catch that. ${COACHING_QUESTION}`);
      return true;
    }
    await setState(session, { subject, current_state: 'TRANSCRIBING' });
    await WhatsAppService.sendMessage(from, `Thank you. I am analysing your ${subject} lesson now.`);
    const CoachingJobQueueService = require('./coaching/coaching-job-queue.service');
    await CoachingJobQueueService.queueTranscription(session.id, { from, audioId: session.audio_id });
    logToFile('Lesson subject recorded, transcription queued', { coachingSessionId: session.id });
    return true;
  } catch (error) {
    // A teacher's ordinary message must not depend on this check.
    logToFile('⚠️ Lesson subject check failed', { userId: user.id, error: error.message });
    return false;
  }
}

const heldKey = (user) => `lesson_plan:awaiting_subject:${user.id}`;
const redis = () => require('./cache/railway-redis.service');

/** @returns {Promise<boolean>} true when the request was held to ask its subject */
async function holdLessonPlan(user, from, messageBody) {
  if (!registersOnFirstUse() || !user || NAMES_A_SUBJECT.test(messageBody)) return false;
  await redis().set(heldKey(user), messageBody, HOLD_SECONDS);
  await WhatsAppService.sendMessage(from, LESSON_PLAN_QUESTION);
  return true;
}

/** @returns {Promise<string|null>} the held request with its subject added, or null when there is nothing to resume */
async function resumeLessonPlan(user, messageBody) {
  if (!user || !registersOnFirstUse()) return null;
  const held = await redis().get(heldKey(user));
  if (!held) return null;
  const subject = parseSubject(messageBody);
  if (!subject && String(messageBody || '').trim().startsWith('/')) {
    await redis().delete(heldKey(user));
    return null;
  }
  if (!subject) return null;
  await redis().delete(heldKey(user));
  return `${held} (Subject: ${subject})`;
}

module.exports = { askForCoaching, handleCoachingReply, holdLessonPlan, resumeLessonPlan, parseSubject };

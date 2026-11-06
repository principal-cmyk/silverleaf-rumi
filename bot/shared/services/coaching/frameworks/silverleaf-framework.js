/**
 * Silverleaf Academy's own coaching framework.
 *
 * Built from three school documents: the Teacher Competency Framework (the rubric), the Coaching Criteria (Get Better
 * Faster action steps, Glows, Grows, Notes) and the Teacher Observation Form (the fields a coach fills in).
 *
 * Only what a lesson recording can show is scored. Strand 2 (Planning) and the school-wide parts of Strand 4 are left
 * out rather than guessed, and any indicator without evidence is "not observed", which is different from scoring low.
 * The rules the school's reminders insist on are enforced in code, not left to the prompt: a level must carry evidence,
 * and an action step type must come from the school's lists.
 */

const seeNameDo = require('../reflective-questions/see-name-do');

const LEVELS = ['Pre-Novice', 'Novice', 'Proficient', 'Advanced', 'Exceptional'];
const LEVEL_MAX = LEVELS.length;
const MAX_MESSAGE_CHARS = 3800;
const MAX_ACTION_STEP_WORDS = 35;
const LESSON_OPENING_INDICATOR = '3A.i';

// A teacher films part of a lesson, often starting after it began and stopping before it ends. So anything only the
// very start or end could show is unknown, and saying it was missing is a false claim. A rule in the prompt did not
// hold (a live action step read "At lesson start, write a SMART objective", citing "no objective at 00:00"), so the
// claims are removed in code unless the scorer can quote the recording showing the real start.
const BOUNDARY_TOPIC = /\b(objective|learning (goal|target|aim|intention)|lesson (aim|goal|target)|success criteria|agenda|exit ticket|lesson opening|lesson closing|hook|(open|start|begin|beginning|opening|frame|framing|close|closing|end)\w* (of |to )?(the |your |each |every )?lesson|lesson (start|end)|at the start|competency statement)\b/i;
const NEGATIVE_CLAIM = /\b(no|not|never|without|lack\w*|miss\w*|fail\w*|did ?n.t|absent|unclear|next|should|start with|begin with|add)\b/i;

const SUBSTRANDS = [
  {
    id: '1A', title: 'Culture of Achievement', strand: 'Climate & Culture',
    summary: 'Builds a culture of hard work, high expectations and ensures 100% of students are engaged and on task.',
    indicators: [
      ['i', 'Sets clear expectations', 'Gets 100% attention; explains work, time limit and behaviour in 3-5 steps; checks for understanding; signals the start; narrates positive behaviour until all are on task. Proficient at 80% of the time, Advanced 90%, Exceptional 100%.'],
      ['ii', 'Level of student engagement', 'Novice: all students engaged less than 80% of class time, some apathetic or destructive. Proficient and Advanced: all engaged at least 80% of class time, none disruptive, a few apathetic. Exceptional: all engaged all the time, most eager, none apathetic.'],
      ['iii', 'Responds to level of student engagement', 'Notices and responds to lack of engagement: circulates to check compliance, responds at once with positive narration and proximity, then nonverbal signal, private correction or quick public correction. Proficient 80% of the time, some students re-engage. Advanced 90%, most re-engage. Exceptional 100%, all re-engage.'],
      ['iv', 'Fosters a love of learning', 'Proficient: consistently says the work is important, and teacher and students sometimes smile, laugh and use humour. Advanced: adds "you can do it with hard work". Exceptional: adds "I will not give up on you" and "we will help each other".'],
      ['v', 'Fosters a culture of inclusivity', 'Proficient: inclusive language, avoids stereotypes, groups students in diverse ways, checks in with all students. Advanced: addresses bias, students share their perspectives and listen actively.'],
    ],
  },
  {
    id: '1B', title: 'Systems & Procedures', strand: 'Climate & Culture',
    summary: 'Teaches and insists on clear and consistent routines and procedures that maximise learning.',
    indicators: [
      ['ii', 'Procedures save time', 'Proficient: procedures cover most transitions and most students follow them when prompted. Advanced: all students follow when prompted. Exceptional: all follow without prompting.'],
      ['iii', 'Practices procedures to mastery', 'If students do not follow a procedure, the teacher has them practise it to mastery. Proficient 80% of the time, Advanced 90%, Exceptional 100%.'],
      ['iv', 'Upholds school-wide systems', 'Proficient: implements school systems, and students follow them and are redirected when they do not. Advanced: students begin to hold each other accountable.'],
    ],
  },
  {
    id: '1C', title: 'Rules & Consequences', strand: 'Climate & Culture',
    summary: 'Manages student behaviour and asserts respectful authority to ensure focus is on learning.',
    indicators: [
      ['ii', 'Projects strong, calm presence', 'Novice: not convincing as the leader, sometimes angrily raises voice. Proficient: some strong presence, does not angrily raise voice. Advanced: usually strong presence and positive authority. Exceptional: warm and demanding, consistently calm.'],
      ['iii', 'Anticipates and prevents misbehavior', 'Shows awareness of common causes of misbehaviour (pacing, boredom, unwise seating, unclear limits). Proficient in 1-2 parts of the lesson, Advanced 3-4 parts and some in-the-moment situations, Exceptional all of the lesson.'],
      ['iv', 'Responds to misbehavior', 'Notices and addresses misbehaviour with consequences that are quick, incremental, consistent and depersonalised, keeping student dignity. Proficient 80%, Advanced 90%, Exceptional all, with misbehaviour extremely rare.'],
      ['v', 'Students self-monitor and reflect', 'Proficient: students sometimes resolve or prevent misbehaviour themselves. Advanced: usually. Exceptional: students solve problems independently and monitor themselves.'],
    ],
  },
  {
    id: '3A', title: 'Instructional Clarity', strand: 'Lesson Delivery',
    summary: 'Selects from a range of tools to present content clearly.',
    indicators: [
      ['i', 'Lesson Opening', 'Frames the lesson (competency, end-of-class goals, agenda, relevance) and activates prior knowledge, connects to the real world or hooks interest. Proficient one of these, Advanced two, Exceptional all three.'],
      ['ii', 'Highlights key points', 'Proficient: clear explanations, accurate academic language, 80% of students can explain the key points. Advanced: key points one by one with an example, 90%. Exceptional: memorable, all students.'],
      ['iii', 'Varies delivery methods to meet needs', 'Proficient: limited set of tools, 80% gain clarity. Advanced: a variety of techniques, 90%. Exceptional: chosen purposefully from a wide variety, all students.'],
      ['iv', 'Think Ratio', 'Proficient: several higher-order questions, at least 80% respond or share. Advanced: consistent well-crafted higher-order questions, 90%. Exceptional: all of the time.'],
    ],
  },
  {
    id: '3B', title: 'Student Practice', strand: 'Lesson Delivery',
    summary: 'Engages 100% of students in meaningful practice of competencies to master skills and concepts.',
    indicators: [
      ['i', 'Sets academic expectations', 'Clear directions on what students work on, how work is shown, and how it connects to the competency. Advanced: also models or gives an exemplar.'],
      ['ii', 'Monitors academic expectations', 'Novice: rarely circulates or checks only behaviour. Proficient: consistently circulates to check student work against expectations. Advanced: always, with positive framing. Exceptional: also raises pace on the spot.'],
      ['iii', 'Paces lesson appropriately', 'Proficient: executes planned components and adjusts on the spot so practice time fits, usually raising mastery. Advanced: adjustments consistently raise mastery. Exceptional: always, and often beyond grade level.'],
      ['iv', 'Facilitates sufficient independent practice time', 'Enough independent practice and individual turns for students to master the competency. Proficient 80% of students, Advanced 90%, Exceptional all.'],
    ],
  },
  {
    id: '3C', title: 'Monitors Student Learning', strand: 'Lesson Delivery',
    summary: 'Monitors student learning throughout the lesson cycle and adjusts instruction accordingly.',
    indicators: [
      ['i', 'Monitors learning at key "checkpoints"', 'Novice: one checkpoint, limited responses. Proficient: 2-3 key moments reviewing every student\'s answers. Advanced: several moments. Exceptional: throughout.'],
      ['ii', 'Monitors learning throughout class', 'Novice: rhetorical questions, volunteers, limited circulation. Proficient: often uses methods revealing most students\' thinking (Everybody Writes, think/pair/share, cold calling, targeted circulation). Advanced: principally these.'],
      ['iii', 'What extent of student learning is monitored', 'Novice: low-level, single-word or call and response questions. Proficient: higher-level open-ended questions. Advanced: requires students to explain why and how.'],
      ['iv', 'Whom to monitor', 'Novice: inconsistently selects students at different levels. Proficient: consistently from a wide range. Advanced: always and purposefully.'],
    ],
  },
  {
    id: '3D', title: 'Responds to Gaps in Student Learning Outcomes', strand: 'Lesson Delivery',
    summary: 'Adjusts instruction based on trends when monitoring student learning.',
    indicators: [
      ['i', 'Identifies and tracks trends in gaps of student learning', 'Proficient: identifies the most common errors at key moments. Advanced: and tracks them. Exceptional: tracks trends and which students made them.'],
      ['ii', 'Probes to identify causes of gaps in student learning', 'Novice: inconsistently investigates where learning broke down. Proficient: consistently, with follow-up questions, wait time and looking at work. Advanced: always.'],
      ['iii', 'Reteaches based on gaps in student learning', 'Novice: reteach is general or misses the gap. Proficient: consistently reteaches, usually on the specific gap. Advanced: always on the specific gap. Exceptional: students self-identify misunderstandings.'],
      ['iv', 'Gives additional "at bat" to reassess student learning', 'Proficient: consistently gives immediate aligned practice after a reteach. Advanced: always, and students justify their understanding. Exceptional: students also apply it in a new way.'],
    ],
  },
  {
    id: '4A', title: 'Lives the Value Proposition', strand: 'Value Proposition',
    summary: 'Enacts the Silverleaf Value Proposition in classroom life and learning. Only the parts visible in a lesson are scored.',
    indicators: [
      ['i', 'Student Wellness', 'Proficient: positive behaviour management 100% of the time, no corporal punishment. Integrates socio-emotional development.'],
      ['iv', 'English Competence', 'Novice: adequate English 75% of the time. Proficient: good English with minor errors 75% of the time, corrects students\' English 50%. Advanced: 90% and 75%. Exceptional: 100%, and gives students additional phrases and vocabulary. This is an English-medium school.'],
      ['v', 'Technology Integration', 'Regularly uses technology in class to support syllabus content, such as projector or tablets. Score only if technology is used.'],
    ],
  },
];

const CULTURE_TYPES = [
  'Sets clear expectations', 'Level of student engagement', 'Responds to level of student engagement',
  'Fosters a love of learning', 'Plans and teaches systems and procedures', 'Procedures save time',
  'Practices procedures to mastery', 'Upholds school-wide systems', 'Designs behavior plan',
  'Projects strong, calm presence', 'Anticipates and prevents misbehavior', 'Responds to misbehavior',
  'Students self-monitor and reflect', 'Other',
];

const RIGOR_TYPES = [
  'Lesson Plan feedback Cycle', 'Competency', 'Lesson assessment', 'Exemplar response/criteria for mastery', 'Key points',
  'Plan for lesson opening', 'Plan for introducing key points', 'Plan for gradual release of responsibility to students',
  'Plan to monitor student learning', 'Lesson Opening', 'Highlights key points', 'Varies delivery methods to meet needs',
  'Think Ratio', 'Sets academic expectations', 'Monitors academic expectations', 'Paces lesson appropriately',
  'Facilitates sufficient independent practice time', 'Monitors learning at key "checkpoints"',
  'Monitors learning throughout class', 'What extent of student learning is monitored', 'Whom to monitor',
  'Identifies and tracks trends in gaps of student learning', 'Probes to identify causes of gaps in student learning',
  'Reteaches based on gaps in student learning', 'Gives additional "at bat" to reassess student learning', 'Other',
];

const TYPES_BY_CATEGORY = { 'Culture/Management': CULTURE_TYPES, 'Learning/Rigor': RIGOR_TYPES };

const INDICATORS = SUBSTRANDS.flatMap((s) => s.indicators.map(([roman, name]) => ({ id: `${s.id}.${roman}`, substrand: s.id, name })));
const INDICATOR_IDS = new Set(INDICATORS.map((i) => i.id));

const GBF_SKILLS = {
  'Culture/Management': [
    'Routines & Procedures 101', 'Strong Voice', 'What to Do', 'Routines & Procedures 201', 'Teacher Radar',
    'Whole-Class Reset', 'Build the Momentum', 'Pacing', 'Engage All Students', 'Narrate the Positive',
    'Individual Student Corrections', 'Engaged Small Group Work',
  ],
  'Learning/Rigor': [
    'Develop Effective Lesson Plans 101', 'Internalize Existing Lesson Plans', 'Write the Exemplar', 'Independent Practice',
    'Monitor Aggressively', 'Habits of Evidence', 'Check for Whole-Group Understanding', 'Re-teaching 101',
    'Re-teaching 201', 'Universal Prompts', 'Habits of Discussion', 'Strategic Prompts', 'Go Conceptual',
  ],
};

const GBF_REFERENCE = `PHASE 1 (Pre-Teaching). Management: Routines & Procedures 101; Strong Voice. Rigor: Develop Effective Lesson Plans 101; Internalize Existing Lesson Plans.
PHASE 2 (Days 1-30). Management: What to Do (economy of language, crisp instructions); Routines & Procedures 201 (Do It Again, Cut it Short); Teacher Radar (scan hot spots, Be Seen Looking, circulate with purpose, break the plane); Whole-Class Reset. Rigor: Write the Exemplar; Independent Practice (write first, talk second, Do Now, Exit Ticket); Monitor Aggressively (monitoring pathway, check against exemplar, pen in hand, coding system).
PHASE 3 (Days 31-60). Management: Build the Momentum; Pacing (timer, rate of questioning, countdowns, Call and Response); Engage All Students (cold call, Turn & Talk); Narrate the Positive; Individual Student Corrections (anticipate off-task, least invasive intervention: proximity, eye contact, non-verbal, name, small consequence). Rigor: Habits of Evidence; Check for Whole-Group Understanding (poll the room, target the error); Re-teaching 101 - Model.
PHASE 4 (Days 61-90). Management: Engaged Small Group Work. Rigor: Re-teaching 201 - Guided Discourse (Show-Call, Stamp the Understanding, At-bats); Universal Prompts (wait time, roll back the answer, push to elaborate, close the loop); Habits of Discussion.
STRETCH IT. Rigor: Strategic Prompts; Go Conceptual.`;

let cachedSystemPrompt = null;

function rubricText() {
  return SUBSTRANDS.map((s) => {
    const lines = s.indicators.map(([roman, name, anchors]) => `- ${s.id}.${roman} ${name}: ${anchors}`);
    return `${s.id} ${s.title.toUpperCase()} (${s.strand}). ${s.summary}\n${lines.join('\n')}`;
  }).join('\n\n');
}

function getSystemPrompt() {
  if (cachedSystemPrompt) return cachedSystemPrompt;
  cachedSystemPrompt = `You are a Silverleaf Academy instructional coach, trained in the Get Better Faster (GBF) Scope & Sequence by Paul Bambrick-Santoyo. Silverleaf is an English-medium school in Tanzania. You complete the school's teacher observation record from a lesson transcript, and from visual evidence when it is provided.

COMPETENCY RUBRIC
Rate each indicator on the school's five levels: 1 Pre-Novice (no attempt or action), 2 Novice, 3 Proficient, 4 Advanced, 5 Exceptional.

${rubricText()}

RATING RULES
- Every level must rest on specific evidence from this lesson: a timestamp, a quote or a counted behaviour.
- If this lesson gives no evidence for an indicator, set level to null and evidence to "". Not observed is different from Pre-Novice, which means the teacher had the chance and made no attempt. Never score an indicator from an assumption.
- The percentages in the rubric are of the moments you can observe, so treat them as a guide and do not claim precision the recording cannot support.
- Things a recording cannot show, such as what students could explain afterwards, need direct evidence or a null.
- A recording may start after the lesson began, and may end before the lesson did. Never treat what is missing from the first or last moments as missing from the lesson. Do not say an objective, agenda, hook, exit ticket or closing was absent unless the recording clearly covers that part of the lesson. Set shows_lesson_start to true only if you can quote the teacher really starting the lesson, such as a greeting or "today we will". Starting with teaching already under way is false.
- Visual evidence comes from the sampled moments of the video. It maps to the rubric: order and off-task counts to 1A.ii, 1C.ii and 1C.iv; teacher response to off-task students to 1A.iii and 1C.iv; circulation and leaning in to 3B.ii and 3C.ii; raised hands to 3A.iv and 3C.ii.

GET BETTER FASTER SCOPE & SEQUENCE
${GBF_REFERENCE}

ACTION STEP
Write the grows first, then choose ONE action step: the single high-leverage change for student learning right now. It must:
- Be drawn from one of the grows. Pick the grow that matters most for student learning, and write the step that closes exactly that gap. Say which grow in grow_number. A step that does not come from a grow is not allowed.
- Be phrased as something the teacher WILL DO, not something to avoid.
- Be precise enough that coach and teacher both know exactly what success looks like.
- Be drawn from the GBF phase appropriate to this teacher's level, as shown by this lesson and any prior feedback. Where basic order or engagement is not in place, a management step comes before rigor.
- Be one sentence or two short sentences at most, and no more than ${MAX_ACTION_STEP_WORDS} words. It names one behaviour, not a sequence. Never chain moves with "then", "and then", semicolons or a list after a colon. The extra moves belong in the How, which is 2-3 very short steps for carrying out that one behaviour.
- Name its GBF skill from the same category. Teacher Radar is about seeing behaviour. Checking student work against an exemplar with a pathway or code is Monitor Aggressively.
Weak: "Improve classroom management." Strong: "During independent practice, check the back row first using a planned monitoring pathway."

Classify it as Culture/Management or Learning/Rigor, then choose its type from exactly one list:
Culture/Management: ${CULTURE_TYPES.join(' / ')}
Learning/Rigor: ${RIGOR_TYPES.join(' / ')}

OBSERVATION NOTES
The teacher reads these, so address the teacher as "you", never as "the teacher". Do not include raw timestamps ranges as a list; name the moment in words, with the minute where it helps. Call visual evidence "the sampled moments", never "photos".
- Glows: 3-5 specific, evidence-based glows, each naming a concrete moment or behaviour, not a vague compliment. Example: "When transitioning from the Do Now to the main activity, you gave a crisp 3-word direction, 'pens down, eyes up', and waited for full compliance before moving on. This created a calm, focused transition."
- Grows: 2-3 specific, evidence-based grows, each explaining a gap between what was observed and what good practice calls for. The action step comes from one of these. Reference specific moments. Be honest but constructive.
- Notes for the Teacher: 3-5 sentences written TO the teacher, not about them. Acknowledge their effort and a genuine strength, name the focus area with encouragement, express confidence in their growth. Warm, human, motivating, not generic.

REMINDERS
- All feedback is strictly based on the evidence in this lesson. Do not invent moments.
- Only one action step.
- Glows and grows reference specific moments, not generalisations.
- The transcript is machine-generated and noisy, so do not comment on spelling or word errors in it. Do not use "she" or "he" for the teacher.
- Output English.`;
  return cachedSystemPrompt;
}

function buildAnalysisPrompt(transcript, metadata = {}, lessonPlanStructured = null, photoAnalysis = null) {
  const { grade, subject, duration, teacherFirstName, priorFeedback } = metadata;
  const context = [
    teacherFirstName ? `Teacher's first name: ${teacherFirstName}` : '',
    grade ? `Grade: ${grade}` : '',
    subject ? `Subject: ${subject}` : '',
    duration ? `Duration: ${Math.round(duration / 60)} minutes` : '',
  ].filter(Boolean).join('\n');

  return `Complete the observation record for this lesson.

${context ? `LESSON CONTEXT\n${context}\n\n` : ''}${priorFeedback ? `PRIOR ACTION STEP AND FEEDBACK\n${priorFeedback}\n\n` : 'PRIOR ACTION STEP\nNone / first observation\n\n'}${lessonPlanStructured ? `LESSON PLAN\n${JSON.stringify(lessonPlanStructured).slice(0, 4000)}\n\n` : ''}${photoAnalysis ? `CLASSROOM PHOTO EVIDENCE\n${photoAnalysis}\n\n` : ''}TRANSCRIPT
${transcript}

Return JSON only, in exactly this shape. Include every indicator: ${INDICATORS.map((i) => i.id).join(', ')}.
{
  "executive_summary": "2-3 sentences on this lesson.",
  "subject": "the subject taught, if clear",
  "topic": "the topic taught, if clear",
  "recording_start": { "shows_lesson_start": true or false, "evidence": "a quote showing the real start of the lesson, or empty" },
  "indicators": [{ "id": "1A.i", "level": 1 to 5 or null, "evidence": "timestamp, quote or count, or empty if not observed" }],
  "glows": ["3-5 items"],
  "grows": ["2-3 items"],
  "action_step": {
    "grow_number": "the number of the grow this step closes: 1 for the first grow, 2 for the second",
    "text": "the one action step: one behaviour the teacher will work on",
    "how": ["2-3 very short steps for how to do it, e.g. Stand still", "Give a what-to-do direction", "Scan"],
    "category": "Culture/Management" or "Learning/Rigor",
    "type": "exactly one type from that category's list",
    "gbf_phase": "e.g. Phase 2",
    "gbf_skill": "e.g. Teacher Radar",
    "rationale": "one sentence on why this is the highest-leverage step"
  },
  "notes_for_teacher": "3-5 sentences to the teacher"
}`;
}

function showsLessonStart(analysis) {
  const start = analysis.recording_start || {};
  return start.shows_lesson_start === true && typeof start.evidence === 'string' && start.evidence.trim().length > 0;
}

/** A sentence saying something at the very start or end of the lesson was missing, or should be added there. */
function claimsBoundaryGap(text) {
  return BOUNDARY_TOPIC.test(text) && NEGATIVE_CLAIM.test(text);
}

function withoutBoundaryClaims(text) {
  return String(text || '').split(/(?<=[.!?])\s+/).filter((sentence) => !claimsBoundaryGap(sentence)).join(' ').trim();
}

function cleanIndicators(raw) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).reduce((kept, item) => {
    const id = item && item.id;
    const evidence = typeof (item && item.evidence) === 'string' ? item.evidence.trim() : '';
    if (!INDICATOR_IDS.has(id) || seen.has(id)) return kept;
    seen.add(id);
    const valid = Number.isInteger(item.level) && item.level >= 1 && item.level <= LEVEL_MAX && evidence.length > 0;
    kept.push({ id, level: valid ? item.level : null, evidence: valid ? evidence : '' });
    return kept;
  }, []);
}

function stringList(value, max) {
  return (Array.isArray(value) ? value : [])
    .filter((v) => typeof v === 'string' && v.trim())
    .map((v) => v.trim().replace(/^\d+\s*[.):-]\s*/, ''))
    .slice(0, max);
}

/** The skill named, if it belongs to this category's trajectory. A mismatch is dropped, not trusted. */
function matchSkill(category, named) {
  const skills = GBF_SKILLS[category] || [];
  return skills.find((skill) => String(named || '').toLowerCase().startsWith(skill.toLowerCase())) || null;
}

/**
 * The grow a step closes goes first, so the conversation and the report lead with it. It is found before any grow is
 * removed, so the number the model gave still points at the same grow.
 */
function withSourceGrow(grows, number, keep = () => true) {
  const valid = Number.isInteger(number) && number >= 1 && number <= grows.length;
  const namedIndex = valid ? number - 1 : -1;
  const kept = grows.filter(keep);
  if (namedIndex < 0 || !keep(grows[namedIndex])) return { grows: kept, source: null };
  const others = grows.filter((grow, i) => i !== namedIndex && keep(grow));
  return { grows: [grows[namedIndex], ...others], source: grows[namedIndex] };
}

function cleanRecord(analysis, overallLevel, lessonStartSeen) {
  const step = analysis.action_step || {};
  const keep = lessonStartSeen ? () => true : (grow) => !claimsBoundaryGap(grow);
  const sourced = withSourceGrow(stringList(analysis.grows, 3), step.grow_number, keep);
  const category = TYPES_BY_CATEGORY[step.category] ? step.category : null;
  const type = category && TYPES_BY_CATEGORY[category].includes(step.type) ? step.type : (category ? 'Other' : null);
  return {
    action_step: typeof step.text === 'string' ? step.text.trim() : '',
    category,
    type,
    gbf_phase: step.gbf_phase || null,
    gbf_skill: matchSkill(category, step.gbf_skill),
    how: stringList(step.how, 3),
    commitment_question: seeNameDo.commitmentQuestion,
    rationale: step.rationale || '',
    glows: stringList(analysis.glows, 5),
    grows: sourced.grows,
    source_grow: sourced.source,
    lesson_start_seen: lessonStartSeen,
    notes_for_teacher: typeof analysis.notes_for_teacher === 'string' ? analysis.notes_for_teacher.trim() : '',
    overall_level: overallLevel,
  };
}

function isActionStepTooLong(text) {
  return String(text || '').trim().split(/\s+/).length > MAX_ACTION_STEP_WORDS;
}

/**
 * The school's rule is one high-leverage move. A list after a colon, "then" and semicolons are how a model smuggles
 * several in, and a rule in the prompt alone did not stop it. The moves belong in the How.
 */
function isSingleMove(text) {
  const step = String(text || '');
  return !(/;/.test(step) || /\bthen\b/i.test(step) || /:[^.]*,/.test(step));
}

function actionStepProblems(record) {
  const problems = [];
  if (isActionStepTooLong(record.action_step)) problems.push(`it is over ${MAX_ACTION_STEP_WORDS} words`);
  if (!isSingleMove(record.action_step)) problems.push('it chains several moves instead of naming one behaviour');
  if (!record.source_grow) problems.push('it is not tied to one of the grows');
  if (!record.lesson_start_seen && BOUNDARY_TOPIC.test(record.action_step)) {
    problems.push('it is about the start or end of the lesson, and the recording may have started late or stopped early, so nothing shows that was missing');
  }
  return problems;
}

/** Null when the step meets every rule. */
function revisionPrompt(analysis) {
  const record = analysis.observation_record;
  if (!record || !record.action_step || !record.needs_review) return null;
  return `This teacher action step breaks the school's rules: ${actionStepProblems(record).join('; ')}.

Rewrite it as the single high-leverage step, drawn from the grow below that matters most for student learning. It must name one behaviour, in no more than ${MAX_ACTION_STEP_WORDS} words, in one sentence or two short sentences. Do not chain moves with "then", semicolons or a list after a colon: put the extra moves in "how". Write it directly to the teacher, starting with a verb or a moment in the lesson, never with the word "Teacher". Keep it precise enough that success is obvious.

CURRENT STEP
${record.action_step}

GROWS
${bullets(record.grows)}

Reply with JSON only: { "grow_number": 1, "action_step": "...", "how": ["2-3 very short steps"] }`;
}

function applyRevision(analysis, reply) {
  let revised;
  try {
    revised = JSON.parse(String(reply).replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  } catch {
    return analysis;
  }
  const record = analysis.observation_record;
  const text = typeof revised.action_step === 'string' ? revised.action_step.trim() : '';
  const sourced = withSourceGrow(record.grows, revised.grow_number);
  const candidate = { action_step: text, source_grow: sourced.source, lesson_start_seen: record.lesson_start_seen };
  if (!text || actionStepProblems(candidate).length > 0) return analysis;

  Object.assign(record, candidate, { grows: sourced.grows, needs_review: false });
  const how = stringList(revised.how, 3);
  if (how.length > 0) record.how = how;
  return withReportShapes(analysis, record);
}

function substrandScores(indicators) {
  return SUBSTRANDS.map((s) => {
    const rated = indicators.filter((i) => i.level !== null && i.id.startsWith(`${s.id}.`));
    const score = rated.reduce((sum, i) => sum + i.level, 0);
    const max = rated.length * LEVEL_MAX;
    return { id: s.id, title: s.title, strand: s.strand, score, max, rated: rated.length };
  });
}

/** The shapes the report narrative, prior-feedback history and commitment card already read. */
function withReportShapes(analysis, record) {
  analysis.strengths = record.glows.map((glow) => ({ title: glow, evidence: glow }));
  analysis.growth_opportunities = record.grows.map((grow) => ({
    area: record.type || 'Growth area', observation: grow, strategies: record.action_step ? [record.action_step] : [],
  }));
  analysis.recommendations = record.action_step ? [record.action_step] : [];
  return analysis;
}

function computeScores(analysis) {
  const lessonStartSeen = showsLessonStart(analysis);
  const indicators = cleanIndicators(analysis.indicators).map((indicator) => (
    !lessonStartSeen && indicator.id === LESSON_OPENING_INDICATOR ? { ...indicator, level: null, evidence: '' } : indicator
  ));
  const rated = indicators.filter((i) => i.level !== null);
  const marks = rated.reduce((sum, i) => sum + i.level, 0);
  const max = rated.length * LEVEL_MAX;
  const overallLevel = rated.length > 0 ? LEVELS[Math.round(marks / rated.length) - 1] : null;
  const record = cleanRecord(analysis, overallLevel, lessonStartSeen);
  if (!lessonStartSeen) {
    analysis.executive_summary = withoutBoundaryClaims(analysis.executive_summary);
    record.notes_for_teacher = withoutBoundaryClaims(record.notes_for_teacher);
  }

  analysis.indicators = indicators;
  analysis.substrand_scores = substrandScores(indicators);
  analysis.observation_record = record;
  analysis.scores = {
    overall_marks: marks,
    overall_max_marks: max,
    overall_percentage: max > 0 ? parseFloat(((marks / max) * 100).toFixed(1)) : 0,
    rated_indicators: rated.length,
    total_indicators: INDICATORS.length,
  };
  record.needs_review = !!record.action_step && actionStepProblems(record).length > 0;
  return withReportShapes(analysis, record);
}

function getPerformanceBand(percentage) {
  if (percentage >= 90) return 'exceptional';
  if (percentage >= 70) return 'advanced';
  if (percentage >= 50) return 'proficient';
  if (percentage >= 30) return 'novice';
  return 'pre_novice';
}

function getScoringConstants() {
  return {
    substrands: SUBSTRANDS.map(({ id, title, strand }) => ({ id, title, strand })),
    indicators: INDICATORS,
    levels: LEVELS,
    levelMax: LEVEL_MAX,
    cultureTypes: CULTURE_TYPES,
    rigorTypes: RIGOR_TYPES,
  };
}

function bullets(items) {
  return items.map((item, i) => `${i + 1}. ${item}`).join('\n');
}

function cap(text) {
  return text.length > MAX_MESSAGE_CHARS ? `${text.slice(0, MAX_MESSAGE_CHARS - 1)}…` : text;
}

/** The form's feedback fields as the teacher reads them, sent after the report. */
function reportChatMessages(analysis) {
  const r = analysis.observation_record;
  if (!r || !r.action_step) return [];
  const tag = [r.category, r.type].filter(Boolean).join(' · ');
  const first = [`🎯 *Action step*\n${r.action_step}${tag ? `\n_${tag}_` : ''}`];
  if (r.glows.length) first.push(`✨ *Glows*\n${bullets(r.glows)}`);
  if (r.grows.length) first.push(`🌱 *Grows*\n${bullets(r.grows)}`);
  const messages = [cap(first.join('\n\n'))];
  if (r.notes_for_teacher) messages.push(cap(`💬 *A note for you*\n${r.notes_for_teacher}`));
  return messages;
}

module.exports = {
  name: 'silverleaf',
  version: '1.0',
  displayName: 'Silverleaf Teacher Competency Framework',
  maxMarks: null, // depends on how many indicators a lesson could show
  hasDebrief: false,
  hasLPBonus: false,
  jsonMode: true,
  // The observation record is the coach's finished work. The reflection step's rewrite is built for OECD's shape
  // and would drop it, along with the framework key the report dispatches on.
  keepsAnalysisThroughReflection: true,
  reflection: seeNameDo,

  getSystemPrompt,
  buildAnalysisPrompt,
  computeScores,
  getPerformanceBand,
  getScoringConstants,
  reportChatMessages,
  isSingleMove,
  revisionPrompt,
  applyRevision,
};

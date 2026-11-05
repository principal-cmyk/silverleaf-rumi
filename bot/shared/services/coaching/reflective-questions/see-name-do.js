/**
 * The school's post-observation meeting script, "See it. Name it. Do it.", as a WhatsApp reflection.
 *
 * A meeting becomes four turns, in the script's order: See the Success, See the Gap, Name It, Do It. The teacher names
 * things first and the action step comes after they have tried, as it does in the meeting. "Punch it" and the follow
 * up are fixed messages rather than generated ones, so the step the teacher reads is exactly the coach's.
 *
 * The script's practice round and the dates set for materials and observation need two people, so the written script
 * and the what-if question stand in for them here.
 */
const NUM_QUESTIONS = 4;

function beat(questionNumber, { priorActionStep = null } = {}) {
  if (questionNumber === 1) {
    const goal = priorActionStep
      ? `Last time you agreed this goal: "${priorActionStep}". Open with "We set a goal last time of..." and say what you noticed in this lesson that shows how the teacher met it. If this lesson shows no progress on it, name the nearest genuine success instead.`
      : 'This is their first observation with us, so do not mention a goal. Name one concrete positive action from the glows.';
    return `THIS IS SEE THE SUCCESS.
${goal} Then ask: "What made that successful? What was the impact on your students?" Praise an action, not the person. ~40-60 words.`;
  }
  if (questionNumber === 2) {
    return `THIS IS SEE THE GAP.
Narrow the focus to one specific moment from the grows that connects to the action step area, with what the students were doing. Ask what they ideally wanted to see or hear at that moment, and what the gap was between that and what happened. Do not name the action step, and do not tell them the answer: the teacher names the gap. Pick up what they said in their last answer. ~40-60 words.`;
  }
  if (questionNumber === 3) {
    return `THIS IS NAME IT.
Link to what they just named, then ask: "Based on what we discussed, what do you think your action step should be?" Add "What are the key steps to close the gap?" if it reads naturally. Do not suggest an action step, not even a hint. ~25-45 words.`;
  }
  return `THIS IS DO IT.
They have just been told their action step, so do not repeat it. Ask where in an upcoming lesson they will use it, and ask them to write out exactly what they will do and say. Then ask one what-if: "What will you do if...?", naming a specific challenging student response from this lesson. ~40-60 words.`;
}

function fallback(questionNumber) {
  return {
    1: 'Something worked well in this lesson. What made that successful, and what was the impact on your students?',
    2: 'Think of one moment you would change. What did you ideally want to see or hear, and what was the gap between that and what happened?',
    3: 'Based on what we discussed, what do you think your action step should be?',
    4: 'Where in an upcoming lesson will you use this? Write out exactly what you will do and say, and what you will do if a student does not respond as you hope.',
  }[questionNumber];
}

/** "Punch it": states the step before Do It, in the coach's exact words. */
function beforeQuestion(questionNumber, record = {}) {
  if (questionNumber !== NUM_QUESTIONS || !record.action_step) return null;
  const how = (record.how || []).map((step, i) => `${i + 1}. ${step}`).join('\n');
  return `🎯 *So your action step is:*\n${record.action_step}${how ? `\n\n*How:*\n${how}` : ''}`;
}

/** "Follow up": what will be looked for, sent before the report. */
function closing(record = {}) {
  if (!record.action_step) return null;
  return `In your next lesson recording I will look for this: ${record.action_step}`;
}

module.exports = {
  numQuestions: NUM_QUESTIONS,
  commitmentQuestion: NUM_QUESTIONS,
  beat,
  fallback,
  beforeQuestion,
  closing,
};

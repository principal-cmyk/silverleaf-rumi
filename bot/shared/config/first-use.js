/** REGISTER_ON_FIRST_USE=true: teachers register before anything else, and each lesson asks its subject. */
function registersOnFirstUse(env = process.env) {
  return env.REGISTER_ON_FIRST_USE === 'true';
}

// Words people send that are not an answer to any question here.
const NOT_AN_ANSWER = /^(hi+|hello|hey|habari|mambo|shikamoo|salaam?|good (morning|afternoon|evening)|ok(ay)?|yes|no|sure|thanks|thank you|asante|ndiyo|hapana|sawa)[.!]*$/i;

module.exports = { registersOnFirstUse, NOT_AN_ANSWER };

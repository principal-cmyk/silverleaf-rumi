/**
 * The look of the coaching report and observation record: an organisation's logo, colours and fonts, all from env,
 * so a deployment shows its own brand and the code names none. Anything unset or malformed falls back to a plain,
 * neutral look; nothing here can break the page.
 *
 *   REPORT_LOGO_FILE          logo for white backgrounds (.svg, .png or .jpg), relative to the repo root or absolute
 *   REPORT_LOGO_ON_DARK_FILE  the same logo for the coloured header band (usually all white)
 *   REPORT_COLOUR_PRIMARY     main colour: header band, headings, chart marks (#rrggbb)
 *   REPORT_COLOUR_ACCENT      secondary colour: eyebrow text on the band, light fills
 *   REPORT_COLOUR_HIGHLIGHT   used sparingly, for the action step
 *   REPORT_COLOUR_NEUTRAL     greys: secondary text, chart tracks
 *   REPORT_FONT               a Google Fonts family for headings and body, e.g. Montserrat
 *   REPORT_SERIF_FONT         a font already on the reader's machine for subheadings, e.g. Georgia
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const HEX = /^#[0-9a-f]{6}$/i;
const FONT = /^[A-Za-z][A-Za-z0-9 ]{0,39}$/;
const LOGO_TYPES = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const DEFAULTS = { primary: '#1f3b73', accent: '#9cc3ea', highlight: '#f2c14e', neutral: '#6b7280' };

function colour(name, fallback, env) {
  const value = (env[name] || '').trim();
  return HEX.test(value) ? value.toLowerCase() : fallback;
}

function font(name, env) {
  const value = (env[name] || '').trim();
  return FONT.test(value) ? value : null;
}

/** The logo file for `which` ('logo' or 'logo-on-dark'), or null when unset, missing or not an image type. */
function logoFile(which, env = process.env) {
  const raw = (env[which === 'logo-on-dark' ? 'REPORT_LOGO_ON_DARK_FILE' : 'REPORT_LOGO_FILE'] || '').trim();
  if (!raw) return null;
  const file = path.resolve(REPO_ROOT, raw);
  const type = LOGO_TYPES[path.extname(file).toLowerCase()];
  if (!type) return null;
  try {
    if (!fs.statSync(file).isFile()) return null;
  } catch {
    return null;
  }
  return { file, type };
}

function getReportBrand(env = process.env) {
  const sans = font('REPORT_FONT', env);
  const serif = font('REPORT_SERIF_FONT', env);
  return {
    orgName: (env.ORG_NAME || '').trim() || null,
    colours: {
      primary: colour('REPORT_COLOUR_PRIMARY', DEFAULTS.primary, env),
      accent: colour('REPORT_COLOUR_ACCENT', DEFAULTS.accent, env),
      highlight: colour('REPORT_COLOUR_HIGHLIGHT', DEFAULTS.highlight, env),
      neutral: colour('REPORT_COLOUR_NEUTRAL', DEFAULTS.neutral, env),
    },
    sansFont: sans,
    serifFont: serif,
    // Google Fonts stylesheet for the sans font; the admin CSP allows fonts.googleapis.com and fonts.gstatic.com.
    fontHref: sans
      ? `https://fonts.googleapis.com/css2?family=${sans.replace(/ /g, '+')}:wght@300;400;600;700&display=swap`
      : null,
    hasLogo: !!logoFile('logo', env),
    hasLogoOnDark: !!logoFile('logo-on-dark', env),
  };
}

module.exports = { getReportBrand, logoFile };

'use strict';
/**
 * The report's look comes from env. A deployment shows its own brand; anything unset or malformed falls back to a
 * plain look, and nothing a setting holds can reach the page as anything but a colour, a font name or a known file.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getReportBrand, logoFile } = require('../../dashboard/config/report-brand');

describe('getReportBrand', () => {
  test('unset: a neutral look, no logo, no web font', () => {
    const brand = getReportBrand({});
    expect(brand.colours.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(brand).toMatchObject({ hasLogo: false, hasLogoOnDark: false, fontHref: null, sansFont: null, orgName: null });
  });

  test('takes the configured colours and fonts', () => {
    const brand = getReportBrand({
      REPORT_COLOUR_PRIMARY: '#002368', REPORT_COLOUR_ACCENT: '#80BFEC', REPORT_COLOUR_HIGHLIGHT: '#FFC952',
      REPORT_COLOUR_NEUTRAL: '#818283', REPORT_FONT: 'Montserrat', REPORT_SERIF_FONT: 'Georgia', ORG_NAME: 'Example School',
    });
    expect(brand.colours).toEqual({ primary: '#002368', accent: '#80bfec', highlight: '#ffc952', neutral: '#818283' });
    expect(brand.fontHref).toBe('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;700&display=swap');
    expect(brand).toMatchObject({ serifFont: 'Georgia', orgName: 'Example School' });
  });

  test('a malformed colour or font is ignored, never written into the page', () => {
    const brand = getReportBrand({
      REPORT_COLOUR_PRIMARY: 'red; } body { display:none', REPORT_FONT: "Montserrat'); @import url(x", REPORT_SERIF_FONT: '</style>',
    });
    expect(brand.colours.primary).toMatch(/^#[0-9a-f]{6}$/);
    expect(brand).toMatchObject({ sansFont: null, serifFont: null, fontHref: null });
  });

  test('a font name with spaces becomes a Google Fonts family', () => {
    expect(getReportBrand({ REPORT_FONT: 'Open Sans' }).fontHref).toContain('family=Open+Sans:');
  });
});

describe('logoFile', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'report-brand-'));
  const svg = path.join(dir, 'logo.svg');
  const txt = path.join(dir, 'logo.txt');
  fs.writeFileSync(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  fs.writeFileSync(txt, 'not an image');

  test('serves a configured image, with its type', () => {
    expect(logoFile('logo', { REPORT_LOGO_FILE: svg })).toEqual({ file: svg, type: 'image/svg+xml' });
    expect(logoFile('logo-on-dark', { REPORT_LOGO_ON_DARK_FILE: svg })).toEqual({ file: svg, type: 'image/svg+xml' });
    expect(getReportBrand({ REPORT_LOGO_FILE: svg }).hasLogo).toBe(true);
  });

  test('unset, missing, a directory, or not an image type: nothing', () => {
    expect(logoFile('logo', {})).toBeNull();
    expect(logoFile('logo', { REPORT_LOGO_FILE: path.join(dir, 'missing.svg') })).toBeNull();
    expect(logoFile('logo', { REPORT_LOGO_FILE: txt })).toBeNull();
    expect(logoFile('logo', { REPORT_LOGO_FILE: dir })).toBeNull();
  });
});

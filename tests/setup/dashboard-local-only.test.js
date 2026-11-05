'use strict';
/**
 * On a single Mac the dashboard has no HTTPS, so a Secure session cookie is never set and sign-in loops back to the
 * login page. DASHBOARD_LOCAL_ONLY answers that by binding to loopback: nothing off the machine can reach it, which
 * is what makes a plain cookie safe. Without it, a deployed dashboard keeps its Secure cookie and public bind.
 */
const fs = require('fs');
const path = require('path');
const { sessionCookieOptions, listenHost } = require('../../dashboard/lib/portal-app-origins');

afterEach(() => { delete process.env.DASHBOARD_LOCAL_ONLY; });

test('a deployed dashboard keeps its Secure cookie and listens publicly', () => {
  expect(sessionCookieOptions().secure).toBe(true);
  expect(listenHost()).toBe('0.0.0.0');
});

test('local-only mode binds to this machine and can sign in over plain http', () => {
  process.env.DASHBOARD_LOCAL_ONLY = 'true';
  expect(listenHost()).toBe('127.0.0.1');
  expect(sessionCookieOptions().secure).toBe(false);
});

test('the two always change together: a plain cookie on a public bind must be impossible', () => {
  ['false', '', '1', 'yes'].forEach((value) => {
    process.env.DASHBOARD_LOCAL_ONLY = value;
    expect(sessionCookieOptions().secure).toBe(true);
    expect(listenHost()).toBe('0.0.0.0');
  });
});

test('the server listens on that host', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../dashboard/index.js'), 'utf8');
  expect(source).toMatch(/app\.listen\(PORT, listenHost\(\)/);
});

test('the cookie keeps its other protections either way', () => {
  process.env.DASHBOARD_LOCAL_ONLY = 'true';
  expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: 'lax' });
});

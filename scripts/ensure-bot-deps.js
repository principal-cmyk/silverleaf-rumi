#!/usr/bin/env node
/**
 * Railway fallback: if the image has no bot/node_modules (nested install skipped),
 * install before start. Fast no-op when pino is already present.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const marker = path.join(repoRoot, 'bot', 'node_modules', 'pino', 'package.json');

function ensureBotDeps() {
  if (fs.existsSync(marker)) return;
  console.error('[rumi] bot/node_modules missing — running npm ci in bot/ …');
  const installCmd =
    'npm ci --prefix bot --omit=dev --no-fund --no-audit || npm install --prefix bot --omit=dev --no-fund --no-audit';
  execSync(installCmd, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'production' },
  });
}

module.exports = { ensureBotDeps };

if (require.main === module) {
  ensureBotDeps();
}
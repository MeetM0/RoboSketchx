#!/usr/bin/env node

/**
 * One-command project setup for a new machine: `npm run setup`.
 *
 * 1. Checks the Node.js version (Expo SDK 54 / React Native 0.81 need 20.19.4 or newer).
 * 2. Installs dependencies exactly as locked (`npm ci`), so package-lock.json is never rewritten.
 * 3. Verifies the install: type check and the engine tests.
 *
 * Plain Node with no dependencies, so it runs before anything is installed.
 * Pass --skip-checks to stop after installing.
 */

const { spawnSync } = require('child_process');

const MIN_NODE = [20, 19, 4];
const skipChecks = process.argv.includes('--skip-checks');

function step(title) {
  console.log(`\n▶ ${title}`);
}

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    // npm and npx are .cmd files on Windows and need a shell there.
    shell: process.platform === 'win32',
  });
  return result.status === 0;
}

function nodeIsRecentEnough() {
  const current = process.versions.node.split('.').map(Number);
  for (let i = 0; i < MIN_NODE.length; i++) {
    if (current[i] !== MIN_NODE[i]) return current[i] > MIN_NODE[i];
  }
  return true;
}

step(`Node.js ${process.versions.node}`);
if (!nodeIsRecentEnough()) {
  fail(
    `Node.js ${MIN_NODE.join('.')} or newer is required. Install Node 22 LTS ` +
      '(see docs/SETUP.md, step 1), open a new terminal, then run `npm run setup` again.'
  );
}

step('Installing dependencies exactly as locked (npm ci)');
if (!run('npm', ['ci'])) {
  fail(
    'npm ci failed. If it says package.json and package-lock.json are out of sync, run ' +
      '`git checkout -- package.json package-lock.json` and `git pull`, then try again. ' +
      'More fixes: docs/SETUP.md, Troubleshooting.'
  );
}

if (!skipChecks) {
  step('Type check (npx tsc --noEmit)');
  if (!run('npx', ['tsc', '--noEmit'])) fail('Type check failed. See the errors above.');

  step('Engine tests (npm test)');
  if (!run('npm', ['test'])) fail('Tests failed. See the output above.');
}

console.log(`
✔ RoboSketch is set up.

Start it in the browser:   npx expo start --web
Start it on a phone:       docs/SETUP.md, step 5
`);

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const file = process.argv[2] || path.resolve('/data', 'memory.csv');
console.log('import-tm-runner: looking for', file);
if (!fs.existsSync(file)) {
  console.log('No TM file to import at', file);
  process.exit(0);
}

// Prefer compiled JS in dist/scripts/import-tm.js
const compiled = path.join('/usr/src/app/packages/backend/dist/scripts/import-tm.js');
if (fs.existsSync(compiled)) {
  console.log('Running compiled import:', compiled);
  const r = spawnSync('node', [compiled, file], { stdio: 'inherit' });
  process.exit(r.status);
}

// Fallback: try npx ts-node on the TypeScript script (requires ts-node installed)
const tsPath = '/usr/src/app/packages/backend/scripts/import-tm.ts';
if (fs.existsSync(tsPath)) {
  console.log('Falling back to npx ts-node', tsPath);
  const r = spawnSync('npx', ['ts-node', tsPath, file], { stdio: 'inherit' });
  process.exit(r.status);
}

console.error('No import script found');
process.exit(1);

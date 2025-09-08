import fs from 'fs';
import path from 'path';
import { upsertTM } from '../src/db';

async function importFile(filePath: string) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  let count = 0;
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 2) {
      const en = parts[0].trim();
      const pt = parts[1].trim();
      await upsertTM(en, pt);
      count++;
    }
  }
  console.log(`Imported ${count} TM entries`);
}

const arg = process.argv[2];
let file = arg ? arg : path.resolve(process.cwd(), 'packages', 'backend', 'tm', 'memory.csv');
if (!path.isAbsolute(file)) file = path.resolve(process.cwd(), file);
console.log('Importing from', file);
importFile(file).catch(err => { console.error(err); process.exit(1); });

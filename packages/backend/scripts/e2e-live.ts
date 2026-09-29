/**
 * Translates the real .srt files in /tests with the live providers and prints a
 * quality report. Output goes to tests/output/*.pt-BR.srt (git-ignored).
 * Uses a throwaway in-memory database so the cache never hides network behaviour.
 *
 *   npm run e2e:live --workspace packages/backend
 */

import fs from 'fs';
import path from 'path';
import { parseSrt, serializeSrt } from '../src/srt/SrtParser';
import { TranslationPipeline } from '../src/translation/TranslationPipeline';
import { GoogleFreeProvider } from '../src/translation/GoogleFreeProvider';
import { MyMemoryProvider } from '../src/translation/MyMemoryProvider';
import { MemoryRepository } from '../src/db/memory';
import { pgliteDb } from '../src/db/client';

const TESTS = path.resolve(__dirname, '../../../tests');
const OUT = path.join(TESTS, 'output');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(TESTS).filter(f => f.toLowerCase().endsWith('.srt'));
  const pipeline = new TranslationPipeline(new MemoryRepository(pgliteDb()), new GoogleFreeProvider(), new MyMemoryProvider());
  let failed = false;

  for (const file of files) {
    const { cues, warnings } = parseSrt(fs.readFileSync(path.join(TESTS, file)));
    const t0 = Date.now();
    let done = 0;
    const result = await pipeline.translate(cues, {
      from: 'en',
      to: 'pt-BR',
      onProgress: c => {
        done += c.length;
        process.stdout.write(`\r${file}: ${done}/${cues.length}`);
      },
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    const count = (w: string) => result.filter(r => (r.warnings as string[]).includes(w)).length;
    const bySource = result.reduce<Record<string, number>>((a, r) => ((a[r.source] = (a[r.source] ?? 0) + 1), a), {});
    const outName = file.replace(/(\.en)?\.srt$/i, '.pt-BR.srt');
    fs.writeFileSync(path.join(OUT, outName), serializeSrt(result.map(r => ({ ...r, text: r.translation }))));

    console.log(`\n\n=== ${file} (${secs}s) → tests/output/${outName}`);
    console.log(`falas: ${result.length}/${cues.length} | avisos de parse: ${warnings.length}`);
    console.log(`origem: ${JSON.stringify(bySource)}`);
    console.log(
      `não traduzidas: ${count('untranslated')} | linhas longas: ${count('long_line')} | ` +
        `leitura rápida: ${count('fast_reading')} | fallback: ${count('fallback_provider')}`
    );
    console.log('--- amostra ---');
    const step = Math.max(1, Math.floor(result.length / 12));
    for (let i = 0; i < result.length; i += step) {
      console.log(`#${result[i].index} ${JSON.stringify(cues[i].text)}\n    → ${JSON.stringify(result[i].translation)}`);
    }
    const untranslated = result.filter(r => r.warnings.includes('untranslated'));
    if (untranslated.length) {
      console.log('--- não traduzidas ---');
      untranslated.slice(0, 15).forEach(r => console.log(`#${r.index} ${JSON.stringify(r.text)}`));
    }
    if (result.length !== cues.length || untranslated.length > cues.length * 0.02) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

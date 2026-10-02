// Translates one video's English subtitle with the configured engine and writes it next to
// the video as `<video>.pt-BR.Teste-<engine>.srt`, without touching the state database.
// Used to compare engines in Emby before letting the cycle run:
//   docker exec subtitle-translator-auto /app/node_modules/.bin/tsx src/try.ts "/movies/…/Filme.mkv"
import { promises as fs } from 'fs';
import path from 'path';
import { serializeSrt } from '../../backend/src/srt/SrtParser';
import { MemoryRepository } from '../../backend/src/db/memory';
import { GeminiProvider } from '../../backend/src/translation/GeminiProvider';
import { GoogleFreeProvider } from '../../backend/src/translation/GoogleFreeProvider';
import { TranslationPipeline } from '../../backend/src/translation/TranslationPipeline';
import { embeddedInfo, sidecars, stripExt } from './classify';
import { config } from './config';
import { probeStreams } from './media';
import { AutoTranslator, PacedProvider, ProviderStats } from './worker';

/** Memory that never hits nor stores, so the test shows the engine's own output. */
const noMemory = { lookupMany: async () => new Map(), upsertMany: async () => undefined } as unknown as MemoryRepository;

async function main() {
  const video = process.argv[2];
  if (!video) throw new Error('uso: tsx src/try.ts <caminho do vídeo>');
  if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY não definida');

  const side = sidecars(video, await fs.readdir(path.dirname(video)));
  const probe = side.enSrt[0] ? null : await probeStreams(video);
  const stream = probe ? embeddedInfo(probe).enTextStream : null;
  const [kind, ref] = side.enSrt[0] ? ['external', side.enSrt[0]] : stream != null ? ['embedded', String(stream)] : [];
  if (!kind) throw new Error('sem legenda em inglês (texto) para este vídeo');

  const gemini = new GeminiProvider({ apiKey: config.geminiApiKey, models: config.geminiModels, log: console.log });
  const stats = new ProviderStats();
  const pipeline = new TranslationPipeline(
    noMemory,
    new PacedProvider(gemini, config.geminiDelayMs, stats),
    new PacedProvider(new GoogleFreeProvider(), config.requestDelayMs)
  );
  const worker = new AutoTranslator(null as any, pipeline, stats, { label: 'Gemini', groupChars: config.geminiGroupChars, gemini });

  const started = Date.now();
  const cues = await worker.loadCues(video, kind, ref!, probe);
  console.log(`Fonte: ${kind === 'external' ? path.basename(ref!) : `faixa embutida #${ref}`} · ${cues.length} falas`);
  const results = await pipeline.translate(cues, { from: 'en', to: 'pt-BR', concurrency: 1, groupChars: config.geminiGroupChars });

  const out = `${stripExt(video)}.pt-BR.Teste-Gemini.srt`;
  await fs.writeFile(out, serializeSrt(results.map(r => ({ ...r, text: r.translation })), { eol: '\r\n', bom: true }), { mode: 0o664 });
  const usage = gemini.usage().map(u => `${u.model}=${u.requests}`).join(' ');
  const fallback = results.filter(r => r.source === 'fallback').length;
  const same = results.filter(r => r.warnings.includes('untranslated')).length;
  console.log(
    `Gravada em ${Math.round((Date.now() - started) / 1000)}s · pedidos: ${usage} · reserva: ${fallback} · iguais ao original: ${same}\n${out}`
  );
}

main().catch(e => {
  console.error((e as Error).message);
  process.exit(1);
});

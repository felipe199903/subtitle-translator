// Automatic EN → PT-BR subtitle translation for the media server (see packages/auto/README.md).
import path from 'path';
import { neonDb, pgliteDb } from '../../backend/src/db/client';
import { MemoryRepository } from '../../backend/src/db/memory';
import { GoogleFreeProvider } from '../../backend/src/translation/GoogleFreeProvider';
import { MyMemoryProvider } from '../../backend/src/translation/MyMemoryProvider';
import { TranslationPipeline } from '../../backend/src/translation/TranslationPipeline';
import { sleep } from '../../backend/src/translation/TranslationProvider';
import { config } from './config';
import { log } from './log';
import { startServer } from './server';
import { StateRepository } from './state';
import { AutoTranslator, PacedProvider } from './worker';

async function main() {
  const localDb = pgliteDb(path.join(config.dataDir, 'pglite'));
  const memoryDb = config.memoryDatabaseUrl ? neonDb(config.memoryDatabaseUrl) : localDb;
  const state = new StateRepository(localDb);
  const pipeline = new TranslationPipeline(
    new MemoryRepository(memoryDb),
    new PacedProvider(new GoogleFreeProvider(), config.requestDelayMs),
    new PacedProvider(new MyMemoryProvider(), config.requestDelayMs)
  );
  const worker = new AutoTranslator(state, pipeline);

  startServer(state, worker);
  log(
    `Iniciado · pastas: ${config.mediaRoots.join(', ')} · ${config.filesPerCycle} arquivo(s)/${config.cycleMinutes} min,`,
    `até ${config.dailyLimit}/dia · espera ${config.waitDays} dias · memória: ${config.memoryDatabaseUrl ? 'Postgres externo' : 'local'} ·`,
    `status em http://0.0.0.0:${config.port}`
  );

  let nextScan = 0;
  for (;;) {
    try {
      if (Date.now() >= nextScan) {
        await worker.scan();
        nextScan = Date.now() + config.scanHours * 3_600_000;
      }
      await worker.translateQueued();
    } catch (e) {
      log('Erro no ciclo:', e);
    }
    await sleep(config.cycleMinutes * 60_000);
  }
}

main().catch(e => {
  log('Falha ao iniciar:', e);
  process.exit(1);
});

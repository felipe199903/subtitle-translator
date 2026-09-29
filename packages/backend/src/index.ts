// Local development server. On Vercel the app is served by /api/index.ts instead.
import fs from 'fs';
import path from 'path';

// Load .env / .env.local (e.g. from `vercel env pull .env.local`) without extra dependencies.
for (const file of ['.env.local', '.env']) {
  for (const dir of [process.cwd(), path.resolve(__dirname, '../../..')]) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) process.loadEnvFile(p);
  }
}
process.env.FRONTEND_URL ??= 'http://localhost:4200';
// Without DATABASE_URL, keep local data in an embedded Postgres folder (git-ignored).
process.env.PGLITE_DIR ??= path.resolve(__dirname, '../.data/pglite');

import('./app').then(({ createApp }) => {
  const PORT = process.env.PORT || 3001;
  createApp().listen(PORT, () => {
    const db = process.env.DATABASE_URL ? 'Neon Postgres (DATABASE_URL)' : 'PGlite local (packages/backend/.data)';
    console.log(`🚀 API em http://localhost:${PORT} · banco: ${db}`);
  });
});

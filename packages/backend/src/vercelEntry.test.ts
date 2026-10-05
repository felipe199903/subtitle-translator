import request from 'supertest';

// The Vercel entry imports the real app; point it at an in-memory PGlite.
process.env.PGLITE_DIR = 'memory://';

describe('Vercel entry (api/index.ts)', () => {
  let closeDb: (() => Promise<void>) | undefined;
  afterAll(() => closeDb?.());

  it('exports an Express handler that serves the API routes', async () => {
    const handler = (await import('../../../api/index')).default;
    const db = (await import('./db/client')).getDb();
    closeDb = db.close;
    await request(handler).get('/api/health').expect(200);
    await request(handler).get('/api/subtitles/jobs/nope').expect(401);
    const { cookie } = await (await import('./__tests__/fixtures')).signIn(db);
    const res = await request(handler).get('/api/subtitles/jobs/nope').set('Cookie', cookie).expect(404);
    expect(res.body.error).toMatch(/não encontrada/);
    const created = await request(handler)
      .post('/api/subtitles/jobs')
      .set('Cookie', cookie)
      .attach('file', Buffer.from('1\n00:00:01,000 --> 00:00:02,000\nHi there\n'), 'a.srt')
      .expect(201);
    expect(created.body.data.cues).toHaveLength(1);
  }, 30000);

  it('explains the missing database on Vercel', async () => {
    jest.resetModules();
    process.env.VERCEL = '1';
    try {
      const { getDb } = await import('./db/client');
      await expect(getDb().query('SELECT 1')).rejects.toThrow(/Storage/);
      // …and the health check reports it, so a fresh deploy can be verified at /api/health.
      const { createApp } = await import('./app');
      const res = await request(createApp()).get('/api/health').expect(503);
      expect(res.body.database).toMatch(/DATABASE_URL/);
    } finally {
      delete process.env.VERCEL;
    }
  });
});

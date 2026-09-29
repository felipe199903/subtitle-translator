import request from 'supertest';
import { createApp } from '../app';
import { SHERLOCK, FakeProvider, readFixture, useTestDb } from '../__tests__/fixtures';
import { TranslationProvider } from '../translation/TranslationProvider';

const API = '/api/subtitles';
const t = useTestDb();

const makeApp = (primary: TranslationProvider = new FakeProvider()) => createApp({ db: t.db, primary, fallback: null });

/** Drives the job like the browser does: POST /translate until done. */
async function translateAll(app: any, id: string, maxCalls = 50) {
  let calls = 0;
  let last: any;
  do {
    last = (await request(app).post(`${API}/jobs/${id}/translate`).expect(200)).body.data;
    calls++;
  } while (last.status === 'translating' && calls < maxCalls);
  return { calls, last };
}

const upload = (app: any, file = readFixture(SHERLOCK), name = 'Sherlock Gnomes (2018).en.srt') =>
  request(app).post(`${API}/jobs`).attach('file', file, name);

const binary = (res: any, cb: any) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('jobs API', () => {
  it('uploads, translates in batches, accepts an edit and downloads the final SRT', async () => {
    const app = makeApp();
    const created = await upload(app).expect(201);
    const job = created.body.data;
    expect(job).toMatchObject({ fileName: 'Sherlock Gnomes (2018).en.srt', from: 'en', to: 'pt-BR', detectedLanguage: 'en', status: 'translating' });
    expect(job.cues).toHaveLength(1128);
    expect(job.progress).toEqual({ done: 0, total: 1128 });

    // Each call returns the cues it translated and the overall progress.
    const first = (await request(app).post(`${API}/jobs/${job.id}/translate`).expect(200)).body.data;
    expect(first.status).toBe('translating');
    expect(first.cues.length).toBeGreaterThan(50);
    expect(first.progress.done).toBe(first.cues.length);
    expect(first.cues[0].translation).toMatch(/^PT:/);

    const { calls, last } = await translateAll(app, job.id);
    expect(calls).toBeGreaterThan(1);
    expect(last).toMatchObject({ status: 'done', progress: { done: 1128, total: 1128 } });

    const edit = await request(app)
      .patch(`${API}/jobs/${job.id}/cues/0`)
      .send({ translation: 'Bem-vindos!\r\nChegaram bem na hora.' })
      .expect(200);
    expect(edit.body.data.cue).toMatchObject({ source: 'user', translation: 'Bem-vindos!\nChegaram bem na hora.' });

    const dl = await request(app).get(`${API}/jobs/${job.id}/download`).buffer(true).parse(binary).expect(200);
    expect(dl.headers['content-disposition']).toContain('Sherlock Gnomes (2018).pt-BR.srt');
    const text = (dl.body as Buffer).toString('utf8');
    expect(text.startsWith('﻿1\r\n00:01:03,600 --> 00:01:08,288\r\nBem-vindos!\r\nChegaram bem na hora.\r\n\r\n2\r\n')).toBe(true);
    expect(text.split('-->').length - 1).toBe(1128);
  });

  it('resumes where it stopped after the page is reloaded', async () => {
    const app = makeApp();
    const id = (await upload(app)).body.data.id;
    await request(app).post(`${API}/jobs/${id}/translate`).expect(200);

    // "F5": the page reloads the job and continues the loop.
    const reloaded = (await request(app).get(`${API}/jobs/${id}`).expect(200)).body.data;
    expect(reloaded.status).toBe('translating');
    expect(reloaded.progress.done).toBeGreaterThan(0);
    expect(reloaded.progress.done).toBeLessThan(1128);

    const { last } = await translateAll(app, id);
    expect(last.progress).toEqual({ done: 1128, total: 1128 });
  });

  it('survives two tabs translating the same job at once', async () => {
    const app = makeApp();
    const id = (await upload(app)).body.data.id;
    await Promise.all([translateAll(app, id), translateAll(app, id)]);
    const job = (await request(app).get(`${API}/jobs/${id}`)).body.data;
    expect(job).toMatchObject({ status: 'done', progress: { done: 1128, total: 1128 } });
    const bad = job.cues.filter((c: any) => !(c.translation?.includes('PT:') || c.source === 'none'));
    expect(bad).toEqual([]);
  });

  it('remembers user edits for the next upload of the same file', async () => {
    const app = makeApp();
    const first = (await upload(app)).body.data.id;
    await translateAll(app, first);
    await request(app).patch(`${API}/jobs/${first}/cues/1`).send({ translation: 'Minha versão' }).expect(200);

    const second = (await upload(app)).body.data.id;
    await translateAll(app, second);
    const job = (await request(app).get(`${API}/jobs/${second}`)).body.data;
    expect(job.cues[1]).toMatchObject({ translation: 'Minha versão', source: 'user' });
    expect(job.cues[2].source).toBe('memory');
  });

  it('keeps an edit made while the job is still translating', async () => {
    const app = makeApp();
    const id = (await upload(app)).body.data.id;
    await request(app).patch(`${API}/jobs/${id}/cues/1127`).send({ translation: 'Editado antes' }).expect(200);
    await translateAll(app, id);
    const job = (await request(app).get(`${API}/jobs/${id}`)).body.data;
    expect(job.cues[1127]).toMatchObject({ translation: 'Editado antes', source: 'user' });
  });

  it('retries only untranslated cues', async () => {
    let fail = true;
    const app = makeApp(new FakeProvider(t => (fail ? null : `PT:${t}`)));
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nThis will fail first.\n\n2\n00:00:04,000 --> 00:00:05,000\n...\n';
    const id = (await upload(app, Buffer.from(srt), 'x.srt')).body.data.id;
    await translateAll(app, id);
    expect((await request(app).get(`${API}/jobs/${id}`)).body.data.warningCounts).toEqual({ untranslated: 1 });

    fail = false;
    const retry = await request(app).post(`${API}/jobs/${id}/retry`).expect(200);
    expect(retry.body.data.retrying).toBe(1);
    const { last } = await translateAll(app, id);
    expect(last.status).toBe('done');
    const job = (await request(app).get(`${API}/jobs/${id}`)).body.data;
    expect(job.cues[0].translation).toBe('PT:This will fail first.');
    expect(job.warningCounts).toEqual({});
  });

  it('warns when the file already looks Portuguese', async () => {
    const app = makeApp();
    const srt = '1\n00:00:01,000 --> 00:00:03,000\nEu não sei o que você está fazendo aqui, mas é isso.\n';
    const res = await upload(app, Buffer.from(srt), 'pt.srt').expect(201);
    expect(res.body.data.detectedLanguage).toBe('pt');
    expect(res.body.data.parseWarnings[0]).toMatch(/português/);
  });

  it('rejects files that are not subtitles, or too large for a Vercel function', async () => {
    const app = makeApp();
    expect((await upload(app, Buffer.from('hello world'), 'notes.txt').expect(400)).body.error).toMatch(/legenda/i);
    await request(app).post(`${API}/jobs`).expect(400);
    const big = Buffer.alloc(4 * 1024 * 1024 + 1, 'a');
    expect((await upload(app, big, 'big.srt').expect(400)).body.error).toMatch(/4 MB/);
  });

  it('validates edits, downloads and unknown jobs', async () => {
    const app = makeApp();
    await request(app).get(`${API}/jobs/nope`).expect(404);
    await request(app).post(`${API}/jobs/nope/translate`).expect(404);
    await request(app).get(`${API}/jobs/00000000-0000-4000-8000-000000000000/download`).expect(404);

    const id = (await upload(app)).body.data.id;
    await request(app).get(`${API}/jobs/${id}/download`).expect(409);
    await translateAll(app, id);
    await request(app).patch(`${API}/jobs/${id}/cues/99999`).send({ translation: 'x' }).expect(404);
    await request(app).patch(`${API}/jobs/${id}/cues/abc`).send({ translation: 'x' }).expect(404);
    await request(app).patch(`${API}/jobs/${id}/cues/0`).send({ translation: '   ' }).expect(400);
  });

  it('returns a JSON 500 when the database fails', async () => {
    const broken = { query: async () => { throw new Error('db down'); } };
    const app = createApp({ db: broken, primary: new FakeProvider(), fallback: null });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get(`${API}/jobs/00000000-0000-4000-8000-000000000000`).expect(500);
    expect(res.body.error).toMatch(/Erro interno/);
    err.mockRestore();
  });

  it('answers the health check under /api too', async () => {
    const app = makeApp();
    expect((await request(app).get('/api/health').expect(200)).body).toEqual({ status: 'OK', database: 'ok' });
    await request(app).get('/health').expect(200);
    const broken = createApp({ db: { query: async () => { throw new Error('sem banco'); } }, primary: new FakeProvider() });
    expect((await request(broken).get('/api/health').expect(503)).body.database).toBe('sem banco');
  });
});

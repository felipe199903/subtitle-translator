import request from 'supertest';
import { createApp } from '../app';
import { FakeProvider, signIn, useTestDb } from '../__tests__/fixtures';
import { UserRepository } from '../db/users';
import { GoogleVerifier } from './AuthController';
import { SESSION_COOKIE, signSession, verifySession } from '../auth/session';

const t = useTestDb();

function makeApp(google: GoogleVerifier | null = null) {
  const sent: Array<{ to: string; text: string }> = [];
  const app = createApp({
    db: t.db,
    primary: new FakeProvider(),
    fallback: null,
    stripe: null,
    google,
    mailer: async (to, _subject, _html, text) => {
      sent.push({ to, text });
    },
  });
  return { app, sent };
}

const srt = (n: number) =>
  Buffer.from(
    Array.from({ length: n }, (_, i) => `${i + 1}\n00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String(i % 60).padStart(2, '0')},500\nLine ${i}.\n`).join('\n')
  );

const sessionCookie = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find(c => c.startsWith(`${SESSION_COOKIE}=`))?.split(';')[0];

describe('sessions', () => {
  it('signs, verifies and rejects tampered or expired tokens', () => {
    const token = signSession('u1');
    expect(verifySession(token)).toBe('u1');
    expect(verifySession(token.replace(/.$/, c => (c === 'A' ? 'B' : 'A')))).toBeNull();
    expect(verifySession(`${Buffer.from('{"uid":"x","exp":9999999999}').toString('base64url')}.${token.split('.')[1]}`)).toBeNull();
    expect(verifySession(signSession('u1', Date.now() - 31 * 24 * 3600 * 1000))).toBeNull();
    expect(verifySession(undefined)).toBeNull();
  });
});

describe('auth API', () => {
  it('reports no user without a session, and protects the jobs API', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/auth/me').expect(200)).body.data).toBeNull();
    const res = await request(app).post('/api/subtitles/jobs').attach('file', srt(1), 'a.srt').expect(401);
    expect(res.body.code).toBe('AUTH');
    await request(app).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=forged.token`).expect(200, { data: null });
  });

  it('signs in with a magic link that works once', async () => {
    const { app, sent } = makeApp();
    await request(app).post('/api/auth/magic-link').send({ email: '  Ana@Example.com ' }).expect(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('ana@example.com');
    const token = sent[0].text.match(/token=([\w-]+)/)![1];

    const verified = await request(app).post('/api/auth/verify').send({ token }).expect(200);
    expect(verified.body.data).toMatchObject({ email: 'ana@example.com', plan: 'free', usage: { files: 0 } });
    const cookie = sessionCookie(verified)!;
    expect(cookie).toBeTruthy();
    expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).body.data.email).toBe('ana@example.com');

    // Single use.
    await request(app).post('/api/auth/verify').send({ token }).expect(400);
  });

  it('validates e-mails, limits links per hour and rejects expired tokens', async () => {
    const { app, sent } = makeApp();
    await request(app).post('/api/auth/magic-link').send({ email: 'not-an-email' }).expect(400);
    for (let i = 0; i < 3; i++) await request(app).post('/api/auth/magic-link').send({ email: 'b@example.com' }).expect(200);
    await request(app).post('/api/auth/magic-link').send({ email: 'B@example.com' }).expect(429);
    expect(sent).toHaveLength(3);

    await new UserRepository(t.db).createLoginToken('c@example.com', require('crypto').createHash('sha256').update('old').digest('hex'), -1);
    await request(app).post('/api/auth/verify').send({ token: 'old' }).expect(400);
    await request(app).post('/api/auth/verify').send({}).expect(400);
  });

  it('does not count links that could not be sent against the hourly limit', async () => {
    const app = createApp({
      db: t.db,
      primary: new FakeProvider(),
      fallback: null,
      stripe: null,
      mailer: async () => {
        throw new Error('RESEND_API_KEY não definida');
      },
    });
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    for (let i = 0; i < 4; i++) {
      const res = await request(app).post('/api/auth/magic-link').send({ email: 'd@example.com' }).expect(503);
      expect(res.body.error).toMatch(/enviar o e-mail/);
    }
    err.mockRestore();
    expect(await new UserRepository(t.db).loginTokensSince('d@example.com', 60)).toBe(0);
  });

  it('signs in with Google when configured', async () => {
    await request(makeApp().app).post('/api/auth/google').send({ credential: 'x' }).expect(503);

    const google: GoogleVerifier = async c => (c === 'good' ? { email: 'Gui@Example.com', name: 'Gui', sub: 'g-1' } : null);
    const { app } = makeApp(google);
    await request(app).post('/api/auth/google').send({ credential: 'bad' }).expect(401);
    const res = await request(app).post('/api/auth/google').send({ credential: 'good' }).expect(200);
    expect(res.body.data).toMatchObject({ email: 'gui@example.com', name: 'Gui', plan: 'free' });
    expect(sessionCookie(res)).toBeTruthy();
  });

  it('logs out and deletes the account with its jobs', async () => {
    const { app } = makeApp();
    const { user, cookie } = await signIn(t.db);
    const id = (await request(app).post('/api/subtitles/jobs').set('Cookie', cookie).attach('file', srt(2), 'a.srt').expect(201)).body.data.id;

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    expect(String(out.headers['set-cookie'])).toMatch(/st_session=;/);

    await request(app).delete('/api/auth/account').expect(401);
    await request(app).delete('/api/auth/account').set('Cookie', cookie).expect(200);
    expect(await new UserRepository(t.db).get(user.id)).toBeNull();
    expect(await t.db.query('SELECT id FROM jobs WHERE id = $1', [id])).toEqual([]);
  });
});

describe('plans and ownership', () => {
  it('allows 3 free files a month, then asks to upgrade', async () => {
    const { app } = makeApp();
    const { cookie } = await signIn(t.db);
    for (let i = 0; i < 3; i++) {
      await request(app).post('/api/subtitles/jobs').set('Cookie', cookie).attach('file', srt(2), 'a.srt').expect(201);
    }
    const res = await request(app).post('/api/subtitles/jobs').set('Cookie', cookie).attach('file', srt(2), 'a.srt').expect(402);
    expect(res.body.code).toBe('QUOTA');
    const me = (await request(app).get('/api/auth/me').set('Cookie', cookie)).body.data;
    expect(me).toMatchObject({ plan: 'free', usage: { files: 3 }, limits: { filesPerMonth: 3, maxCues: 1500 } });
  });

  it('limits file length on the free plan but not on Pro', async () => {
    const { app } = makeApp();
    const { user, cookie } = await signIn(t.db);
    const long = srt(1501);
    const res = await request(app).post('/api/subtitles/jobs').set('Cookie', cookie).attach('file', long, 'a.srt').expect(402);
    expect(res.body.code).toBe('TOO_LONG');

    await new UserRepository(t.db).extendPro(user.id, 30);
    await request(app).post('/api/subtitles/jobs').set('Cookie', cookie).attach('file', long, 'a.srt').expect(201);
    const me = (await request(app).get('/api/auth/me').set('Cookie', cookie)).body.data;
    expect(me.plan).toBe('pro');
    expect(me.proUntil).toBeGreaterThan(Date.now() + 29 * 24 * 3600 * 1000);
  });

  it("hides other people's jobs", async () => {
    const { app } = makeApp();
    const ana = await signIn(t.db, 'ana@example.com');
    const bia = await signIn(t.db, 'bia@example.com');
    const id = (await request(app).post('/api/subtitles/jobs').set('Cookie', ana.cookie).attach('file', srt(2), 'a.srt').expect(201)).body.data.id;
    expect((await request(app).get(`/api/subtitles/jobs/${id}`).set('Cookie', ana.cookie).expect(200)).body.data.userId).toBeUndefined();
    await request(app).get(`/api/subtitles/jobs/${id}`).set('Cookie', bia.cookie).expect(404);
    await request(app).post(`/api/subtitles/jobs/${id}/translate`).set('Cookie', bia.cookie).expect(404);
    await request(app).get(`/api/subtitles/jobs/${id}/download`).set('Cookie', bia.cookie).expect(404);
  });
});

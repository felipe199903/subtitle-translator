import { databaseUrl } from './client';

describe('databaseUrl', () => {
  it('prefers DATABASE_URL, then POSTGRES_URL', () => {
    expect(databaseUrl({ DATABASE_URL: 'a', POSTGRES_URL: 'b' })).toBe('a');
    expect(databaseUrl({ POSTGRES_URL: 'b', STORAGE_DATABASE_URL: 'c' })).toBe('b');
  });

  it('accepts a custom Vercel Storage prefix, skipping unpooled variants', () => {
    expect(
      databaseUrl({ STORAGE_DATABASE_URL_UNPOOLED: 'x', STORAGE_POSTGRES_URL_NON_POOLING: 'y', STORAGE_DATABASE_URL: 'pooled' })
    ).toBe('pooled');
    expect(databaseUrl({ NEON_POSTGRES_URL: 'n' })).toBe('n');
  });

  it('returns undefined when nothing is set', () => {
    expect(databaseUrl({ OTHER: 'x', DATABASE_URL: '' })).toBeUndefined();
  });
});

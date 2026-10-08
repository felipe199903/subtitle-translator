import { DEFAULT_EMAIL_FROM, envToPublish, mask, missingRecords, normalizeKeys, relativeName, wantedRecords } from './goLive';

describe('go-live helpers', () => {
  it('publishes only the keys that have a value, with a default sender', () => {
    expect(envToPublish({ STRIPE_SECRET_KEY: ' sk_test_1 ', RESEND_API_KEY: 're_1', GEMINI_API_KEY: '', OTHER: 'x' })).toEqual([
      { name: 'RESEND_API_KEY', value: 're_1' },
      { name: 'EMAIL_FROM', value: DEFAULT_EMAIL_FROM },
      { name: 'STRIPE_SECRET_KEY', value: 'sk_test_1' },
    ]);
    expect(envToPublish({ EMAIL_FROM: 'Eu <a@b.c>', RESEND_API_KEY: 're_1' }).find(e => e.name === 'EMAIL_FROM')?.value).toBe('Eu <a@b.c>');
    expect(envToPublish({})).toEqual([]);
  });

  it('turns Resend records into zone-relative DNS records, plus DMARC', () => {
    expect(relativeName('send.subtitle-translator.com.br.')).toBe('send');
    expect(relativeName('resend._domainkey')).toBe('resend._domainkey');
    expect(relativeName('subtitle-translator.com.br')).toBe('');
    const wanted = wantedRecords([
      { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.sa-east-1.amazonses.com', priority: 10 },
      { record: 'SPF', name: 'send', type: 'TXT', value: '"v=spf1 include:amazonses.com ~all"' },
      { record: 'DKIM', name: 'resend._domainkey.subtitle-translator.com.br', type: 'TXT', value: 'p=MIGf' },
    ]);
    expect(wanted).toEqual([
      { name: 'send', type: 'MX', value: 'feedback-smtp.sa-east-1.amazonses.com', mxPriority: 10 },
      { name: 'send', type: 'TXT', value: '"v=spf1 include:amazonses.com ~all"' },
      { name: 'resend._domainkey', type: 'TXT', value: 'p=MIGf' },
      { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none;' },
    ]);
  });

  it('creates only what is missing and reports conflicting records', () => {
    const wanted = wantedRecords([
      { name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all' },
      { name: 'resend._domainkey', type: 'TXT', value: 'p=NEW' },
    ]);
    const { create, conflicts } = missingRecords(wanted, [
      { name: 'send', type: 'TXT', value: '"v=spf1 include:amazonses.com ~all"' },
      { name: 'resend._domainkey', type: 'TXT', value: 'p=OLD' },
      { name: '', type: 'A', value: '76.76.21.21' },
    ]);
    expect(create.map(r => r.name)).toEqual(['_dmarc']);
    expect(conflicts.map(r => r.name)).toEqual(['resend._domainkey']);
  });

  it('accepts the key names used in the .env', () => {
    const keys = normalizeKeys({ RESEND: 're_1', 'STRIPE-CHAVE-SECRETA': ' sk_test_2 ', 'STRIPE-CHAVE-PUBLICAVEL': 'pk_test_3' });
    expect(keys).toMatchObject({ RESEND_API_KEY: 're_1', STRIPE_SECRET_KEY: 'sk_test_2' });
    expect(envToPublish(keys).map(e => e.name)).toEqual(['RESEND_API_KEY', 'EMAIL_FROM', 'STRIPE_SECRET_KEY']);
    expect(normalizeKeys({ STRIPE_SECRET_KEY: 'sk_live_a', 'STRIPE-CHAVE-SECRETA': 'sk_test_b' }).STRIPE_SECRET_KEY).toBe('sk_live_a');
  });

  it('masks secrets', () => {
    expect(mask('sk_live_abcdef123456')).toBe('sk_live_…3456');
    expect(mask('re_abcd9999')).toBe('re_…9999');
    expect(mask('whatever-xyz1')).toBe('…xyz1');
  });
});

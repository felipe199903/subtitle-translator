// Tests use in-memory PGlite databases; never talk to a real Neon database.
for (const key of Object.keys(process.env)) {
  if (/^(DATABASE_URL|POSTGRES_URL)$|_(DATABASE|POSTGRES)_URL$/.test(key)) delete process.env[key];
}

// Deterministic auth/billing settings: no real Stripe, Google or e-mail calls from tests.
process.env.SESSION_SECRET = 'test-session-secret';
for (const key of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'GOOGLE_CLIENT_ID', 'RESEND_API_KEY', 'APP_URL', 'GEMINI_API_KEY']) {
  delete process.env[key];
}

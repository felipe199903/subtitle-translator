// Tests use in-memory PGlite databases; never talk to a real Neon database.
for (const key of Object.keys(process.env)) {
  if (/^(DATABASE_URL|POSTGRES_URL)$|_(DATABASE|POSTGRES)_URL$/.test(key)) delete process.env[key];
}

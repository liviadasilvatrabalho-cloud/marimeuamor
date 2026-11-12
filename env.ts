import dotenv from 'dotenv';

// `neon deploy` writes the connection strings to .env.local; keep .env as fallback.
// This module is imported first so the env is available before db.ts is evaluated.
dotenv.config({ path: ['.env.local', '.env'] });

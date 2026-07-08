// Vitest setup — runs before any test module is imported.
// Loads the dedicated test env (test users + keys), then forces NODE_ENV=test
// LAST so server.js does not bind a port (it checks NODE_ENV !== 'test').
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env.test'), override: true });

// Must win over NODE_ENV=development inside .env.test.
process.env.NODE_ENV = 'test';

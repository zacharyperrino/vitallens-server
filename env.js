// Load .env BEFORE any other module evaluates. ESM hoists imports, so this
// must be the first import in every entrypoint (server.js, tests/setup.js).
import dotenv from 'dotenv';
dotenv.config();

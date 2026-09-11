import { defineConfig } from 'vitest/config';

// Two projects:
//   unit        — tests/unit/**: pure, mocked, no env, no network. `npm test`.
//   integration — tests/security.test.js against the real Express app + a
//                 test Supabase project (needs .env.test). `npm run test:integration`.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.js'],
          environment: 'node',
          clearMocks: true,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/security.test.js'],
          setupFiles: ['./tests/setup.js'],
          testTimeout: 30000,
          hookTimeout: 30000,
          pool: 'forks',
          fileParallelism: false,
        },
      },
    ],
  },
});

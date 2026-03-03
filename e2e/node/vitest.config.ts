import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./global-setup.ts'],
    setupFiles: ['./test-setup.ts'],
    testTimeout: 100_000,
    exclude: [...defaultExclude, '**/mitm.test.ts'],
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.test.json',
    },
  },
});

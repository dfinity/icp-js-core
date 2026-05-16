import { createDefaultPreset } from 'ts-jest';

/** @type {import('jest').Config} */
const baseConfig = {
  ...createDefaultPreset({
    tsconfig: '<rootDir>/tsconfig.test.json',
  }),
  testPathIgnorePatterns: ['/node_modules/', '/lib/', '/dist/', '/docs/'],
  testMatch: ['**/src/**/?(*.)+(spec|test).[jt]s'],
  transform: {
    ...createDefaultPreset({ tsconfig: '<rootDir>/tsconfig.test.json' }).transform,
    // @noble/hashes and @noble/curves v2 are pure-ESM; esbuild converts them to CJS for Jest
    '^.+\\.js$': '<rootDir>/jest.esm-transform.cjs',
  },
  transformIgnorePatterns: ['/node_modules/.pnpm/(?!@noble\\+hashes|@noble\\+curves)'],
};

export { baseConfig };

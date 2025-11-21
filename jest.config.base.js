import { createDefaultPreset } from 'ts-jest';

/** @type {import('jest').Config} */
const baseConfig = {
  ...createDefaultPreset({
    tsconfig: '<rootDir>/tsconfig.test.json',
  }),
  testPathIgnorePatterns: ['/node_modules/', '/lib/', '/dist/', '/docs/'],
  testMatch: ['**/src/**/?(*.)+(spec|test).[jt]s'],
};

export { baseConfig };

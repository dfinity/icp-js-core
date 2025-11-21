import { createDefaultPreset } from 'ts-jest';

/** @type {import('jest').Config} */
const baseConfig = {
  ...createDefaultPreset({
    tsconfig: '<rootDir>/tsconfig.test.json',
  }),
  testPathIgnorePatterns: ['/node_modules/', '/lib/', '/dist/', '/docs/'],
  testMatch: ['**/src/**/?(*.)+(spec|test).[jt]s'],
  moduleNameMapper: {
    '^@dfinity/agent$': '<rootDir>/packages/core/src/agent/index.ts',
    '^@dfinity/assets$': '<rootDir>/packages/assets/src/index.ts',
    '^@dfinity/auth-client$': '<rootDir>/packages/auth-client/src/index.ts',
    '^@dfinity/candid$': '<rootDir>/packages/core/src/candid/index.ts',
    '^@dfinity/identity$': '<rootDir>/packages/core/src/identity/index.ts',
    '^@dfinity/identity-secp256k1$': '<rootDir>/packages/core/src/identity/secp256k1/index.ts',
    '^@dfinity/principal$': '<rootDir>/packages/core/src/principal/index.ts',
    '#agent': '<rootDir>/packages/core/src/agent/index.ts',
    '#candid': '<rootDir>/packages/core/src/candid/index.ts',
    '#identity': '<rootDir>/packages/core/src/identity/index.ts',
    '#identity/secp256k1': '<rootDir>/packages/core/src/identity/secp256k1/index.ts',
    '#principal': '<rootDir>/packages/core/src/principal/index.ts',
  },
};

export { baseConfig };

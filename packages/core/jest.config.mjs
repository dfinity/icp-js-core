import { baseConfig } from '../../jest.config.base.js';

const CORE_PACKAGE_PATH = `<rootDir>/packages/core/src`;

/** @type {import('jest').Config} */
const config = {
  ...baseConfig,
  moduleDirectories: ['node_modules'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  rootDir: '../..',
  projects: [
    getProjectConfig('agent', { fakeTimers: { enableGlobally: true } }),
    getProjectConfig('candid'),
    getProjectConfig('identity'),
    getProjectConfig('identity/secp256k1'),
    getProjectConfig('principal'),
  ],
};

/**
 * Get the project configuration for a given package name.
 * @param {'principal'} packageName - The name of the package.
 * @param {import('@jest/types').Config.InitialProjectOptions} options - The options to add to the project configuration.
 * @returns {import('@jest/types').Config.InitialProjectOptions} - The project configuration.
 */
function getProjectConfig(packageName, options = {}) {
  return {
    ...baseConfig,
    rootDir: '../..',
    displayName: packageName,
    moduleNameMapper: {
      '#agent': `${CORE_PACKAGE_PATH}/agent/index.ts`,
      '#candid': `${CORE_PACKAGE_PATH}/candid/index.ts`,
      '#identity': `${CORE_PACKAGE_PATH}/identity/index.ts`,
      '#principal': `${CORE_PACKAGE_PATH}/principal/index.ts`,
    },
    roots: [`${CORE_PACKAGE_PATH}/${packageName}`],
    ...options,
  };
}

export default config;

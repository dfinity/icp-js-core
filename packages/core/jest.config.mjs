import { baseConfig } from '../../jest.config.base.js';

const CORE_PACKAGE_NAME = 'core';

/** @type {import('jest').Config} */
const config = {
  ...baseConfig,
  moduleDirectories: ['node_modules'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  rootDir: '../..',
  projects: [
    getProjectConfig('agent', { fakeTimers: { enableGlobally: true } }),
    getProjectConfig('candid'),
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
    roots: [`<rootDir>/packages/${CORE_PACKAGE_NAME}/src/${packageName}`],
    ...options,
  };
}

export default config;

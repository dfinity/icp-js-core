import { baseConfig } from '../../jest.config.base.js';

const CORE_PACKAGE_NAME = 'core';

/** @type {import('jest').Config} */
const config = {
  ...baseConfig,
  moduleDirectories: ['node_modules'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  rootDir: '../..',
  projects: [
    getProjectConfig('principal'),
    getProjectConfig('candid'),
  ],
};

/**
 * Get the project configuration for a given package name.
 * @param {'principal'} packageName - The name of the package.
 * @returns {import('@jest/types').Config.InitialProjectOptions} - The project configuration.
 */
function getProjectConfig(packageName) {
  return {
    ...baseConfig,
    rootDir: '../..',
    displayName: packageName,
    roots: [`<rootDir>/packages/${CORE_PACKAGE_NAME}/src/${packageName}`],
  };
}

export default config;

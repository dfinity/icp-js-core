#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { Migrator } from './migrator.ts';
import { DEFAULT_FILES_PATTERNS, DEFAULT_IGNORE_PATTERNS } from './constants.ts';
import { readGitignorePatterns } from './gitignore.ts';
import chalk from 'chalk';
import { PackageManager } from './types.ts';
import { detectPackageManager } from './package-manager.ts';

const CLI_TOOL_NAME = '@icp-sdk/core-migrate';
// injected by esbuild during build time
declare const CLI_TOOL_VERSION: string;

interface CliOptions {
  filesPatterns: string;
  packageManager?: PackageManager;
}

const program = new Command();

program
  .name(CLI_TOOL_NAME)
  .description('CLI tool to migrate from agent-js to @icp-sdk/core')
  .version(CLI_TOOL_VERSION)
  .argument('[directory]', 'Project directory to migrate (defaults to current directory)', '.')
  .option(
    '-f, --files-patterns <patterns>',
    'comma-separated list of patterns to match files to migrate.',
    DEFAULT_FILES_PATTERNS.join(', '),
  )
  .option(
    '-m, --package-manager <manager>',
    `package manager to use. Supported values: ${Object.values(PackageManager).join(', ')}. Defaults to the package manager used according to the lock file in the project directory.`,
  )
  .action(async (directory: string, options: CliOptions) => {
    try {
      const resolvedDir = resolve(directory);

      if (!existsSync(resolvedDir)) {
        console.error(chalk.red(`❌ Directory does not exist: ${resolvedDir}`));
        process.exit(1);
      }

      if (!existsSync(resolve(resolvedDir, 'package.json'))) {
        console.error(chalk.red(`❌ No package.json found in directory: ${resolvedDir}`));
        process.exit(1);
      }

      console.log(chalk.blue(`📁 Migrating project in: ${resolvedDir}\n`));

      // Get ignore patterns from .gitignore or fall back to defaults
      let ignorePatterns = readGitignorePatterns(resolvedDir);
      if (ignorePatterns.length > 0) {
        console.log(chalk.cyan(`📁 Using .gitignore patterns: ${ignorePatterns.join(', ')}\n`));
      } else {
        ignorePatterns = DEFAULT_IGNORE_PATTERNS;
        console.log(
          chalk.cyan(`📁 Using default ignore patterns: ${DEFAULT_IGNORE_PATTERNS.join(', ')}\n`),
        );
      }

      const filePatterns = options.filesPatterns.split(',').map(pattern => pattern.trim());
      const packageManager = options.packageManager ?? detectPackageManager(resolvedDir);

      const migrator = new Migrator(resolvedDir, filePatterns, ignorePatterns, packageManager);
      const result = await migrator.migrate();

      if (!result.success) {
        console.error(
          chalk.red('\n❌ Migration completed with errors. Please review the output above.'),
        );
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Unexpected error: ${error}`));
      console.error(chalk.red(error instanceof Error && error.stack ? error.stack : String(error)));
      process.exit(1);
    }
  });

program.parse();

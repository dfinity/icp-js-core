import { DependencyManager } from './dependency-manager.ts';
import { CodeMigrator } from './code-migrator.ts';
import { readPackageJson } from './package-manager.ts';
import {
  DEPENDENCY_MAPPINGS,
  NEW_CORE_PACKAGE,
  V3_UPGRADING_GUIDE_URL,
  V4_UPGRADING_GUIDE_URL,
} from './constants.ts';
import type { PackageManager } from './types.ts';
import type { MigrationResult } from './types.ts';
import chalk from 'chalk';
import {
  getDependenciesToRemove,
  hasDfinityDependencies,
  hasV2Dependencies,
  printDependency,
} from './dependencies.ts';

export class Migrator {
  private dependencyManager: DependencyManager;
  private codeMigrator: CodeMigrator;

  constructor(
    private rootDir: string,
    private filePatterns: string[],
    private ignorePatterns: string[],
    packageManager: PackageManager,
  ) {
    const projectInfo = {
      packageManager,
      rootDir,
    };
    this.dependencyManager = new DependencyManager(projectInfo);
    this.codeMigrator = new CodeMigrator(
      DEPENDENCY_MAPPINGS,
      this.filePatterns,
      this.ignorePatterns,
    );
  }

  async migrate(): Promise<MigrationResult> {
    console.log(chalk.blue('🚀 Starting migration to @icp-sdk/core...\n'));

    try {
      // Check if project has @dfinity dependencies
      const packageJson = readPackageJson(this.rootDir);

      if (!hasDfinityDependencies(packageJson)) {
        console.log(chalk.yellow('⚠️  No @dfinity dependencies found. Nothing to migrate.'));
        return {
          success: true,
          filesProcessed: 0,
          importsReplaced: 0,
          dependenciesRemoved: [],
          dependenciesAdded: [],
          errors: [],
        };
      }

      const dependenciesToRemove = getDependenciesToRemove(packageJson);
      if (hasV2Dependencies(dependenciesToRemove)) {
        console.log(chalk.red('❌ Migration blocked: Found agent-js v2 dependencies'));
        console.log(chalk.red('Please upgrade to agent-js v3 before migrating to @icp-sdk/core'));
        console.log(chalk.red('\nV2 dependencies found:'));
        dependenciesToRemove.forEach(dep => {
          console.log(chalk.red(`  - ${printDependency(dep)}`));
        });
        console.log(chalk.red('\nFor more information, please refer to the release notes:'));
        console.log(chalk.blue(V3_UPGRADING_GUIDE_URL));
        console.log(chalk.red('\nNote: This check includes only direct dependencies.'));
        console.log(
          chalk.red(
            'If you continue to see v2 dependencies after upgrading, check your lock file and/or your dependency tree.',
          ),
        );
        process.exit(1);
      }

      console.log(
        chalk.cyan(
          `📦 Found @dfinity dependencies to migrate: ${dependenciesToRemove.map(printDependency).join(', ')}\n`,
        ),
      );

      // Step 1: Remove old dependencies
      console.log(chalk.blue('Step 1: Removing old @dfinity dependencies...'));
      this.dependencyManager.removeDependencies(dependenciesToRemove.map(dep => dep.name));

      // Step 2: Add new core package
      console.log(chalk.blue('\nStep 2: Adding @icp-sdk/core package...'));
      this.dependencyManager.addCorePackage(dependenciesToRemove);

      // Step 3: Migrate source code
      console.log(chalk.blue('\nStep 3: Migrating source code imports...'));
      const codeMigrationResult = await this.codeMigrator.migrateCode(this.rootDir);

      // Compile final result
      const result: MigrationResult = {
        success: codeMigrationResult.success,
        filesProcessed: codeMigrationResult.filesProcessed,
        importsReplaced: codeMigrationResult.importsReplaced,
        dependenciesRemoved: dependenciesToRemove,
        dependenciesAdded: [NEW_CORE_PACKAGE],
        errors: codeMigrationResult.errors,
      };

      // Print summary
      this.printSummary(result);

      return result;
    } catch (error) {
      const errorResult: MigrationResult = {
        success: false,
        filesProcessed: 0,
        importsReplaced: 0,
        dependenciesRemoved: [],
        dependenciesAdded: [],
        errors: [`Migration failed: ${error}`],
      };

      console.error(chalk.red(`\n❌ Migration failed: ${error}`));
      console.log(chalk.yellow('\n💡 Need help?'));
      console.log(
        chalk.yellow(
          "If you're experiencing issues with the migration, please refer to the upgrading guide:",
        ),
      );
      console.log(chalk.blue(V4_UPGRADING_GUIDE_URL));
      return errorResult;
    }
  }

  private printSummary(result: MigrationResult): void {
    console.log(chalk.cyan('\n📊 Summary:'));
    console.log(`   • Files processed: ${result.filesProcessed}`);
    console.log(`   • Imports replaced: ${result.importsReplaced}`);
    console.log(
      `   • Dependencies removed: ${result.dependenciesRemoved.map(printDependency).join(', ')}`,
    );
    console.log(`   • Dependencies added: ${result.dependenciesAdded.join(', ')}`);

    if (result.errors.length > 0) {
      console.log(chalk.yellow(`   • Errors encountered: ${result.errors.length}`));
      result.errors.forEach(error => console.log(chalk.yellow(`     - ${error}`)));
    }

    console.log(chalk.blue('\n📝 Next steps:'));
    console.log('   1. Review the changes made to your source files');
    console.log(
      '   2. Find and replace any remaining @dfinity/* occurrences (e.g. in tests mocks)',
    );
    console.log('   3. Run your tests to ensure everything works correctly');
    console.log('   4. Update any documentation that references the old packages');
    console.log('   5. Commit your changes');
    console.log(chalk.green('\n✨ Migration completed successfully!'));
  }
}

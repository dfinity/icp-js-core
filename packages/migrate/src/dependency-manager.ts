import { execSync } from 'child_process';
import { type ProjectInfo, type DependencyInfo, PackageManager } from './types.ts';
import { NEW_CORE_PACKAGE } from './constants.ts';

enum DependencyType {
  Dependencies = 'dependencies',
  PeerDependencies = 'peerDependencies',
  DevDependencies = 'devDependencies',
}

export class DependencyManager {
  constructor(private projectInfo: ProjectInfo) {}

  removeDependencies(dependencies: string[]): void {
    if (dependencies.length === 0) return;

    const command = this.buildRemoveCommand(dependencies);
    console.log(`Removing dependencies: ${dependencies.join(', ')}`);

    try {
      execSync(command, {
        cwd: this.projectInfo.rootDir,
        stdio: 'inherit',
        encoding: 'utf-8',
      });
      console.log('✅ Dependencies removed successfully');
    } catch (error) {
      throw new Error(`Failed to remove dependencies: ${error}`, { cause: error });
    }
  }

  addCorePackage(removedDependencies: DependencyInfo[]): void {
    // Determine the best dependency type to use based on removed dependencies
    // Priority: dependencies -> peerDependencies -> devDependencies
    let targetType: DependencyType = DependencyType.Dependencies;

    for (const dep of removedDependencies) {
      if (dep.type === DependencyType.Dependencies) {
        targetType = DependencyType.Dependencies;
        break;
      } else if (dep.type === DependencyType.PeerDependencies) {
        targetType = DependencyType.PeerDependencies;
        break;
      } else {
        targetType = DependencyType.DevDependencies;
        break;
      }
    }

    const command = this.buildAddCommand([NEW_CORE_PACKAGE], targetType);
    console.log(`Adding ${NEW_CORE_PACKAGE} as ${targetType}`);

    try {
      execSync(command, {
        cwd: this.projectInfo.rootDir,
        stdio: 'inherit',
        encoding: 'utf-8',
      });
      console.log('✅ Core package added successfully');
    } catch (error) {
      throw new Error(`Failed to add core package: ${error}`, { cause: error });
    }
  }

  private buildRemoveCommand(dependencies: string[]): string {
    return `${this.projectInfo.packageManager} remove ${dependencies.join(' ')}`;
  }

  private buildAddCommand(dependencies: string[], depType: DependencyType): string {
    const depFlag = this.getDependencyFlag(depType);

    switch (this.projectInfo.packageManager) {
      case 'npm':
        return `npm install ${depFlag} ${dependencies.join(' ')}`;
      case 'yarn':
        return `yarn add ${depFlag} ${dependencies.join(' ')}`;
      case 'pnpm':
        return `pnpm add ${depFlag} ${dependencies.join(' ')}`;
      default:
        throw new Error(`Unsupported package manager: ${this.projectInfo.packageManager}`);
    }
  }

  private getDependencyFlag(depType: DependencyType): string {
    switch (depType) {
      case DependencyType.Dependencies:
        return '';
      case DependencyType.PeerDependencies:
        if (this.projectInfo.packageManager === PackageManager.YARN) {
          return '--peer';
        }
        return '--save-peer';
      case DependencyType.DevDependencies:
        return '-D';
      default:
        throw new Error(`Unsupported dependency type: ${depType}`);
    }
  }
}

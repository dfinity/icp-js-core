export interface DependencyMapping {
  oldPackage: string;
  newSubmodule: string;
}

export enum PackageManager {
  NPM = 'npm',
  YARN = 'yarn',
  PNPM = 'pnpm',
}

export interface GenericPackageJson {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
}

export interface DependencyInfo {
  name: string;
  version: string;
  type: keyof GenericPackageJson;
}

export interface ProjectInfo {
  packageManager: PackageManager;
  rootDir: string;
}

export interface MigrationResult {
  success: boolean;
  filesProcessed: number;
  importsReplaced: number;
  dependenciesRemoved: DependencyInfo[];
  dependenciesAdded: string[];
  errors: string[];
}

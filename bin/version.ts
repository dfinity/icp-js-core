// Bumps the version (@jsonpaths: .version of each package's `package.json` in the monorepo.
// TODO: to be replaced with @release-it/bumper when https://github.com/release-it/bumper/pull/35 is merged

import fs from 'fs';
import path from 'path';
import { format as prettierFormat } from 'prettier';
import process from 'process';
import yaml from 'yaml';

import { fileURLToPath } from 'url';

interface PartialPnpmWorkspaceConfig {
  packages: string[];
}

const fileName = fileURLToPath(import.meta.url);
const dirName = path.dirname(fileName);
console.log(fileName);

console.time('script duration');
console.log('Updating package versions...');

// Infer info about workspaces from package.json
const workspaceConfig: PartialPnpmWorkspaceConfig = yaml.parse(
  fs.readFileSync(path.resolve(dirName, '..', 'pnpm-workspace.yaml')).toString(),
);

const newVersion = process.argv[process.argv.length - 1];
console.log(`New version will be: ${newVersion}`);

const excluded = ['docs', 'docs/plugins', 'e2e/node', 'packages/core', 'packages/migrate'];
// Read workspaces from root package.json
const workspaces = workspaceConfig.packages.filter(workspace => {
  return !excluded.includes(workspace);
});

// Update version in root package.json
workspaces.push('.');

workspaces.forEach(async workspace => {
  const packagePath = path.resolve(dirName, '..', workspace, 'package.json');
  console.log(packagePath);
  const json = JSON.parse(fs.readFileSync(packagePath).toString());

  // Set version for package
  json.version = newVersion;

  const formatted = await prettierFormat(JSON.stringify(json), {
    parser: 'json-stringify',
  });

  // Write file
  fs.writeFileSync(packagePath, formatted);
});

import fs from 'node:fs/promises';
import path from 'node:path';
import { ReflectionKind } from 'typedoc';

import { DOCS_DIR, PACKAGES_DIR, TMP_DIR } from './utils/constants.ts';
import { processMarkdown } from './utils/markdown.ts';
import { generateApiDocs } from './utils/typedoc.ts';

const excludePackages = [
  `${PACKAGES_DIR}/core`,
  `${PACKAGES_DIR}/migrate`,
  `${PACKAGES_DIR}/assets`,
  `${PACKAGES_DIR}/auth-client`,
  `${PACKAGES_DIR}/use-auth-client`,
];

const additionalFiles = ['../CHANGELOG.md'];

async function main() {
  const libsDir = path.resolve(DOCS_DIR, 'libs');
  const clean = true;

  if (clean) {
    await fs.rm(libsDir, { recursive: true, maxRetries: 3, force: true });
    await fs.rm(TMP_DIR, { recursive: true, maxRetries: 3, force: true });
  }

  const project = await generateApiDocs({
    outDir: TMP_DIR,
    typedocOptions: {
      entryPoints: ['../packages/*'],
      packageOptions: {
        entryPoints: ['src/index.ts', 'src/canister-env/index.ts'],
        tsconfig: './tsconfig.json',
        readme: 'README.md',
        alwaysCreateEntryPointModule: true, // puts everything into <package>/api folder
      },
      exclude: excludePackages,
      projectDocuments: additionalFiles,
    },
  });

  const modules = project.getChildrenByKind(ReflectionKind.Module);
  for (const { name } of modules) {
    const id = name.startsWith('@') ? name.split('/')[1]! : name;
    const outputRootDir = path.resolve(libsDir, id);

    const apiSrcDir = path.resolve(TMP_DIR, name);
    const files = await fs.readdir(apiSrcDir, {
      withFileTypes: true,
      recursive: true,
    });
    for (const file of files) {
      if (file.isFile() && file.name.endsWith('.md')) {
        const prefix = path.relative(apiSrcDir, file.parentPath);
        const inputFileName = file.name;
        const isReadme = inputFileName.endsWith('README.md');
        const outputFileName = isReadme ? 'index.md' : inputFileName;

        await processMarkdown({
          inputPath: path.resolve(apiSrcDir, prefix, inputFileName),
          outputPath: path.resolve(outputRootDir, prefix, outputFileName),
        });
      }
    }
  }

  const additionalDocumentsDir = path.resolve(TMP_DIR, 'documents');
  const additionalDocuments = await fs.readdir(additionalDocumentsDir, {
    withFileTypes: true,
    recursive: true,
  });
  for (const { name, parentPath } of additionalDocuments) {
    const inputPath = path.resolve(parentPath, name);
    const outputPath = path.resolve(DOCS_DIR, name.toLowerCase());

    await processMarkdown({
      inputPath,
      outputPath,
    });
  }
}

main();

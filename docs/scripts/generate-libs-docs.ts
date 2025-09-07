import fs from 'node:fs/promises';
import path from 'node:path';
import { Application, ProjectReflection, ReflectionKind, type TypeDocOptions } from 'typedoc';
import { type PluginOptions as TypeDocMarkdownOptions } from 'typedoc-plugin-markdown';

import { DOCS_DIR, TMP_DIR } from './utils/constants.ts';
import { titleFromFilename, titleFromIdCapitalized } from './utils/string.ts';
import { processMarkdown } from './utils/markdown.ts';

type LibsLoaderTypeDocOptions = TypeDocMarkdownOptions & TypeDocOptions;

const PACKAGES_DIR = path.resolve('../packages');
const excludePackages = [
  `${PACKAGES_DIR}/core`,
  `${PACKAGES_DIR}/migrate`,
  `${PACKAGES_DIR}/assets`,
  `${PACKAGES_DIR}/auth-client`,
  `${PACKAGES_DIR}/use-auth-client`,
];

async function generateApiDocs(): Promise<ProjectReflection> {
  const defaultTypeDocOptions: LibsLoaderTypeDocOptions = {
    entryPoints: ['../packages/*'],
    entryPointStrategy: 'packages',
    packageOptions: {
      entryPoints: ['src/index.ts'],
      tsconfig: './tsconfig.json',
      readme: 'none',
    },
    plugin: ['typedoc-plugin-markdown', 'typedoc-plugin-frontmatter'],
    tsconfig: './tsconfig.typedoc.json',
    outputs: [{ name: 'markdown', path: TMP_DIR }],
    readme: 'none',
    hidePageTitle: true,
    hideBreadcrumbs: true,
    hidePageHeader: true,
  };

  const app = await Application.bootstrapWithPlugins({
    ...defaultTypeDocOptions,
    exclude: excludePackages,
  });

  const project = await app.convert();
  if (!project) {
    throw new Error('Failed to convert project with TypeDoc');
  }
  await app.generateOutputs(project);

  return project;
}

export async function main() {
  const baseDir = path.resolve('../packages');
  const outDir = path.resolve(DOCS_DIR, 'libs');
  const clean = true;

  if (clean) {
    await fs.rm(outDir, { recursive: true, maxRetries: 3, force: true });
    await fs.rm(TMP_DIR, { recursive: true, maxRetries: 3, force: true });
  }

  const project = await generateApiDocs();

  const modules = project.getChildrenByKind(ReflectionKind.Module);
  for (const { name } of modules) {
    const id = name.startsWith('@') ? name.split('/')[1]! : name;
    const outputRootDir = path.resolve(outDir, id);
    const outputApiDir = path.resolve(outputRootDir, 'api');
    const title = titleFromIdCapitalized(id);

    await processMarkdown({
      inputPath: path.resolve(baseDir, id, 'README.md'),
      outputPath: path.resolve(outputRootDir, `index.md`),
    });

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
        const title = isReadme ? 'Overview' : titleFromFilename(file.name);

        await processMarkdown({
          inputPath: path.resolve(apiSrcDir, prefix, inputFileName),
          outputPath: path.resolve(outputApiDir, prefix, outputFileName),
        });
      }
    }
  }
}

main();

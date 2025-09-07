import { Application, type ProjectReflection, type TypeDocOptions } from 'typedoc';
import {
  type PluginOptions as TypeDocMarkdownOptions,
  MarkdownPageEvent,
  type MarkdownApplication,
} from 'typedoc-plugin-markdown';
import { type PluginOptions as TypeDocFrontmatterOptions } from 'typedoc-plugin-frontmatter';
import { addPageFrontmatter } from './frontmatter.ts';

type LibsLoaderTypeDocOptions = TypeDocMarkdownOptions & TypeDocFrontmatterOptions & TypeDocOptions;

const typedocPluginMarkdownOptions: TypeDocMarkdownOptions = {
  hidePageTitle: true,
  hideBreadcrumbs: true,
  hidePageHeader: true,
};

const typedocPluginFrontmatterOptions: TypeDocFrontmatterOptions = {
  frontmatterGlobals: {
    editUrl: false,
    next: true,
    prev: true,
  },
  readmeFrontmatter: {
    editUrl: false,
    next: true,
    prev: true,
  },
  indexFrontmatter: {},
  frontmatterCommentTags: [],
  frontmatterNamingConvention: 'camelCase',
  preserveFrontmatterCommentTags: false,
  yamlStringifyOptions: {},
};

type GenerateApiDocsOpts = {
  outDir: string;
  typedocOptions: TypeDocOptions;
};

export async function generateApiDocs({
  outDir,
  typedocOptions,
}: GenerateApiDocsOpts): Promise<ProjectReflection> {
  const defaultTypeDocOptions: LibsLoaderTypeDocOptions = {
    entryPointStrategy: 'packages',
    plugin: ['typedoc-plugin-markdown', 'typedoc-plugin-frontmatter'],
    tsconfig: './tsconfig.typedoc.json',
    outputs: [{ name: 'markdown', path: outDir }],
    readme: 'none',
    ...typedocPluginMarkdownOptions,
    ...typedocPluginFrontmatterOptions,
  };

  const app = (await Application.bootstrapWithPlugins({
    ...defaultTypeDocOptions,
    ...typedocOptions,
  })) as MarkdownApplication;

  app.renderer.on(MarkdownPageEvent.BEGIN, addPageFrontmatter);

  const project = await app.convert();
  if (!project) {
    throw new Error('Failed to convert project with TypeDoc');
  }
  await app.generateOutputs(project);

  return project;
}

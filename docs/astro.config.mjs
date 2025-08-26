// @ts-check
import { defineConfig, passthroughImageService } from 'astro/config';
import starlight from '@astrojs/starlight';
import { additionalFilesPlugin } from '@dfinity/starlight/additional-files';
import { markdownUrlsPlugin } from '@dfinity/starlight/markdown-urls';
import { dfinityStarlightTheme } from '@dfinity/starlight/theme';
import { libsPlugin } from '@dfinity/starlight/libs';
import { versionedSidebarPlugin } from '@dfinity/starlight/versioned-sidebar';

const BASE_DOCS_PATH = '/core';
const docsVersion = process.env.DOCS_VERSION ?? 'local';
const packagesDir = '../packages';

// https://astro.build/config
export default defineConfig({
  site: 'https://js.icp.build/',
  base: `${BASE_DOCS_PATH}/${docsVersion}/`,
  image: {
    service: passthroughImageService(),
  },
  integrations: [
    starlight({
      title: 'ICP JS SDK Core',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/dfinity/icp-sdk-js-core' }],
      plugins: [
        dfinityStarlightTheme(),
        markdownUrlsPlugin({
          packagesDir,
        }),
        libsPlugin({
          clean: true,
          baseDir: packagesDir,
          typeDoc: {
            exclude: [
              `${packagesDir}/core`,
              `${packagesDir}/migrate`,
              `${packagesDir}/assets`,
              `${packagesDir}/auth-client`,
              `${packagesDir}/use-auth-client`,
            ],
          },
          frontmatter: {
            editUrl: false,
            next: true,
            prev: true,
          },
          prependSidebar: [
            {
              label: 'Getting Started',
              items: [
                { label: 'Overview', link: '/' },
                { label: 'Installation', link: '/installation' },
                { label: 'Quick Start', link: '/quick-start' },
                { label: 'Typescript', link: '/typescript' },
              ],
            },
          ],
          appendSidebar: [
            {
              label: 'Upgrading',
              autogenerate: { directory: 'upgrading', collapsed: true },
            },
          ],
        }),
        additionalFilesPlugin({
          additionalFiles: [
            {
              path: '../CHANGELOG.md',
              frontmatter: {
                tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 2 },
                pagefind: false,
                editUrl: false,
                next: false,
                prev: false,
              },
            },
          ],
        }),
        versionedSidebarPlugin({
          versionsJsonPath: `${BASE_DOCS_PATH}/versions.json`,
        }),
      ],
    }),
  ],
});

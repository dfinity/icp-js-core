#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';

const LIBS_DIR = 'src/content/docs/libs';
const SPLIT_MARKER = '<!-- split here -->';
const FRONTMATTER_TITLE_KEY = 'title';
const FRONTMATTER_TITLE = `${FRONTMATTER_TITLE_KEY}: Overview`;

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return match[0];
}

function resolveApiPath(submodulePath) {
  const nested = join(submodulePath, 'api', 'index.md');
  if (existsSync(nested)) return nested;
  const flat = join(submodulePath, 'api.md');
  if (existsSync(flat)) return flat;
  return null;
}

function processSubmodule(submodulePath) {
  const submoduleName = basename(submodulePath);
  const apiPath = resolveApiPath(submodulePath);

  if (!apiPath) {
    console.log(`Skipping ${submoduleName}: no api index found`);
    return;
  }

  console.log(`Processing ${apiPath}`);

  const content = readFileSync(apiPath, 'utf-8');
  const splitIndex = content.indexOf(SPLIT_MARKER);

  if (splitIndex === -1) {
    console.log(`  No split marker found, skipping`);
    return;
  }

  const frontmatter = extractFrontmatter(content);

  const firstPart = content.slice(0, splitIndex).trimEnd();
  const secondPart = content.slice(splitIndex + SPLIT_MARKER.length).trimStart();

  const newIndex = firstPart.replace(
    FRONTMATTER_TITLE,
    `${FRONTMATTER_TITLE_KEY}: ${capitalize(submoduleName)}`,
  );

  const oldIndex = `${frontmatter}\n\n${secondPart}`;

  writeFileSync(join(submodulePath, 'index.md'), newIndex + '\n');
  writeFileSync(apiPath, oldIndex);

  console.log(`  Created ${submoduleName}/index.md`);
  console.log(`  Updated ${basename(apiPath)}`);
}

function main() {
  const submodules = readdirSync(LIBS_DIR);
  for (const submodule of submodules) {
    const submodulePath = join(LIBS_DIR, submodule);
    if (statSync(submodulePath).isDirectory()) {
      processSubmodule(submodulePath);
    }
  }
}

main();

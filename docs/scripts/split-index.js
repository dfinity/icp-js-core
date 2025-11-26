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

function processSubmodule(submodulePath) {
  const submoduleName = basename(submodulePath);
  const apiIndexPath = join(submodulePath, 'api', 'index.md');

  if (!existsSync(apiIndexPath)) {
    console.log(`Skipping ${submoduleName}: no api/index.md found`);
    return;
  }

  console.log(`Processing ${apiIndexPath}`);

  const content = readFileSync(apiIndexPath, 'utf-8');
  const splitIndex = content.indexOf(SPLIT_MARKER);

  if (splitIndex === -1) {
    console.log(`  No split marker found, skipping`);
    return;
  }

  const frontmatter = extractFrontmatter(content);

  const firstPart = content.slice(0, splitIndex).trimEnd();
  const secondPart = content.slice(splitIndex + SPLIT_MARKER.length).trimStart();

  // New index.md: first part with title changed to capitalized submodule name
  // Goes to <submodule>/index.md
  const newIndex = firstPart.replace(
    FRONTMATTER_TITLE,
    `${FRONTMATTER_TITLE_KEY}: ${capitalize(submoduleName)}`,
  );

  // Old index.md: original frontmatter + second part (API reference)
  // Stays at <submodule>/api/index.md
  const oldIndex = `${frontmatter}\n\n${secondPart}`;

  writeFileSync(join(submodulePath, 'index.md'), newIndex + '\n');
  writeFileSync(apiIndexPath, oldIndex);

  console.log(`  Created ${submoduleName}/index.md`);
  console.log(`  Updated ${submoduleName}/api/index.md`);
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

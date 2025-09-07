import yaml from 'yaml';
import fs from 'node:fs/promises';
import { writeFile } from './fs.ts';

interface ProcessMarkdownOpts {
  inputPath: string;
  outputPath: string;
}

export async function processMarkdown({
  inputPath,
  outputPath,
}: ProcessMarkdownOpts): Promise<void> {
  const input = await fs.readFile(inputPath, 'utf-8');

  const output = input.replace(/^\s*#\s*.*$/m, '').replaceAll('README.md', 'index.md');

  await writeFile(outputPath, output);
}

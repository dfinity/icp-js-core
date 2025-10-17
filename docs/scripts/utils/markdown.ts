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

  const output = replaceReadmeMentions(removeH1Title(input));

  await writeFile(outputPath, output);
}

function removeH1Title(input: string): string {
  return input.replace(/^\s*#\s+.*$/m, '');
}

function replaceReadmeMentions(input: string): string {
  return input.replaceAll('README.md', 'index.md');
}

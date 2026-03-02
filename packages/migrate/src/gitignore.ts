/* eslint-disable jsdoc/require-jsdoc */

import { readFileSync } from 'fs';
import { join } from 'path';

export function readGitignorePatterns(rootDir: string): string[] {
  const gitignorePath = join(rootDir, '.gitignore');

  try {
    const content = readFileSync(gitignorePath, 'utf-8');
    const lines = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(pattern => {
        // Convert gitignore patterns to glob patterns
        if (pattern.startsWith('*')) {
          // Wildcard pattern
          return pattern;
        }
        if (pattern.startsWith('/')) {
          // Absolute path from root
          return `**/${pattern.slice(1)}/**`;
        }
        if (pattern.endsWith('/')) {
          // Directory
          return `**/${pattern}**`;
        }
        // Simple filename/pattern
        return `**/${pattern}`;
      });

    return lines;
  } catch (error) {
    console.warn(`Warning: Could not read .gitignore file: ${error}`);
    return [];
  }
}

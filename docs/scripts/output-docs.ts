import path from 'node:path';
import { cleanDir, copyDir } from './utils/fs.ts';

const DOCS_VERSION = process.env.DOCS_VERSION || 'local';
const DIST_DIR = 'dist';
const OUT_DIR = path.join(DIST_DIR, DOCS_VERSION);
const DOCS_DIR = './src/content/docs';

async function main() {
  await cleanDir(DIST_DIR);
  await copyDir(DOCS_DIR, OUT_DIR);
}

main();

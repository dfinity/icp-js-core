import path from 'node:path';
import { copyDir } from './utils/fs.ts';

const DOCS_VERSION = process.env.DOCS_VERSION || 'local';
const OUT_DIR = path.join('dist', DOCS_VERSION);
const DOCS_DIR = './src/content/docs';

async function main() {
  await copyDir(DOCS_DIR, OUT_DIR);
}

main();

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

const root = process.cwd();
const generatedRoot = resolve(root, '.generated/ts');
const targetRoot = resolve(root, 'src');
const checkOnly = process.argv.includes('--check');
let count = 0;
let mismatches = 0;

async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scan(path);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    const relativePath = relative(generatedRoot, path);
    if (relativePath.startsWith('..')) throw new Error('Generated output escaped the build directory');
    const target = join(targetRoot, relativePath);
    const next = await readFile(path);
    let previous = null;
    try {
      previous = await readFile(target);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    count++;
    if (previous?.equals(next)) continue;
    if (checkOnly) {
      console.error(`Outdated generated JS: ${relative(root, target)} (run npm run build:typed)`);
      mismatches++;
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, next);
      console.log(`Updated ${relative(root, target)}`);
    }
  }
}

await scan(generatedRoot);
if (!count) throw new Error('TypeScript emitted no JavaScript: refusing to pass');
if (mismatches) process.exitCode = 1;
else console.log(`TypeScript generated output ${checkOnly ? 'matches' : 'synchronized'}: ${count} file(s)`);

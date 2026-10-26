import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const id = 'potted_plant_02';
const metadata = JSON.parse(await readFile(`/tmp/ph-${id}.json`, 'utf8'));
const file = metadata.gltf['1k'].gltf;
const root = join('public/assets/models', id);
const entries = [[`${id}.gltf`, file], ...Object.entries(file.include)];
for (const [name, entry] of entries) {
  if (name.includes('..') || name.startsWith('/') || !entry.url.startsWith('https://dl.polyhaven.org/')) throw new Error('Unexpected asset path');
  const destination = join(root, name);
  await mkdir(dirname(destination), { recursive: true });
  await run('curl', ['--retry', '2', '-fsSL', entry.url, '-o', destination]);
  console.log(destination);
}

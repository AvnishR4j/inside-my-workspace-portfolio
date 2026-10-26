import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
const get = async (url) => (await run('curl', ['--retry', '2', '-fsSL', url], { maxBuffer: 15 * 1024 * 1024 })).stdout;
const origin = 'https://temporary-turbo-carbon-6rxr9v8.vercel.app';
const html = await readFile('/tmp/avnish-portfolio-original.html', 'utf8');
const scripts = [...new Set([...html.matchAll(/src="(\/_next\/static\/chunks\/[^" ]+\.js)"/g)].map(m => m[1]))];
const chunks = [];
for (const path of scripts) chunks.push(await get(origin + path));
const source = (html + chunks.join('\n')).replaceAll('%2F', '/');
const paths = [...new Set(source.match(/\/assets\/[a-zA-Z0-9_./-]+\.(?:jpg|jpeg|png|webp|pdf)/g))];
for (const path of paths) {
  const destination = 'public' + path;
  await mkdir(destination.slice(0, destination.lastIndexOf('/')), { recursive: true });
  await run('curl', ['--retry', '2', '-fsSL', origin + path, '-o', destination]);
  console.log(path);
}
await writeFile('public/assets/source.json', JSON.stringify({ origin, paths }, null, 2));

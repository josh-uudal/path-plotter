import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  }))).flat();
}
const assets = await walk(resolve(root, 'assets'));
const scripts = assets.filter(path => path.endsWith('.js'));
for (const path of scripts) new Script(await readFile(path, 'utf8'), { filename: path });
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
for (const reference of references) {
  if (/^(https?:|#)/.test(reference)) continue;
  assert(!reference.startsWith('/'), `Use relative paths for GitHub Pages: ${reference}`);
  await access(resolve(root, reference));
}
for (const path of assets) {
  if (/\.(js|css)$/.test(path)) {
    assert(references.includes(relative(root, path).replaceAll('\\', '/')), `Unloaded asset: ${path}`);
  }
}
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'HTML contains duplicate ids');
for (const directory of ['scripts', 'tests']) {
  for (const path of await walk(resolve(root, directory))) {
    if (!path.endsWith('.mjs')) continue;
    const result = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
  }
}
console.log(`Checked ${scripts.length} browser scripts, tool/test syntax, HTML ids, and relative asset links.`);

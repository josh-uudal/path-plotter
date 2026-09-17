import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createEditor } from './helpers/editor.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/java-output.json', import.meta.url), 'utf8'));
test('Java reserved-word checks remain available to the Graphics2D name control', () => {
  const { java } = createEditor();
  assert.equal(java.isReserved('class'), true);
  assert.equal(java.isReserved('g2d'), false);
});

for (const fixture of fixtures) {
  test(`original export preserved: ${fixture.name}`, () => {
    const editor = createEditor(fixture.project, fixture.options);
    assert.equal(editor.java.outputText(), fixture.output);
  });
}

test('representative generated full classes compile with javac', t => {
  const probe = spawnSync('javac', ['-version'], { encoding: 'utf8' });
  if (probe.error?.code === 'ENOENT') {
    t.skip('javac is not installed');
    return;
  }
  assert.equal(probe.status, 0, probe.error?.message || probe.stderr);
  const temporary = mkdtempSync(join(tmpdir(), 'path-plotter-java-'));
  try {
    for (const buildOnce of [false, true]) {
      const directory = join(temporary, buildOnce ? 'once' : 'repaint');
      mkdirSync(directory);
      const files = [];
      for (const fixture of fixtures.filter(item => item.project.out === 'full' && item.options.buildOnce === buildOnce)) {
        const editor = createEditor(fixture.project, fixture.options);
        const path = join(directory, fixture.options.className + '.java');
        writeFileSync(path, editor.java.fullClass());
        files.push(path);
      }
      assert(files.length > 0, 'Missing full-class fixtures');
      const result = spawnSync('javac', ['-d', directory, ...files], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.error?.message || result.stderr);
    }
  } finally {
    // Only the unique directory returned by mkdtempSync is removed.
    rmSync(temporary, { recursive: true, force: true });
  }
});

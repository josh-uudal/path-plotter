import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createEditor } from './helpers/editor.mjs';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/java-output.json', import.meta.url), 'utf8'));
test('different image assets with the same filename export distinct downloads and file references', () => {
  const e=createEditor({layers:[
    {kind:'image',name:'one',img:{src:'data:image/png;base64,AA==',name:'photo.png'}},
    {kind:'image',name:'two',img:{src:'data:image/png;base64,BB==',name:'photo.png'}}
  ]});
  const code=e.java.outputText(),assets=e.java.assets();
  assert.equal(assets[0].name,'photo.png');assert.equal(assets[1].name,'photo-2.png');
  assert(code.includes('new File("photo-2.png")'));
});
test('Java reserved-word checks remain available to the Graphics2D name control', () => {
  const { java } = createEditor();
  assert.equal(java.isReserved('class'), true);
  assert.equal(java.isReserved('g2d'), false);
});

for (const fixture of fixtures) {
  test(`export regression: ${fixture.name}`, () => {
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
      // Both overload families previously received double literals and failed.
      const fractional = createEditor({ out: 'full', layers: [
        { kind: 'text', name: 'label', render: 'both', text: { s: 'Hello\nJava', x: 375.5, y: 80.25, size: 24.5 } },
        { kind: 'image', name: 'photo', img: { src: 'data:image/png;base64,AA==', name: 'photo.png' },
          g: { x: 20.5, y: 30.75, w: 150.25, h: 90.5 } }
      ] }, { buildOnce, className: 'FractionalPanel' });
      const source = fractional.java.fullClass();
      assert.match(source, /drawString\("Hello", 375\.5f, 80\.25f\)/);
      assert.match(source, /deriveFont\(24\.5f\)/);
      assert.match(source, /drawImage\(imgPhoto, imageTxPhoto, null\)/);
      const fractionalPath = join(directory, 'FractionalPanel.java');
      writeFileSync(fractionalPath, source); files.push(fractionalPath);
      const result = spawnSync('javac', ['-d', directory, ...files], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.error?.message || result.stderr);
    }
  } finally {
    // Only the unique directory returned by mkdtempSync is removed.
    rmSync(temporary, { recursive: true, force: true });
  }
});

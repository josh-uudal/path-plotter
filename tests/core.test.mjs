import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from './helpers/editor.mjs';

test('imported group ids cannot collide with newly allocated groups', () => {
  const { model } = createEditor({ layers: [{ name: 'imported', group: 'g19' }] });
  assert.equal(model.nextGroupId(), 'g20');
  assert.equal(model.nextGroupId(), 'g21');
});

test('history restores geometry, selection and measurements through undo and redo', () => {
  const editor = createEditor({ layers: [{ name: 'base', kind: 'rect' }] });
  let restores = 0;
  const history = editor.api.createHistory({
    state: editor.state,
    normalize: editor.model.normalize,
    toast: () => {},
    onRestore: () => restores++
  });
  history.push();
  editor.state.layers[0].g.x = 180;
  editor.state.layers.push(editor.model.defaults('second', 'ellipse'));
  editor.state.active = 1;
  editor.state.selLayers = [1];
  editor.state.measures.push({ kind: 'span', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
  history.undo();
  assert.equal(editor.state.layers.length, 1);
  assert.equal(editor.state.layers[0].g.x, 60);
  assert.equal(editor.state.active, 0);
  assert.equal(editor.state.measures.length, 0);
  history.redo();
  assert.equal(editor.state.layers.length, 2);
  assert.equal(editor.state.layers[0].g.x, 180);
  assert.equal(editor.state.active, 1);
  assert.equal(editor.state.measures.length, 1);
  assert.equal(restores, 2);
});

test('splitting a cubic preserves endpoints and the subdivision midpoint', () => {
  const { geometry } = createEditor();
  const start = { x: 0, y: 0 };
  const curve = { cmd: 'cubic', c1x: 0, c1y: 80, c2x: 80, c2y: 80, x: 80, y: 0 };
  const middle = geometry.segPoint(start, curve, 0.5);
  const [left, right] = geometry.splitSeg(start, curve, 0.5);
  assert.equal(left.x, middle.x);
  assert.equal(left.y, middle.y);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const expected = geometry.segPoint(start, curve, t);
    const actual = t <= 0.5
      ? geometry.segPoint(start, left, t * 2)
      : geometry.segPoint(left, right, (t - 0.5) * 2);
    assert(Math.abs(actual.x - expected.x) < 1e-9);
    assert(Math.abs(actual.y - expected.y) < 1e-9);
  }
});

test('nested clip ownership closes on an unclipped layer', () => {
  const { scene } = createEditor({ layers: [
    { name: 'outer', isClip: true },
    { name: 'inner', isClip: true, clipped: true },
    { name: 'inside', clipped: true },
    { name: 'outside' }
  ] });
  assert.deepEqual(JSON.parse(JSON.stringify(scene.clipScopes())), [[], [0], [0, 1], []]);
  assert.equal(scene.clipOwns(0), 2);
  assert.equal(scene.clipOwns(1), 1);
});

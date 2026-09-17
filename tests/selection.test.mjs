import test from 'node:test';
import assert from 'node:assert/strict';
import { createEditor } from './helpers/editor.mjs';

test('empty selection stays empty; toggling the last selected group clears it', () => {
  const { api, state, model } = createEditor({ layers: [
    { name: 'path 1', group: 'g1' }, { name: 'path 2', group: 'g1' }, { kind: 'rect' }
  ] });
  const selection = api.createSelection(state);
  selection.set([0], 0);
  assert.deepEqual(Array.from(state.selLayers), [0, 1]);
  selection.toggle(1);
  selection.normalize();
  assert.equal(state.active, -1);
  assert.equal(model.L(), undefined);
  assert.deepEqual(Array.from(state.selLayers), []);
  selection.set([2], 2);
  selection.toggle(0);
  assert.deepEqual(Array.from(state.selLayers), [0, 1, 2]);
  selection.toggle(0);
  assert.equal(state.active, 2);
  selection.set([]);
  assert.equal(state.active, -1);
  assert.equal(state.sel, null);
});

test('removing a secondary selection keeps the active shape unchanged', () => {
  const { api, state } = createEditor({ layers: [{}, {}, {}] });
  const selection = api.createSelection(state);
  selection.set([0, 1, 2], 2);
  selection.toggle(1);
  assert.equal(state.active, 2);
  assert.deepEqual(Array.from(state.selLayers), [0, 2]);
});

test('undo and redo cross an empty document and preserve deselection', () => {
  const { api, model, state } = createEditor();
  const selection = api.createSelection(state);
  const history = api.createHistory({ state, normalize: model.normalize, toast() {},
    onRestore: selection.normalize });
  history.push();
  state.layers.push(model.defaults('path 1'));
  selection.set([0]);
  history.undo();
  assert.equal(state.layers.length, 0);
  assert.equal(state.active, -1);
  assert.deepEqual(Array.from(state.selLayers), []);
  history.redo();
  assert.equal(state.layers.length, 1);
  assert.equal(state.active, 0);
  selection.set([]);
  history.push();
  state.layers.push(model.defaults('path 2'));
  selection.set([1]);
  history.undo();
  assert.equal(state.layers.length, 1);
  assert.equal(state.active, -1);
  assert.deepEqual(Array.from(state.selLayers), []);
});

test('numbered names follow current renamed and imported names per kind', () => {
  const { model, state } = createEditor();
  assert.equal(model.nextName('path'), 'path 1');
  state.layers.push(model.defaults('path 1'));
  state.layers[0].name = 'path 2';
  assert.equal(model.nextName('path'), 'path 3');
  state.layers.push(model.defaults('PATH 009'), model.defaults('path copy'), model.defaults('ellipse 20'));
  assert.equal(model.nextName('path'), 'path 10');
  assert.equal(model.nextName('ellipse'), 'ellipse 21');
  assert.equal(model.nextName('rect'), 'rect 1');
});

test('empty projects and deselected projects validate, save and recover', async () => {
  const { api } = createEditor();
  const data = new Map();
  const store = api.createSessionStore({ indexedDB: null, local: {
    getItem: key => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key)
  } });
  for (const layers of [[], [{ kind: 'rect', name: 'rect 1' }]]) {
    const project = api.validateProject({ version: 9, layers, active: -1 });
    assert.equal((await store.save(project)).state, 'saved');
    const restored = api.validateProject(await store.read());
    assert.equal(restored.active, -1);
    assert.equal(restored.layers.length, layers.length);
  }
  assert.equal(api.validateProject({ layers: [] }).active, -1);
  assert.equal(api.validateProject({ layers: [{ kind: 'rect' }] }).active, 0);
});

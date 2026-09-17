import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

export function createEditor(project = {}, options = {}) {
  const context = createContext({ window: {} });
  for (const file of ['core/state', 'core/geometry', 'core/scene', 'core/history', 'core/path-editing', 'core/edit-actions', 'canvas/snapping', 'project/validation', 'project/session-store', 'codegen/java2d', 'ui/code-output']) {
    const source = readFileSync(new URL(`../../assets/js/${file}.js`, import.meta.url), 'utf8');
    runInContext(source, context, { filename: file + '.js' });
  }
  const api = context.window.PathPlotter;
  const model = api.createModel(['#2f6f8f', '#b02f4c', '#4f7a3a']);
  const state = model.state;
  Object.assign(state, structuredClone(project));
  state.layers = (project.layers || []).map(layer => model.normalize(structuredClone(layer)));
  const geometry = api.createGeometry({
    state,
    textMetrics() { throw new Error('This test needs real browser font metrics'); }
  });
  const scene = api.createScene(state);
  const java = api.createJavaGenerator({
    state, ...geometry, ...scene,
    polygonal: model.polygonal,
    getBuildOnce: () => options.buildOnce ?? true,
    getClassName: () => options.className || 'ShapePanel'
  });
  return { api, model, state, geometry, scene, java };
}

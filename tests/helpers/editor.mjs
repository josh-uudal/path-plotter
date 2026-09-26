import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

// Node has no DOMMatrix, so layer transforms are inert in tests unless a test
// opts in with {matrix:true}. This is the 2D subset geometry.js relies on, with
// the same post-multiply semantics as the browser class.
class Matrix {
  constructor(init) { [this.a, this.b, this.c, this.d, this.e, this.f] = init || [1, 0, 0, 1, 0, 0]; }
  multiply(o) {
    return new Matrix([this.a * o.a + this.c * o.b, this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d, this.b * o.c + this.d * o.d,
      this.a * o.e + this.c * o.f + this.e, this.b * o.e + this.d * o.f + this.f]);
  }
  translate(x, y) { return this.multiply(new Matrix([1, 0, 0, 1, x, y])); }
  rotate(deg) { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return this.multiply(new Matrix([c, s, -s, c, 0, 0])); }
  scale(x, y) { return this.multiply(new Matrix([x, 0, 0, y === undefined ? x : y, 0, 0])); }
  inverse() {
    const det = this.a * this.d - this.b * this.c;
    return new Matrix([this.d / det, -this.b / det, -this.c / det, this.a / det,
      (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det]);
  }
  transformPoint(p) { return { x: this.a * p.x + this.c * p.y + this.e, y: this.b * p.x + this.d * p.y + this.f }; }
}

export function createEditor(project = {}, options = {}) {
  const context = createContext({ window: {} });
  if (options.matrix) { context.DOMMatrix = Matrix; context.window.DOMMatrix = Matrix; }
  for (const file of ['core/state', 'core/selection', 'core/geometry', 'core/scene', 'core/history', 'core/path-editing', 'core/edit-actions', 'canvas/snapping', 'project/validation', 'project/session-store', 'codegen/java2d', 'ui/code-output']) {
    const source = readFileSync(new URL(`../../assets/js/${file}.js`, import.meta.url), 'utf8');
    runInContext(source, context, { filename: file + '.js' });
  }
  const api = context.window.PathPlotter;
  const model = api.createModel(['#2f6f8f', '#b02f4c', '#4f7a3a']);
  const state = model.state;
  Object.assign(state, structuredClone(project));
  state.layers = (project.layers || []).map(layer => model.normalize(structuredClone(layer)));
  state.active = project.active ?? (state.layers.length ? 0 : -1);
  state.selLayers = project.selLayers ?? (state.active >= 0 ? [state.active] : []);
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

# Shared project instructions

These instructions apply to the whole repository and to both Codex and Claude
Code. `CLAUDE.md` imports this file. Update shared guidance here rather than
maintaining a second copy. The user's current instructions take precedence.

## Product and deployment

- Path Plotter is a browser shape/path editor that emits Java2D source for Swing.
- Keep the site static and deployable from the repository root on GitHub Pages.
- Preserve the zero-build workflow and direct `index.html` opening. The browser
  code uses ordered classic scripts and one `window.PathPlotter` namespace.
- Use relative asset paths. Do not add a framework, bundler, backend, or runtime
  dependency unless the user has authorized that architecture change.
- Google Fonts are the only current externally loaded presentation resource;
  the app has system font fallbacks. Drawing/project data stays in the browser.

## Where code belongs

- `assets/js/core/state.js`: initial state, shape defaults/normalization, group ids.
- `assets/js/core/selection.js`: empty selection, group expansion, selection toggles.
- `assets/js/core/geometry.js`: geometry shared by rendering and Java generation.
- `assets/js/core/scene.js`: paint ordering, boolean runs, and clip ownership.
- `assets/js/core/history.js`: snapshot history, with UI updates passed as callbacks.
- `assets/js/core/path-editing.js`: pen segments, smooth/corner nodes, linked handles.
- `assets/js/core/edit-actions.js`: keyboard nudge gestures and history boundaries.
- `assets/js/canvas/snapping.js`: drawing/move snap resolution with injected geometry.
- `assets/js/project/`: project validation and browser storage; keep imports atomic.
- `assets/js/codegen/java2d.js`: source generation; receives state, geometry, scene
  helpers, and output-option callbacks. Do not read the DOM in this module.
- `assets/js/ui/code-output.js`: escaping, highlighting, and source-to-shape mapping.
- `assets/js/ui/workspace.js`: workspace controls, focus, and edit-session wiring.
- `assets/js/ui/tooltips.js`: hover, focus, and touch help for live descriptions.
- `assets/js/main.js`: canvas rendering, interaction, panels, persistence, rulers,
  set operation lab, and boot. See `docs/architecture.md` before extracting more.
- `assets/css/`: base, layout, and editor rules, in that cascade order.
- `index.html`: markup and module loading order; `main.js` must load last.

Keep each module's API explicit. Do not expose the live editor state globally or
introduce eval-based module loading. Preserve existing behavior during extraction.

## Commands and validation

- `npm run dev`: loopback preview on port 8123; no install required.
- `npm run dev -- --base /path-plotter/`: verify repository-subpath deployment.
- `npm run check`: syntax, local asset references, and HTML id checks.
- `npm test`: regression suite; Java compilation requires `javac` on PATH.
- Use the available browser tools for UI changes. Claude's preview configuration
  invokes the same dev command; no particular assistant/plugin is required.
- Report tests actually run and skips/limitations. Test affected behavior, not
  just internal implementation details. Use temp directories for generated Java.
- Do not commit, deploy, or change repository hosting settings unless requested.

## Model invariants

- One state object `S` owns the drawing. `S.layers[0]` paints first, at the back.
  The Shapes panel renders in reverse: top row is the front. Use each row's
  `data-idx`, never its DOM position, as the model index.
- Empty documents and empty selections are valid. No selection means `active:-1`,
  `selLayers:[]`, and `sel:null`. Guard active-layer reads; keep the inspector
  inactive until a shape is selected. Save/import/history must preserve emptiness.
- Generate default names with `nextName(kind)` so renames and imports cannot
  collide with the next numbered shape. Changing path tools continues the current
  drawing; explicit Finish/New path controls its lifetime. Anchor hits precede
  adding points; closing a path does not add a duplicate endpoint.
- Record `push()` before a drawing mutation. Main supplies a full serializable
  project snapshot, so undo of an import also restores settings and image assets.
- Pen points may have `smooth`, `outX`, and `outY` metadata. Move, scale, flip,
  split, and clone operations must preserve the intended outgoing tangent.
- `sync()` updates selection, layers, properties, rail, measurements, Java, canvas,
  and scheduled persistence. A lighter update path must handle its own history
  and saving requirements. Repeated arrow events form one undo gesture; keyup,
  blur, or another editing action ends it.
- Group ids must come from `nextGroupId()` so imported groups and pasted groups
  do not collide.

## Boolean operations and clips

- `groups()` gathers consecutive layers whose `combine` is not `none`. The first
  layer is the base: its style, opacity, transform, and render mode apply to the
  whole result. Members contribute geometry and operators, not their styles.
- The base's own combine operator is ignored. Reordering can change the base.
- `clipScopes()` is the shared ownership source. A clip region owns consecutive
  `clipped` layers after it in model order; an unclipped layer closes the scope.
- Nested clips intersect. Java uses `clip()` and restores saved clips from the
  innermost scope outward. A region with no owned layers emits nothing.
- Complex boolean preview can fall back to raster compositing and diverge from
  Java `Area`. Do not describe the browser preview as a JVM-rendered guarantee.

## Java generation and storage

- Every paint statement uses `g2n()`; the Graphics2D variable is configurable.
- Keep identifier sanitization, collision suffixes, coordinate precision, and
  both build-once/output modes consistent when changing the generator.
- `Polygon` only supports one closed run of at least three straight points and
  integer coordinates. Other path classes preserve fractional coordinates.
- `projectData()` and `applyProject()` in main.js define the project format.
  Add persistent drawing fields to both; transient drags do not belong there.
- Preserve existing project files and the `pathPlotter/session@1` and
  `pathPlotter/remember@1` storage keys. Version new formats and migrate old ones.
- Session storage prefers IndexedDB and reads the existing localStorage key for
  migration/fallback. Quota failures must report partial or failed saves, never
  claim that missing images are saved. Full JSON downloads embed all available assets.
- Validate project data before mutating state. Schema 9 reads prior projects;
  legacy clip migration applies only to projects older than schema 8.

## Conventions and collaboration

- Browser code follows existing `var`/`function` conventions. Development `.mjs`
  scripts and tests may use modern Node syntax. No browser compilation is needed.
- Preserve UTF-8 and CRLF using `.editorconfig` and `.gitattributes`.
- Comments explain why. Keep CSS tokens in `base.css`; preserve cascade ordering.
- Inspect git status before edits. Do not overwrite another agent's or the user's
  unrelated changes, and do not commit local dependencies or assistant settings.
- Browser state lives inside closures. Exercise UI through real input events;
  layer selection uses pointer events and is not equivalent to a DOM `.click()`.

# Architecture

## Runtime

The site is root `index.html` plus static assets. Classic scripts register factories
on `window.PathPlotter`, and main.js creates their instances after the markup has
loaded. This works on GitHub Pages, an HTTP preview, and direct file opening,
without a build step. Factories keep internal variables private.

Loading order is explicit in index.html:

1. State, selection, geometry, scene, and history factories.
2. Java generator and code-output formatting.
3. Path editing, edit actions, drawing snapping, project validation/storage, tooltips, and workspace UI.
4. Main editor initialization.

The state factory owns shape normalization and the group-id counter. Geometry
receives the shared state plus a text-measurement callback, because browser font
metrics require a canvas. Scene helpers define drawing order and clip ownership.
History receives notification, project serialization, and restore callbacks instead of accessing the DOM. It stores project data once per snapshot, including image sources. Nudge repeats share a history entry until the gesture ends.
The Java generator receives those helpers and live output-option getters; it does
not query controls or render HTML. Syntax formatting is a separate UI concern.

## What remains in main.js

The modules above hold the reusable foundations. The remaining editor
orchestration stays in main.js rather than being split into a chain of shared
globals. It owns:

- Canvas rendering, view transforms, hit testing, and pointer/keyboard events.
- Image caching, fonts, boolean-preview computation, and selection transformations.
- Toolbar, properties, shape stack, dialogs, and event bindings.
- Project files and browser session persistence.
- Rulers and the set operation lab.

As these areas change, extract cohesive modules with explicit inputs and callbacks:

| Responsibility | Intended destination |
| --- | --- |
| Canvas rendering and input | `assets/js/canvas/` |
| Project serialization, import, and storage | `assets/js/project/` |
| Toolbar, inspector, and shape stack | `assets/js/ui/` |
| Measurements and set operation lab | `assets/js/features/` |

Create those modules when there is a real implementation to move. A folder name
alone does not establish an architectural boundary. Avoid copied state, circular
initialization, or an all-purpose global service object.

## Important contracts

Model ordering is back-to-front; the shape list displays front-to-back. Boolean
runs get their appearance from the first model layer. Clip ownership comes from
the shared scene helper. The canvas and Java generator must agree on these rules.

Documents may contain zero layers, and selection may be empty even when shapes
exist. The selection factory represents this as `active: -1` and `selLayers: []`.
The property inspector is inactive until a shape is selected. History and project
recovery preserve this state. Default numbered names scan current layer names,
including renamed and imported shapes.

Path-tool changes preserve an ongoing path, and selecting a single path while a
segment tool is active makes it the drawing target. Handle hits are checked before point
creation; the current run's starting anchor closes it without another endpoint.
Finish exits drawing, Continue resumes the selected path with the segment tool in use (or the one last used), and Escape deselects.

The current `sync()` refreshes most UI and schedules a local save. Live drags often
use smaller update sequences for immediate feedback. History must be recorded
before mutation and persistence must be requested after a committed change.

Session and project-file data use the same serialization functions in main.js.
The project schema is version 9. Validation runs before changing live state. Older projects remain readable; version 8 clip ownership is preserved. Session storage prefers IndexedDB, migrates the original localStorage record, and retains an explicit partial-save fallback when browser quotas reject images. The save status is visible in the header; full JSON backups remain portable.

## Regression strategy

`tests/fixtures/java-output.json` records generator output for representative
paths, primitives, text, clips, booleans, gradients, and output modes, so
refactors can be checked against known output. A matching fixture shows that
output is unchanged, not that it is correct. When a fix intentionally changes
output, update the affected fixtures in the same change. Compilation tests cover
fractional font, text, and image values in both generation modes.

The syntax/static-reference check and browser smoke tests cover loading order and
asset relocation. Preserve CSS concatenation order when moving styles between
files; a refactor should not silently become a visual redesign.

## Editing and output module boundaries

Path editing is DOM independent and works on the existing segment model. Outgoing
pen handles are node metadata, so Continue can reuse a tangent after a reload.
Drawing snapping reuses ruler candidates in sheet coordinates and excludes moving
shapes. Canvas orchestration and feedback stay in main.js.

Workspace UI owns toolbar actions, tabs, focus, field-edit history boundaries, and
save status presentation. Main owns the model callbacks and rendering. The Java
generator records each group’s emitted fields/build/paint blocks as source mapping
metadata; UI mapping does not insert comments or markers into copied Java.

Storage writes are serialized. Clearing storage invalidates queued writes. The
editor waits for recovery before enabling input or scheduling saves, and keeps
trace image data available while image decoding completes. No drawing data is
sent to a server. Browser storage is still subject to browser eviction and limits;
JSON backups are the portable recovery mechanism.

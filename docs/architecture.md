# Architecture

## Runtime

The site is root `index.html` plus static assets. Classic scripts register factories
on `window.PathPlotter`, and main.js creates their instances after the markup has
loaded. This works on GitHub Pages, an HTTP preview, and direct file opening,
without a build step. Factories keep internal variables private.

Loading order is explicit in index.html:

1. State, geometry, scene, and history factories.
2. Java generator and code-output formatting.
3. Path editing, edit actions, drawing snapping, project validation/storage, and workspace UI.
4. Main editor initialization.

The state factory owns shape normalization and the group-id counter. Geometry
receives the shared state plus a text-measurement callback, because browser font
metrics require a canvas. Scene helpers define drawing order and clip ownership.
History receives notification, project serialization, and restore callbacks instead of accessing the DOM. It stores project data once per snapshot, including image sources. Nudge repeats share a history entry until the gesture ends.
The Java generator receives those helpers and live output-option getters; it does
not query controls or render HTML. Syntax formatting is a separate UI concern.

## What remains in main.js

This setup extracts the reusable foundations. The remaining editor orchestration
has not been mechanically split into a chain of shared globals. It still owns:

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

The current `sync()` refreshes most UI and schedules a local save. Live drags often
use smaller update sequences for immediate feedback. History must be recorded
before mutation and persistence must be requested after a committed change.

Session and project-file data use the same serialization functions in main.js.
The project schema is version 9. Validation runs before changing live state. Older projects remain readable; version 8 clip ownership is preserved. Session storage prefers IndexedDB, migrates the original localStorage record, and retains an explicit partial-save fallback when browser quotas reject images. The save status is visible in the header; full JSON backups remain portable.

## Regression strategy

Export fixtures were captured from the pre-reorganization generator, so the
extraction can be checked against existing output. The fixture suite covers
representative paths, primitives, text, clips, booleans, gradients, and output
modes. It is not a claim that every original export is correct. The UX
revision intentionally updates fractional text baseline output and image asset guidance. Compilation regressions cover fractional font, text, and image values in both generation modes.

The syntax/static-reference check and browser smoke tests cover loading order and
asset relocation. Preserve CSS concatenation order when moving styles between
files; a refactor should not silently become a visual redesign.

## UX module boundaries

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

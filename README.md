# Path Plotter

A browser drawing editor that turns shapes and paths into Java2D source for a
Swing `JPanel`. Draw or trace artwork, edit curves, combine and clip shapes, then
copy a Java fragment or a complete runnable class.

## Run locally

With Node.js 22 or newer installed:

```sh
npm run dev
```

Open <http://127.0.0.1:8123>. The preview server uses Node's standard library and
does not need `npm install`. It binds to loopback and disables asset caching.

```sh
npm run dev -- --port 8124
npm run dev -- --base /path-plotter/
```

The second command simulates a GitHub Pages project path. Opening `index.html`
directly is also supported; clipboard and other browser APIs may be restricted
on `file://`. Google Fonts are optional; system font fallbacks are configured.

## Deploy

The root `index.html` and `assets/` are the website. There is no build step,
bundler, framework, or server-side runtime. Keep the existing GitHub Pages
publishing branch and root folder setting. All local asset links are relative,
so the same files work under a repository subpath.

Node, the JDK, npm packages, and the `scripts/` directory are development tools;
GitHub Pages does not need to execute them. No deployment settings were changed
as part of the folder setup.

## Project layout

```text
index.html                 Application markup and script loading order
assets/css/                Base styles, workspace layout, editor controls
assets/js/core/            Drawing state, geometry, history, layer/clip ordering
assets/js/codegen/         Java2D source generation
assets/js/ui/              Workspace controls and code-output formatting
assets/js/canvas/          Drawing and movement snapping
assets/js/project/         Import validation and browser session storage
assets/js/main.js          Canvas, interactions, panels, persistence, feature wiring
docs/                     Architecture notes
examples/                 Openable sample projects
scripts/                  Dependency-free preview server and source checks
tests/                    Regression tests and export fixtures
AGENTS.md                 Shared contributor instructions for coding agents
CLAUDE.md                 Imports AGENTS.md for Claude Code
.claude/launch.json        Claude preview configuration using the same dev command
```

See [architecture](docs/architecture.md) for ownership and remaining extraction
boundaries.

## Checks

```sh
npm run check
npm test
```

Checks cover browser/tool syntax and static asset paths. Tests cover model and
history behavior, geometry, scene ordering, and Java exports. The Java compilation
test runs when `javac` is installed and reports a skip when it is unavailable.
The fixture cases do not certify every supported export combination.

Browser smoke checks: draw a path and a primitive, edit properties, undo/redo,
switch output modes, open Preview and the set operation lab, and reload to check
local session restoration. Also check the repository subpath preview after
changing asset links.

`npm ci` is optional for the TypeScript language tooling in `devDependencies`.
It is not needed to serve the app, run the checks, or run the tests.

## Working with coding agents

Both Codex and Claude Code should use [AGENTS.md](AGENTS.md). Keep shared guidance
there; `CLAUDE.md` imports it to avoid divergent instructions. Existing local
assistant settings are not required to build or preview the project.

## Drawing and exporting

- Pen (`F`): click corners and drag tangent handles for curves. Enter finishes;
  Continue resumes the selected path. Close path joins the ends.
- Select (`V`): edit anchors and handles. The inspector offers smooth/corner nodes
  and line/curve conversion for the segment leading into an endpoint.
- Snap uses grid and nearby object points; Objects toggles geometry snapping.
  Hold the configured fine-placement key (Alt by default) to bypass both.
- Transform groups scaling, alignment, flipping, and affine settings. Appearance
  contains fill, stroke, and opacity. Edit view labels its selection dimming;
  Preview shows the final composition without editor overlays.
- Click a mapped code line to select its shape or point. Copy all output or just
  fields, constructor setup, paint statements, or imports. Download .java always
  exports a complete class; Integration notes lists required image downloads.
- Autosave status is visible in the header. Click it to download a full JSON
  backup. Browser recovery includes images when storage permits.

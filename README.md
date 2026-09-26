# Path Plotter

A browser drawing editor that turns shapes and paths into Java2D source for a
Swing `JPanel`. Draw or trace artwork, edit curves, combine and clip shapes, then
copy a Java fragment or a complete runnable class.

**Try it:** <https://josh-uudal.github.io/path-plotter/>

## Run locally

Open `index.html` in a browser, or serve it with Node.js 22 or newer (no
`npm install` needed):

```sh
npm run dev
```

Then open <http://127.0.0.1:8123>.

## Test

```sh
npm run check
npm test
```

The Java compilation test runs when `javac` is on your PATH.

## Deploy

The repository root is a static site with no build step. GitHub Pages serves it
as-is. See [docs/architecture.md](docs/architecture.md) for how the code is
organized.

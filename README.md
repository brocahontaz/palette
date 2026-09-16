# palette

A lightweight, fully client-side color utility. Extract a palette from an image, inspect
and compare colors, check WCAG contrast and export the result as CSS variables or JSON —
nothing ever leaves your browser.

Part of a family of small self-hosted tools (Portal, Paste, QR, Blueprint, Regex) sharing
a clean, dark-first, minimal interface.

## Features

- Palette extraction from any local PNG, JPEG, WebP or GIF via drag-and-drop or file
  picker, with median-cut quantization running entirely in the browser
- Per-swatch HEX, RGB and HSL values with one-click copy
- Inline editing (color picker + validated hex input), removal and deduplication
- Manual color input, so a palette can be built without any image
- Foreground/background selection from swatches or dedicated pickers, with a live WCAG
  contrast ratio, AA/AAA pass/fail badges for normal and large text, and a text preview
- Live export as CSS custom properties or pretty-printed JSON, with copy buttons
- Clear validation errors for unsupported types, oversized files (20 MB limit) and
  corrupt or undecodable images

## Privacy

No accounts, no database, no analytics, no telemetry, no persistent storage. Images are
decoded and quantized locally in your browser; the only network request your browser
makes is for the app's own static assets. Nothing is ever uploaded.

## Local development

Requires Node 22+.

```sh
npm install
npm run dev        # start dev server
npm test           # run unit tests (vitest)
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
```

## Docker

Build and run locally (development/testing):

```sh
docker compose up --build
# then open http://localhost:8080
```

Or without Compose:

```sh
docker build -t palette-utility:local .
docker run --rm -p 8080:8080 palette-utility:local
```

The image serves the static build with an unprivileged nginx, listens on port `8080`,
and includes a built-in healthcheck.

## Published image

CI publishes images to GitHub Container Registry as `ghcr.io/brocahontaz/palette`
(derived from the repository owner/name). For a production deployment, pull the
published image instead of building from source:

```sh
docker run --rm -p 8080:8080 ghcr.io/brocahontaz/palette:latest
```

Available tags:

- `latest` — most recent build of the default branch (`main`)
- `sha-<commit>` — immutable build for a specific commit
- `X.Y.Z` — build for a matching `vX.Y.Z` Git tag/release

Behind a reverse proxy, forward traffic to port `8080` of the container. The app is
static and path-agnostic; no domain or environment configuration is required.

## CI/CD

A single GitHub Actions workflow (`.github/workflows/ci.yml`) handles both:

1. **CI** — on every push and pull request: install, lint, format check, typecheck,
   tests, and a production build.
2. **Publish** — after CI passes, only on pushes to `main` or `v*` tags (never from
   pull requests or other branches): builds the Docker image from the repository
   Dockerfile and pushes it to GHCR using the workflow's built-in `GITHUB_TOKEN`
   (`packages: write` permission), with tags `latest` (default branch), `X.Y.Z`
   (version tags) and `sha-<commit>` (every publish). Docker layer caching via the
   GitHub Actions cache keeps rebuilds fast.

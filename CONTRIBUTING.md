# Contributing to ChartGPU

Thanks for your interest in contributing!

## Development setup

- **Node.js**: 18+
- **Browser**: WebGPU-capable (Chrome/Edge 113+, Safari 18+). Firefox WebGPU is still in development.

Install dependencies:

- `npm install`

## Common commands

- **Dev server (examples)**: `npm run dev`
  - Opens the examples at `http://localhost:5176/examples/`
- **Build (library)**: `npm run build`

## What to work on

- **Bugs / performance regressions**: please include a minimal reproduction (an `examples/` change is ideal).
- **New features**: open an issue first so we can align on API and behavior.

## Pull requests

- **Keep PRs focused**: one feature/fix per PR when possible.
- **Add/adjust examples when behavior changes**: update or add an example under `examples/` to demonstrate new behavior.
- **Docs updates**: if you change public behavior or API, update `docs/` and the README links as needed.

## Code style and quality

- **TypeScript**: keep types strict and public contracts explicit.
- **WebGPU correctness**: prefer clear validation over silent fallbacks; follow alignment rules for buffer writes.

## Reporting issues

When filing an issue, include:

- Browser + version
- OS + GPU (if known)
- Steps to reproduce (or a small `examples/` PR)
- Console errors / screenshots when relevant


# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**linc** — Code dependency graph visualizer. Analyzes source files (JS/TS/Python/C#/Go) and renders interactive force-directed graphs showing import relationships.

## Monorepo Structure

npm workspaces monorepo with two packages:
- `server/` — Node.js/Express API (port 3001): file discovery, AST/regex parsing, graph assembly
- `client/` — React + Vite frontend (port 5173): D3.js 2D canvas and react-force-graph-3d rendering
- `client/src-tauri/` — Tauri v2 desktop wrapper (Rust)

## Commands

```bash
# Development (runs both server and client concurrently)
npm run dev

# Individual workspaces
npm run dev --workspace=server    # Express with --watch, port 3001
npm run dev --workspace=client    # Vite dev server, port 5173

# Desktop (Tauri)
npm run tauri:dev                 # server + Tauri window (Vite auto-starts)
npm run tauri:build               # builds sidecar binary + .app bundle

# Production
npm run build                     # Vite production build
npm run start                     # start Express server
```

No test runner or linter is configured.

## Architecture

### API

- `POST /api/analyze { path, includeExternal }` → `{ nodes, links, meta }` — main analysis endpoint
- `GET /api/file?path=...` → `{ content, ext, path }` — file preview for sidebar
- `GET /api/pick-folder` → native OS folder picker (browser fallback; desktop uses `@tauri-apps/plugin-dialog`)

### Server Pipeline (builder.js)

1. **Discover** files via glob patterns by extension
2. **Parse** imports in parallel (batches of 50): Babel AST for JS/TS, regex for Python/C#/Go
3. **Resolve** specifiers: relative paths (with extension/index probing), TypeScript path aliases (walks up 4 dirs for tsconfig.json), bare specifiers → external `[ext] pkgName` nodes
4. **Deduplicate** links: keep highest `TYPE_STRENGTH` per source→target pair
5. **Count** connections for node sizing

### Client State (App.jsx)

Global state in App.jsx, no state management library. Key state: `graphData`, `filters` (hiddenFileTypes, hiddenFolders, showExternal), `selectedNode`, `highlightedIds` (BFS neighbors), `viewMode`, `is3D`.

### D3 Simulation (useD3Simulation.js)

Three separate useEffects with distinct responsibilities:
1. **Mount**: SVG setup, zoom/pan, simulation initialization
2. **Data update**: restart simulation when graphData/filters change; preserves old node positions via Map
3. **Highlight-only**: opacity/stroke changes only — never restarts simulation

Simulation stored in `useRef` (not state) to avoid re-renders.

### Tauri Detection

```js
const isTauri = () => '__TAURI_INTERNALS__' in window;
```

Desktop uses native folder dialog; browser falls back to Express `/api/pick-folder` endpoint.

## Key Conventions

- ES modules throughout (server `"type": "module"`)
- Babel ESM interop pattern: `_traverse.default ?? _traverse`
- Vite proxies `/api` → `http://localhost:3001` in dev
- Node radius: `4 + Math.sqrt(connectionCount) * 2`
- Dark theme: background `#0f1117`, text `#e2e8f0`
- Colors: folder-based D3 schemeTableau10; selected=white, outgoing=cyan, incoming=green, mutual=yellow
- `client/src-tauri/gen/` is gitignored — regenerated on cargo build
- Tauri npm scripts include `PATH=$PATH:$HOME/.cargo/bin` for cargo discovery

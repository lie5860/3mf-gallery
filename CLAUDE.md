@AGENTS.md

# 3MF Gallery — Codebase Guide for AI Assistants

## Project Overview

A static-site gallery for browsing and searching 3MF (3D printing) model files. All data is extracted at build time from `.3mf` files on disk; there is no server, no database, and no cloud dependency. The deployed output is plain HTML/JS/CSS served by nginx.

## Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.2.1 | **Non-standard version — read AGENTS.md** |
| Rendering | Static Export (SSG) | `output: "export"` — no server runtime |
| UI | React 19.2.4 | App Router |
| Styling | Tailwind CSS v4 | New `@tailwindcss/postcss` API (not v3) |
| Animations | Framer Motion 12 | Used in `LandingUI` |
| Icons | Lucide React 1.7 | |
| Language | TypeScript 5 (strict) | Path alias `@/*` → `src/*` |
| ZIP parsing | node-stream-zip | Streaming, no full decompression |
| Script runner | tsx | Used for `scripts/extract.ts` |

## Directory Structure

```
3mf-gallery/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── layout.tsx          # Root layout (fonts, ThemeProvider, FOUC script)
│   │   ├── page.tsx            # Homepage — renders <LandingUI>
│   │   ├── library/page.tsx    # Gallery page — renders <SearchFilter>
│   │   └── globals.css         # Tailwind v4 theme + custom CSS vars
│   ├── components/
│   │   ├── LandingUI.tsx       # Hero landing page with Framer Motion
│   │   ├── SearchFilter.tsx    # Main gallery: search, grouping, detail modal
│   │   ├── ThemeProvider.tsx   # Light/dark theme context (localStorage)
│   │   └── ThemeToggle.tsx     # Theme toggle button
│   └── lib/
│       ├── 3mf-parser.ts       # Core parser: ZIP streaming, metadata extraction
│       └── manifest.ts         # Reads public/manifest.json at SSG build time
├── scripts/
│   ├── extract.ts              # CLI: scans .3mf files → public/manifest.json + assets
│   └── deploy.sh               # Full pipeline: extract → build → copy to nginx root
├── public/
│   ├── manifest.json           # Generated — not committed, created by `npm run extract`
│   └── assets/
│       ├── thumbs/             # Generated — extracted thumbnails (named by entry ID)
│       └── previews/           # Generated — extracted preview images
├── next.config.ts              # output: export, trailingSlash, basePath, images unoptimized
├── nginx.conf.example          # Reference nginx config for deployment
└── AGENTS.md                   # Next.js version warning (DO NOT REMOVE)
```

## Development Workflow

### First-time setup

```bash
npm install
```

### Running locally (development)

```bash
# Step 1: Extract metadata from .3mf files (required before build)
MODELS_DIR=/path/to/models npm run extract

# Step 2: Start dev server
npm run dev        # http://localhost:3000
```

### Building for production

```bash
MODELS_DIR=/path/to/models npm run extract   # populates public/manifest.json + assets
npm run build                                  # creates out/
npm run serve                                  # preview out/ locally
```

### Full deployment

```bash
NEXT_PUBLIC_BASE_PATH=/website-dist npm run deploy
```

This runs `extract → build → copy out/ → ../website-dist/`, then copies `index.html` to the parent nginx root.

### Linting

```bash
npm run lint
```

## Environment Variables

| Variable | Used In | Purpose |
|---|---|---|
| `MODELS_DIR` | `scripts/extract.ts` | Single directory of `.3mf` files |
| `MODELS_DIRS` | `scripts/extract.ts` | Colon-separated list of directories (takes priority) |
| `NEXT_PUBLIC_BASE_PATH` | `next.config.ts` | URL path prefix for sub-path deployment (e.g. `/website-dist`) |

No `.env` files are committed. Default for `MODELS_DIR` is the parent of the project (`../`).

## Data Flow

```
.3mf files on disk
       │
       ▼
npm run extract   (scripts/extract.ts  →  src/lib/3mf-parser.ts)
       │
       ├── public/manifest.json          (array of Entry objects)
       ├── public/assets/thumbs/*.png    (extracted thumbnails)
       └── public/assets/previews/*.png  (extracted preview images)
                    │
                    ▼
npm run build  (Next.js SSG — reads manifest.json via src/lib/manifest.ts)
                    │
                    ▼
              out/  (static HTML/JS/CSS — deployed to nginx)
```

There is **no runtime data fetching**. Everything is embedded at build time.

## Key Conventions

### Tailwind CSS v4

This project uses Tailwind **v4**, which has a different setup than v3:
- Configuration is in `globals.css` using `@theme { ... }` blocks, NOT `tailwind.config.js`
- PostCSS plugin is `@tailwindcss/postcss` (not `tailwindcss`)
- Custom colors and fonts are defined as CSS variables inside `@theme`
- Dark mode uses the `.dark` class on `<html>`, **not** `darkMode: 'class'` in a config file

### Dark Mode / Theming

- Theme state lives in `ThemeProvider` (React context + localStorage)
- A blocking inline script in `layout.tsx` reads localStorage before hydration to prevent FOUC
- Tailwind dark variants (`dark:...`) work via the `.dark` class on `<html>`
- System preference is the default when no localStorage value exists

### Static Export Constraints

Because `output: "export"` is set:
- **No API routes** — do not add files under `src/app/api/`
- **No server components that fetch at runtime** — only at build time
- **No `getServerSideProps`** — use `getStaticProps` patterns or direct `fs` reads
- **Image optimization is disabled** (`images: { unoptimized: true }`)
- All pages are pre-rendered to `.html` files

### Path Aliases

Use `@/` instead of relative imports for anything inside `src/`:

```ts
import { getEntries } from "@/lib/manifest";
import SearchFilter from "@/components/SearchFilter";
```

### The `Entry` Interface

The canonical data shape for a 3MF model. Defined in `src/lib/3mf-parser.ts` and re-exported from `src/lib/manifest.ts`:

```ts
interface Entry {
  id: string;              // SHA1 of rel_path — used as filename for extracted assets
  rel_path: string;        // Relative path from scan root
  abs_path: string;        // Absolute path on disk at extraction time
  file_name: string;       // Basename only
  title: string;           // Model title from 3MF metadata
  description: string;
  designer: string;
  creation_date: string;   // ISO date string
  profile_title: string;   // Slicing profile name
  profile_description: string;
  license: string;
  thumb: string | null;    // Path like "assets/thumbs/<id>.png"
  pictures: string[];      // Paths like "assets/previews/<id>_0.png"
  meta: Record<string, string>;  // Raw metadata cache (fingerprint, mtime, etc.)
}
```

### Model Grouping

`SearchFilter.tsx` groups `Entry` objects by `title`. Multiple entries sharing the same title are shown as variants (different slicing profiles) of the same model. This is intentional — one physical model can have several `.3mf` files for different printers.

## 3MF Parser Notes (`src/lib/3mf-parser.ts`)

- Uses **streaming ZIP** via `node-stream-zip` — does not decompress entire files
- Has a **fingerprint cache**: files with unchanged `mtime + size` are skipped
- Enforces **memory limits**: 20 KB for metadata XML, 256 KB per file
- Forces GC (`global.gc()`) every 30 files — run extract with `--expose-gc` (already in the npm script)
- Thumbnail candidates are tried in priority order; first found wins
- Preview images are filtered to exclude texture maps (`.png` files in known texture paths)
- Filament data (type, color HEX, weight, print time) is parsed from GCode comments and `project_settings.config`
- The extractor version constant `EXTRACTOR_VERSION` triggers a full re-parse of all files when bumped

## Build Output

```
out/
├── index.html              # Landing page
├── library/
│   └── index.html          # Gallery/search page
├── _next/static/           # Hashed JS/CSS bundles (cache forever)
├── assets/
│   ├── thumbs/             # Thumbnails
│   └── previews/           # Preview images
└── manifest.json           # Model data (embedded in static JS too)
```

## Deployment Architecture

```
nginx root (e.g. /volume1/web/)
├── index.html                  ← copied from out/index.html
└── website-dist/               ← rest of out/ contents
    ├── library/index.html
    ├── _next/
    ├── assets/
    └── manifest.json
```

`NEXT_PUBLIC_BASE_PATH=/website-dist` ensures all asset URLs are prefixed correctly so the app works when served from a sub-path.

## What Does NOT Exist Here

- No API routes
- No database or ORM
- No authentication
- No server-side rendering at runtime
- No tests (no Jest, Vitest, or any test runner)
- No Docker configuration (though a one-liner Docker usage is in the README)
- No incremental static regeneration (ISR)
- No `.env` files committed to the repo

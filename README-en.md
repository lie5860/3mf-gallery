# 3MF Gallery

[中文](./README.md) | [English](./README-en.md)

---

## 📸 Screenshots

| Home | Search / List | Detail |
| :---: | :---: | :---: |
| ![Home](./images/index.png) | ![Search](./images/search.png) | ![Detail](./images/detail.png) |

## 📦 About

**3MF Gallery** is a fully local, offline-first `.3mf` 3D print file browser. It automatically scans local directories for `.3mf` files, extracts thumbnails and metadata (title, description, designer, slice profiles, filament info, etc.), and generates a static gallery site for browsing, searching, and downloading.

Perfect for hosting and managing your 3D printing model library on Synology NAS, home servers, or any environment capable of running Nginx.

### ✨ Key Features

- 🔍 **Smart Metadata Extraction** — Stream-parses XML metadata inside `.3mf` (ZIP format) archives to extract titles, descriptions, designers, licenses, slice profiles, and more
- 🖼️ **Automatic Thumbnail Extraction** — Automatically extracts embedded thumbnails, plate render images, and model photos
- ⚡ **Blazing Fast SSG** — Built on Next.js static export; thousands of models load instantly
- 🔎 **Real-time Fuzzy Search** — Instantly filter by name or file path with debounced input
- 📁 **Auto-grouping** — Multiple `.3mf` files sharing the same title are merged into a single entry, displaying different slice configuration variants
- 🧩 **Filament & Print Info** — Automatically extracts filament types, color HEX values, usage weight, and estimated print time
- 🏠 **Fully Offline** — Zero cloud dependencies; all data stays local
- 🚀 **Fast Caching** — Fingerprint-based cache using file mtime + size for instant incremental scans

## 📂 Project Structure

```
nginx-root/                  # Nginx root directory
├── index.html               # Entry page (copied from build output)
├── website-dist/            # Static build artifacts
│   ├── library/
│   │   └── index.html       # Gallery page
│   ├── _next/               # Next.js static assets
│   ├── assets/
│   │   ├── thumbs/          # Extracted thumbnails
│   │   └── previews/        # Extracted preview images
│   └── manifest.json        # Model metadata manifest
├── website/                 # ← This project's source code
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   ├── components/      # React UI components
│   │   └── lib/             # 3MF parser & utilities
│   ├── scripts/
│   │   ├── extract.ts       # Metadata extraction script
│   │   └── deploy.sh        # One-click deployment script
│   └── nginx.conf.example   # Nginx configuration reference
└── your-models-folder/      # Directory containing .3mf files
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- One or more directories containing `.3mf` files

### 1. Clone the Repository

```bash
# Clone this project into your model root directory
cd /your-model-root
git clone https://github.com/lie5860/3mf-gallery.git website
cd website
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Extract Model Data

```bash
npm run extract
```

This recursively scans the parent directory (i.e., the Nginx root) for all `.3mf` files and extracts thumbnails and metadata into the `public/` directory.

**Custom scan directories** (optional):

```bash
# Single directory
MODELS_DIR=/path/to/models npm run extract

# Multiple directories (colon-separated)
MODELS_DIRS=/path/to/dir1:/path/to/dir2 npm run extract
```

### 4. Local Development Preview

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to preview.

### 5. Build Static Site

```bash
npm run build
```

Build output goes to the `out/` directory and can be served by any static file server.

## 🌐 Deployment

### Option 1: One-Click Deploy Script (Recommended)

```bash
npm run deploy
```

This script sequentially:
1. Extracts 3MF metadata
2. Builds the Next.js static site
3. Deploys static assets to `../website-dist/` and copies `index.html` to the parent directory (which is recommended to be served as the root directory for Nginx or other HTTP services)

> **💡 Tip: For Synology NAS or other systems without a complete Node.js environment, you can deploy directly using Docker:**
> 
> ```bash
> docker run --rm -v /your-model-root:/app node:20 /bin/sh -c "cd /app/website && npm install && npm run deploy"
> ```
> *(Note: replace `/your-model-root` with the actual absolute path where your models and code are stored, e.g., `/volume1/docker/3mf-models`)*

### Option 2: Manual Nginx Deployment

1. Build the static site:

```bash
NEXT_PUBLIC_BASE_PATH=/website-dist npm run build
```

2. Copy the contents of `out/` to your Nginx-accessible location

3. Configure Nginx (refer to `nginx.conf.example`):

```nginx
server {
    listen 80;
    server_name _;

    root /path/to/your/nginx-root;
    index index.html;

    location / {
        try_files $uri $uri.html $uri/ =404;
    }

    # Force download for .3mf files
    location ~* \.3mf$ {
        add_header Content-Disposition "attachment";
        types { application/octet-stream 3mf; }
    }

    # Static asset caching
    location /website-dist/_next/static/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### Option 3: Quick Preview (No Nginx Required)

```bash
npm run build
npm run serve
```

This uses `serve` to host the `out/` directory locally.

## ⚙️ Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MODELS_DIR` | Single model scan directory | Parent directory `../` |
| `MODELS_DIRS` | Multiple scan directories (colon-separated) | — |
| `NEXT_PUBLIC_BASE_PATH` | Site sub-path prefix | `""` |

## 🛠️ Tech Stack

- [Next.js](https://nextjs.org/) 16 — React full-stack framework (SSG static export mode)
- [React](https://react.dev/) 19 — UI framework
- [Tailwind CSS](https://tailwindcss.com/) 4 — Utility-first CSS
- [Framer Motion](https://www.framer.com/motion/) — Animation library
- [Lucide Icons](https://lucide.dev/) — Icon library
- [node-stream-zip](https://github.com/nickreese/node-stream-zip) — Stream-based ZIP parsing
- TypeScript — Full type safety

## 📄 License

MIT

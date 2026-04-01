#!/bin/sh
# deploy.sh — 将 Next.js 构建产物部署到 nginx root
# 兼容 macOS 和 Linux (Synology DSM)
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NGINX_ROOT="$(dirname "$PROJECT_DIR")"
OUT_DIR="$PROJECT_DIR/out"
DIST_DIR="$NGINX_ROOT/website-dist"

echo ""
echo "📦 Phase 1: Extracting 3MF metadata..."
cd "$PROJECT_DIR"
npm run extract

echo ""
echo "🔨 Phase 2: Building Next.js static site..."
npm run build

echo ""
echo "🚀 Phase 3: Deploying..."
echo "  nginx root: $NGINX_ROOT"
echo "  dist dir:   $DIST_DIR"

# 清理旧的 dist 目录（保留 assets 缓存可选，这里全量覆盖保证干净）
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

# 复制 index.html 到 nginx root（根级入口页面）
cp "$OUT_DIR/index.html" "$NGINX_ROOT/index.html"
echo "  ✓ index.html → $NGINX_ROOT/"

# 复制其余所有构建产物到 website-dist/
# 使用 POSIX 兼容命令，不依赖 rsync
cd "$OUT_DIR"
for item in *; do
    [ "$item" = "index.html" ] && continue
    cp -r "$item" "$DIST_DIR/"
done
echo "  ✓ Static assets → $DIST_DIR/"

echo ""
echo "✅ Deploy complete!"
echo ""
echo "  $NGINX_ROOT/"
echo "  ├── index.html              (入口页)"
echo "  ├── website-dist/           (静态资源)"
echo "  │   ├── library/"
echo "  │   │   └── index.html"
echo "  │   ├── _next/"
echo "  │   ├── assets/"
echo "  │   └── manifest.json"
echo "  ├── website/                (项目源码)"
echo "  └── 拓竹下架合集/           (模型文件)"

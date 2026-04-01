#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_gallery.py

生成一个可离线打开的静态网页，用于浏览 root 下所有 .3mf 文件。

设计目标：
- 稳定：不依赖第三方库；用 zipfile 解析 3mf。
- 可复跑：每次全量重建输出目录（除非未来加增量模式）。
- 可扩展：后续可增强 metadata/description 提取。

用法：
python3 build_gallery.py --root "/path/to/3mf-root" --out "/path/to/out" --extract-previews 0

"""

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import sys
import time
import zipfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional, Tuple


IMG_EXTS = (".png", ".jpg", ".jpeg", ".webp")
THUMB_CANDIDATES = [
    "Auxiliaries/.thumbnails/thumbnail_3mf.png",
    "Auxiliaries/.thumbnails/thumbnail_middle.png",
    "Auxiliaries/.thumbnails/thumbnail_small.png",
]


@dataclass
class Entry:
    id: str
    rel_path: str
    abs_path: str
    file_name: str
    title: str
    description: str
    designer: str
    creation_date: str
    profile_title: str
    profile_description: str
    license: str
    thumb: Optional[str]
    pictures: List[str]
    meta: dict


def sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


def safe_rel(p: Path, root: Path) -> str:
    return str(p.relative_to(root)).replace(os.sep, "/")


def mkdir_clean(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def write_file(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def extract_first_existing(z: zipfile.ZipFile, names: List[str]) -> Optional[Tuple[str, bytes]]:
    lower_map = {n.lower(): n for n in z.namelist()}
    for cand in names:
        real = lower_map.get(cand.lower())
        if real is None:
            continue
        try:
            return real, z.read(real)
        except KeyError:
            continue
    return None


def list_pictures(z: zipfile.ZipFile) -> List[str]:
    pics = []
    for n in z.namelist():
        nl = n.lower()
        if nl.endswith(IMG_EXTS):
            # 优先一些更“像展示图”的路径
            if nl.startswith("auxiliaries/model pictures/") or nl.startswith("metadata/pick_"):
                pics.append(n)
    # 兜底：如果一个都没有，就把所有图片都列上（但可能很多）
    if not pics:
        pics = [n for n in z.namelist() if n.lower().endswith(IMG_EXTS)]
    # 排序：让 thumbnail 不要混进来（一般不在 pics 里，但兜底处理）
    def score(n: str) -> Tuple[int, int, str]:
        nl = n.lower()
        is_thumb = 1 if "/.thumbnails/" in nl else 0
        # Model Pictures 更靠前
        is_model_pic = 0 if nl.startswith("auxiliaries/model pictures/") else 1
        return (is_thumb, is_model_pic, nl)

    return sorted(pics, key=score)


def try_extract_text_metadata(z: zipfile.ZipFile) -> Tuple[str, str, dict]:
    """从 3mf 内提取 title/description + 结构化 metadata。

    已针对 Bambu Studio 导出的 3D/3dmodel.model 做了专门提取：
    - 该文件包含大量 <metadata name="...">...</metadata>

    返回：(title, description, meta_dict)
    """

    def decode_best(b: bytes) -> Optional[str]:
        for enc in ("utf-8", "utf-16", "utf-16le", "utf-16be", "latin1"):
            try:
                return b.decode(enc)
            except Exception:
                pass
        return None

    def clean_text(s: str) -> str:
        s = s.replace("<![CDATA[", "").replace("]]>", "")
        # Do not strip all whitespace to single spaces, just strip lead/trail
        s = s.strip()
        return s

    def html_unescape(s: str) -> str:
        # Bambu 的 Description/ProfileDescription 里经常是多重 HTML 转义
        import html
        prev = s
        for _ in range(4):
            cur = html.unescape(prev)
            if cur == prev:
                break
            prev = cur
        return prev

    title = ""
    desc = ""
    meta: dict = {}

    # 1) 优先走 Bambu: 3D/3dmodel.model
    try:
        b = z.read("3D/3dmodel.model")
        text = decode_best(b)
        if text:
            metas = re.findall(r"<metadata\s+name=\"([^\"]+)\"[^>]*>(.*?)</metadata>", text, flags=re.I | re.S)
            for k, v in metas:
                meta[k] = clean_text(html_unescape(v))
            # Title/Description
            title = meta.get("Title", "") or meta.get("title", "")
            desc = meta.get("Description", "") or meta.get("description", "")
    except Exception:
        pass

    # 2) 兜底启发式（旧逻辑）：扫少量 xml/model
    if not title or not desc:
        candidates = []
        for n in z.namelist():
            nl = n.lower()
            if nl.endswith((".xml", ".rels", ".model")) and ("metadata" in nl or nl.startswith("3d/")):
                candidates.append(n)
        candidates = candidates[:20]

        title_patterns = [
            re.compile(r"<title>(.*?)</title>", re.I | re.S),
            re.compile(r"<dc:title[^>]*>(.*?)</dc:title>", re.I | re.S),
            re.compile(r"<name>(.*?)</name>", re.I | re.S),
        ]
        desc_patterns = [
            re.compile(r"<description>(.*?)</description>", re.I | re.S),
            re.compile(r"<dc:description[^>]*>(.*?)</dc:description>", re.I | re.S),
            re.compile(r"<summary>(.*?)</summary>", re.I | re.S),
        ]

        for n in candidates:
            try:
                bb = z.read(n)
            except Exception:
                continue
            if len(bb) > 256 * 1024:
                continue
            text = decode_best(bb)
            if not text:
                continue
            if not title:
                for pat in title_patterns:
                    m = pat.search(text)
                    if m:
                        title = clean_text(m.group(1))
                        break
            if not desc:
                for pat in desc_patterns:
                    m = pat.search(text)
                    if m:
                        desc = clean_text(m.group(1))
                        break
            if title and desc:
                break

    return title, desc, meta


def build(root: Path, out: Path, extract_previews: bool):
    t0 = time.time()
    files = sorted(root.rglob("*.3mf"))

    # 准备输出目录
    if out.exists():
        # 只清理我们生成的子目录，避免误删用户放的其他文件
        for sub in ["assets", "data"]:
            p = out / sub
            if p.exists():
                shutil.rmtree(p)
    mkdir_clean(out / "assets" / "thumbs")
    mkdir_clean(out / "assets" / "previews")
    mkdir_clean(out / "data")

    entries: List[Entry] = []
    errors = 0

    for idx, f in enumerate(files, 1):
        rel = safe_rel(f, root)
        eid = sha1(rel)
        file_name = f.name
        title_default = f.stem

        thumb_path = None
        pictures_out: List[str] = []
        description = ""
        title = ""
        meta = {}
        designer = ""
        creation_date = ""
        profile_title = ""
        profile_description = ""
        license_ = ""

        try:
            with zipfile.ZipFile(f, "r") as z:
                # thumb
                got = extract_first_existing(z, THUMB_CANDIDATES)
                if got:
                    _, data = got
                    thumb_file = f"assets/thumbs/{eid}.png"
                    write_file(out / thumb_file, data)
                    thumb_path = thumb_file

                # metadata text
                t2, d2, meta = try_extract_text_metadata(z)
                title = t2 or title_default
                description = d2 or ""
                designer = meta.get('Designer','')
                creation_date = meta.get('CreationDate','')
                profile_title = meta.get('ProfileTitle','')
                profile_description = meta.get('ProfileDescription','')
                license_ = meta.get('License','')

                # pictures (optional extract)
                pics = list_pictures(z)
                if extract_previews:
                    for j, n in enumerate(pics[:999]):  # 全抽（上限 999）
                        try:
                            data = z.read(n)
                        except Exception:
                            continue
                        ext = Path(n).suffix.lower()
                        out_file = f"assets/previews/{eid}_{j:02d}{ext}"
                        write_file(out / out_file, data)
                        pictures_out.append(out_file)
                else:
                    # 不抽取时只记录内部路径，前端不直接展示
                    pictures_out = []

        except zipfile.BadZipFile:
            errors += 1
            title = title_default
            description = "(BadZipFile)"
        except Exception as e:
            errors += 1
            title = title_default
            description = f"(error: {type(e).__name__})"

        entries.append(
            Entry(
                id=eid,
                rel_path=rel,
                abs_path=str(f),
                file_name=file_name,
                title=title,
                description=description,
                designer=designer,
                creation_date=creation_date,
                profile_title=profile_title,
                profile_description=profile_description,
                license=license_,
                thumb=thumb_path,
                pictures=pictures_out,
                meta=meta,
            )
        )

        if idx % 200 == 0:
            print(f"[{idx}/{len(files)}] processed... errors={errors}")

    manifest = {
        "generated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "root": str(root),
        "count": len(entries),
        "extract_previews": bool(extract_previews),
        "errors": errors,
        "entries": [asdict(e) for e in entries],
    }
    (out / "data" / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    # 写 index.html（为避免 file:// 下的 fetch CORS 限制，直接把 manifest 内联进页面）
    (out / "index.html").write_text(render_index_html(manifest), encoding="utf-8")
    # 写 detail.html（同样内联 manifest）
    (out / "detail.html").write_text(render_detail_html(manifest), encoding="utf-8")

    dt = time.time() - t0
    print(f"DONE count={len(entries)} errors={errors} seconds={dt:.1f}")


def _inline_manifest_script(manifest: dict) -> str:
    """内联 manifest 到页面。

    之前用 template literal 直接塞 JSON，在某些数据/浏览器组合下会触发 JS 解析错误。
    这里改成 base64，保证脚本只包含安全字符集。
    """
    import base64

    manifest_json = json.dumps(manifest, ensure_ascii=False)
    b64 = base64.b64encode(manifest_json.encode('utf-8')).decode('ascii')

    # 使用 TextDecoder 可靠解码 UTF-8
    return (
        "window.__MANIFEST__ = (function(){"
        "  const b64='" + b64 + "';"
        "  const bin=atob(b64);"
        "  const bytes=new Uint8Array(bin.length);"
        "  for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);"
        "  const json=new TextDecoder('utf-8').decode(bytes);"
        "  return JSON.parse(json);"
        "})();"
    )


def render_index_html(manifest: dict) -> str:
    # 纯静态（file:// 直接打开）：把 manifest 内联进页面，避免 fetch 被浏览器 CORS 拦截。
    inline = _inline_manifest_script(manifest)
    html = """<!doctype html>
<html lang=\"zh\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>3MF Gallery</title>
  <style>
    :root {
      --bg: #0b0f14; --card: #121826; --text: #e6edf3; --muted: #9aa4b2; --border: #263041; --accent: #6aa6ff;
    }
    [data-theme="light"] {
      --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --muted: #64748b; --border: #e2e8f0; --accent: #3b82f6;
    }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:var(--bg); color:var(--text); transition: background 0.2s, color 0.2s; }
    header { position: sticky; top:0; background: rgba(11,15,20,.9); backdrop-filter: blur(10px); border-bottom:1px solid var(--border); padding:12px 16px; z-index:10; transition: background 0.2s, border-color 0.2s; }
    [data-theme="light"] header { background: rgba(248, 250, 252, .9); }
    .row { display:flex; gap:12px; align-items:center; flex-wrap: wrap; }
    input { background:var(--card); color:var(--text); border:1px solid var(--border); padding:10px 12px; border-radius:10px; min-width: 280px; }
    .meta { color: var(--muted); font-size: 12px; }
    main { padding: 16px; }
    .grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; overflow:hidden; cursor:pointer; display:flex; flex-direction:column; }
    .thumb { height: 160px; background:#0f1522; display:flex; align-items:center; justify-content:center; }
    .thumb img { width:100%; height:100%; object-fit: cover; }
    .content { padding: 10px 10px 12px; }
    .title { font-size: 14px; font-weight: 650; line-height:1.2; margin:0 0 6px; }
    .path { font-size: 12px; color: var(--muted); word-break: break-all; }
    .pill { display:inline-block; font-size:12px; border:1px solid var(--border); padding:2px 8px; border-radius:999px; color:var(--muted); }
    .btn { background: transparent; color: var(--text); border: 1px solid var(--border); padding: 8px 10px; border-radius: 10px; cursor:pointer; }
    .btn:hover { border-color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <div class=\"row\">
      <div style=\"font-weight:700\">3MF Gallery</div>
      <input id=\"q\" placeholder=\"搜索：文件名 / 路径 / 标题\" />
      <span class=\"pill\" id=\"count\">loading...</span>
      <span class=\"meta\" id=\"meta\"></span>
      <div style="flex:1"></div>
      <button class="btn" id="themeToggle">🌓</button>
    </div>
  </header>
  <main>
    <div class=\"grid\" id=\"grid\"></div>
  </main>


<script>
__INLINE__
let MANIFEST = null;
let FILTERED = [];

function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
  localStorage.setItem('theme', isLight ? 'dark' : 'light');
}

// Restore saved theme early
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
  document.documentElement.setAttribute('data-theme', 'light');
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

function el(tag, attrs={}, ...children) {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

function render(items) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (const it of items) {
    const img = it.thumb ? it.thumb : '';
    const card = el('div', {class:'card', onclick: ()=>openDlg(it)},
      el('div', {class:'thumb'}, img ? el('img', {src: img, loading:'lazy'}) : el('div', {class:'meta'}, 'no thumbnail')),
      el('div', {class:'content'},
        el('div', {class:'title'}, it.title || it.file_name),
        el('div', {class:'path'}, it.rel_path)
      )
    );
    grid.appendChild(card);
  }
  document.getElementById('count').textContent = `${items.length} / ${MANIFEST.count}`;
}

function openDlg(it) {
  // 列表页点击 → 新开详情页
  const url = `detail.html?id=${encodeURIComponent(it.id)}`;
  window.open(url, '_blank');
}

function norm(s){ return (s||'').toLowerCase(); }

function applyFilter() {
  const q = norm(document.getElementById('q').value);
  if (!q) {
    FILTERED = MANIFEST.entries;
  } else {
    FILTERED = MANIFEST.entries.filter(it => {
      const hay = norm(it.rel_path) + ' ' + norm(it.file_name) + ' ' + norm(it.title) + ' ' + norm(it.description);
      return hay.includes(q);
    });
  }
  render(FILTERED);
}

(function init(){
  MANIFEST = window.__MANIFEST__;
  document.getElementById('meta').textContent = `generated_at: ${MANIFEST.generated_at} | extract_previews: ${MANIFEST.extract_previews}`;
  FILTERED = MANIFEST.entries;
  render(FILTERED);
  document.getElementById('q').addEventListener('input', applyFilter);
})();
</script>
</body>
</html>
"""
    return html.replace("__INLINE__", inline)



def render_detail_html(manifest: dict) -> str:
    # HTTP 环境下用 fetch 读取 manifest，避免把超大 JSON/字符串内联导致语法问题
    html = """<!doctype html>
<html lang=\"zh\">
<head>
  <meta charset=\"utf-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />
  <title>3MF Detail</title>
  <style>
    :root {
      --bg: #0b0f14; --card: #121826; --text: #e6edf3; --muted: #9aa4b2; --border: #263041; --accent: #6aa6ff;
    }
    [data-theme="light"] {
      --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --muted: #64748b; --border: #e2e8f0; --accent: #3b82f6;
    }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background:var(--bg); color:var(--text); transition: background 0.2s, color 0.2s; }
    header { position: sticky; top:0; background: rgba(11,15,20,.9); backdrop-filter: blur(10px); border-bottom:1px solid var(--border); padding:12px 16px; z-index:10; transition: background 0.2s, border-color 0.2s; }
    [data-theme="light"] header { background: rgba(248, 250, 252, .9); }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .row { display:flex; gap:12px; align-items:center; flex-wrap: wrap; }
    .btn { background: transparent; color: var(--text); border: 1px solid var(--border); padding: 8px 10px; border-radius: 10px; cursor:pointer; }
    .btn:hover { border-color: var(--accent); }
    main { padding: 16px; max-width: 1200px; margin: 0 auto; }
    .hero-gallery { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
    .main-view { width: 100%; height: 400px; background: var(--card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
    .main-view img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .thumbs-strip { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px; }
    @media (min-width: 800px) {
       .hero-gallery { flex-direction: row; height: 400px; align-items: stretch; }
       .main-view { flex: 1; height: 100%; }
       .thumbs-strip { width: 120px; flex-direction: column; overflow-y: auto; overflow-x: hidden; height: 100%; padding-bottom: 0; }
       .t-item { width: 100%; height: 80px; }
    }
    .t-item { width: 100px; height: 100px; flex-shrink: 0; border-radius: 8px; border: 2px solid transparent; overflow: hidden; cursor: pointer; background: var(--card); opacity: 0.7; transition: 0.2s; }
    .t-item:hover { opacity: 1; }
    .t-item.active { border-color: var(--accent); opacity: 1; }
    .t-item img { width: 100%; height: 100%; object-fit: cover; }
    .wrap { display:grid; grid-template-columns: 1fr; gap: 16px; align-items:start; }
    @media (min-width: 900px) {
       .wrap { grid-template-columns: 1fr 350px; }
    }
    .panel { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px; }
    .title { font-size: 24px; font-weight: 800; margin: 0 0 16px; }
    .kv { display:grid; grid-template-columns: 140px 1fr; gap: 6px 10px; font-size: 13px; }
    .k { color: var(--muted); }
    pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; }
    .desc-content { line-height: 1.5; }
    .desc-content img, .desc-content video { max-width: 100%; height: auto; border-radius: 8px; }
    .gallery { display:grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
    .gimg { border-radius: 12px; overflow:hidden; border: 1px solid var(--border); background:#0f1522; }
    .gimg img { width:100%; height:160px; object-fit: cover; display:block; }
  </style>
</head>
<body>
  <header>
    <div class=\"row\">
      <div style=\"font-weight:700\">3MF Detail</div>
      <a class=\"btn\" id=\"openBtn\" href=\"#\" style=\"display:none\" title=\"下载该 3MF 文件\">下载 3MF 文件</a>
      <span class=\"k\" id=\"hint\"></span>
      <div style="flex:1"></div>
      <button class="btn" id="themeToggle">🌓</button>
    </div>
  </header>
  <main>
    <div class=\"hero-gallery\" id=\"hero\">
      <div class=\"main-view\"><img id=\"mainImg\" src=\"\" alt=\"preview\" /></div>
      <div class=\"thumbs-strip\" id=\"thumbs\"></div>
    </div>

    <div class=\"wrap\">
      <div class=\"panel\">
        <h1 class=\"title\" id=\"title\">...</h1>
        <div style=\"margin-top:12px\">
          <div class=\"k\" style=\"margin-bottom:6px\">描述</div>
          <div class=\"desc-content\" id=\"desc\"></div>
        </div>
      </div>

      <div class=\"panel\">
        <div class=\"kv\" id=\"kv\"></div>
        <div style=\"margin-top:20px\">
          <div class=\"k\" style=\"margin-bottom:6px\">Profile</div>
          <div class=\"desc-content\" id=\"profile\"></div>
        </div>
      </div>
    </div>



    <div class=\"panel\" style=\"margin-top:16px\">
      <div class=\"row\" style=\"justify-content:space-between\">
        <div style=\"font-weight:700\">元数据 (Metadata)</div>
        <button class=\"btn\" id=\"toggleMeta\">展开/收起</button>
      </div>
      <pre id=\"meta\" style=\"font-size:12px; max-height:400px; overflow:auto; display:none; margin-top:12px\"></pre>
    </div>
  </main>

<script>
function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
  localStorage.setItem('theme', isLight ? 'dark' : 'light');
}

// Restore saved theme early
const savedTheme = localStorage.getItem('theme');
if (savedTheme) {
  document.documentElement.setAttribute('data-theme', savedTheme);
} else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
  document.documentElement.setAttribute('data-theme', 'light');
}

document.getElementById('themeToggle').addEventListener('click', toggleTheme);

function qs(k){ return new URLSearchParams(location.search).get(k); }
function el(tag, attrs={}, ...children) {
  const e = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
}

function downloadUrlFromRelPath(rel){
  // 在 http 静态站点下，直接下载原始 3mf 文件（相对路径）
  return '../' + encodeURI(rel);
}

async function init(){
  const id = qs('id');
  if (!id) {
    document.getElementById('title').textContent = 'Missing id';
    document.getElementById('hint').textContent = '请从 index.html 点击进入详情页';
    return;
  }

  let MANIFEST;
  try {
    const res = await fetch('./data/manifest.json', { cache: 'no-cache' });
    MANIFEST = await res.json();
  } catch (e) {
    document.getElementById('title').textContent = 'Failed to load manifest';
    document.getElementById('hint').textContent = '请通过 http(s) 打开本站点（例如 http://127.0.0.1:38080/），不要用 file:// 直接打开。';
    return;
  }

  const it = (MANIFEST.entries || []).find(e => e.id === id);
  if (!it) {
    document.getElementById('title').textContent = 'Not found';
    document.getElementById('hint').textContent = '无此条目';
    return;
  }

  document.title = it.title || it.file_name;
  document.getElementById('title').textContent = it.title || it.file_name;

  const mainImg = document.getElementById('mainImg');
  const thumbs = document.getElementById('thumbs');
  const allPics = [];
  if (it.thumb) allPics.push(it.thumb);
  if (it.pictures) allPics.push(...it.pictures);

  function setMain(url, el) {
    mainImg.src = url;
    document.querySelectorAll('.t-item').forEach(t => t.classList.remove('active'));
    if (el) el.classList.add('active');
  }

  if (allPics.length > 1) {
    allPics.forEach((url, idx) => {
      const t = el('div', { class:'t-item', onclick: () => setMain(url, t) }, el('img', { src: url }));
      thumbs.appendChild(t);
      if (idx === 0) setMain(url, t);
    });
  } else if (allPics.length === 1) {
    setMain(allPics[0]);
    thumbs.style.display = 'none';
  } else {
    document.getElementById('hero').style.display = 'none';
  }

  // 直接将保存的 HTML 注入（因为内容由 3mf 提供且在静态生成时获取，可视为安全展示内容，
  // 或可通过 DOMPurify 净化，但这里作为离线客户端直接展示）
  document.getElementById('desc').innerHTML = it.description || '';
  document.getElementById('profile').innerHTML = [it.profile_title, it.profile_description].filter(Boolean).join('<br><br>');

  const kv = document.getElementById('kv');
  const rows = [
    ['相对路径', it.rel_path],
    ['文件名', it.file_name],
    ['Designer', it.designer],
    ['CreationDate', it.creation_date],
    ['License', it.license],
  ].filter(x => x[1]);
  for (const [k,v] of rows) {
    kv.appendChild(el('div',{class:'k'},k));
    kv.appendChild(el('div',{}, String(v)));
  }

  // open 3mf
  const openBtn = document.getElementById('openBtn');
  openBtn.href = downloadUrlFromRelPath(it.rel_path);
  openBtn.setAttribute('download', it.file_name || 'model.3mf');
  openBtn.target = '_self';
  openBtn.rel = 'noreferrer';
  openBtn.style.display = 'inline-block';
  document.getElementById('hint').textContent = '提示：将通过 HTTP 下载该 .3mf 文件（下载后可用 Bambu Studio/OrcaSlicer 打开）。';

  // meta
  const metaPre = document.getElementById('meta');
  metaPre.textContent = JSON.stringify(it.meta || {}, null, 2);
  document.getElementById('toggleMeta').addEventListener('click', () => {
    metaPre.style.display = (metaPre.style.display === 'none') ? 'block' : 'none';
  });
}

init();
</script>
</body>
</html>
"""
    return html


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--extract-previews", type=int, default=0)
    args = ap.parse_args()

    root = Path(args.root).expanduser().resolve()
    out = Path(args.out).expanduser().resolve()
    out.mkdir(parents=True, exist_ok=True)

    build(root, out, bool(args.extract_previews))


if __name__ == "__main__":
    main()

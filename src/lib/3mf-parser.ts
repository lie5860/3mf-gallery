import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import StreamZip from 'node-stream-zip';

const EXTRACTOR_VERSION = "v6"; // 提取更精确的耗材加颜色 HEX 组合配置

const THUMB_CANDIDATES = [
  "Metadata/thumbnail.png", // fallback standard 3mf
  "Auxiliaries/.thumbnails/thumbnail_3mf.png",
  "Auxiliaries/.thumbnails/thumbnail_middle.png",
  "Auxiliaries/.thumbnails/thumbnail_small.png",
];

const IMG_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

export interface Entry {
  id: string;
  rel_path: string;
  abs_path: string;
  file_name: string;
  title: string;
  description: string;
  designer: string;
  creation_date: string;
  profile_title: string;
  profile_description: string;
  license: string;
  thumb: string | null;
  pictures: string[];
  meta: Record<string, string>;
}

function decodeBest(buffer: Buffer): string | null {
  const encodings: BufferEncoding[] = ['utf8', 'utf16le', 'latin1'];
  for (const enc of encodings) {
      try {
          return buffer.toString(enc);
      } catch (e) { }
  }
  return null;
}

function cleanText(s: string): string {
    return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "").trim();
}

function htmlUnescape(s: string): string {
    let res = s;
    for (let i = 0; i < 4; i++) {
        res = res.replace(/&amp;/g, '&')
                 .replace(/&quot;/gi, '"')
                 .replace(/&#34;/g, '"')
                 .replace(/&#39;/g, "'")
                 .replace(/&lt;/gi, '<')
                 .replace(/&gt;/gi, '>');
    }
    return res;
}

export async function tryExtractTextMetadata(zip: any): Promise<{ title: string, desc: string, meta: Record<string, string> }> {
  let title = "";
  let desc = "";
  const meta: Record<string, string> = {};

  // V8 内存保护：解除大字符串的底层切片引用绑定
  function detachString(str: string): string {
      return Buffer.from(str).toString(); 
  }

  const entriesMap = await zip.entries();
  const entries = Object.values(entriesMap) as any[];

  let modelEntry = entries.find(e => e.name.toLowerCase() === "3d/3dmodel.model");
  if (modelEntry) {
      try {
          const data = await zip.entryData(modelEntry.name);
          const text = decodeBest(data);
          if (text) {
              const regex = /<metadata\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/metadata>/gi;
              let match;
              while ((match = regex.exec(text)) !== null) {
                  const rawKey = match[1];
                  let val = htmlUnescape(match[2]);
                  for(let i=0; i<3; i++) val = htmlUnescape(val);
                  const cleanVal = cleanText(val);
                  
                  // 防御性拦截：丢弃任何超过 20KB 的超大属性（例如内联 base64 等），防止内存撑爆和 JSON OOM
                  if (cleanVal.length > 20000) continue; 
                  
                  // 强制使用 detachString 隔离字符串，防止 V8 底层持有一个 50MB 的 XML Buffer 永不释放！
                  meta[detachString(rawKey)] = detachString(cleanVal);
              }
              title = meta["Title"] || meta["title"] || "";
              desc = meta["Description"] || meta["description"] || "";
          }
      } catch (e) {
          console.warn("Failed to extract model text", e);
      }
  }

  // Fallback heuristic if not Bambu metadata
  if (!title || !desc) {
      const candidates = entries
          .filter(e => {
              const nl = e.name.toLowerCase();
              return (nl.endsWith('.xml') || nl.endsWith('.rels') || nl.endsWith('.model')) && (nl.includes('metadata') || nl.startsWith('3d/'));
          })
          .slice(0, 20);

      const titlePatterns = [
          /<title>([\s\S]*?)<\/title>/i,
          /<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i,
          /<name>([\s\S]*?)<\/name>/i,
      ];
      const descPatterns = [
          /<description>([\s\S]*?)<\/description>/i,
          /<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i,
          /<summary>([\s\S]*?)<\/summary>/i,
      ];

      for (const entry of candidates) {
          if (entry.size > 256 * 1024) continue;
          
          try {
              const data = await zip.entryData(entry.name);
              const text = decodeBest(data);
              if (!text) continue;

              if (!title) {
                  for (const pat of titlePatterns) {
                      const m = pat.exec(text);
                      if (m) { 
                          const val = cleanText(m[1]);
                          if (val.length < 20000) title = detachString(val); 
                          break; 
                      }
                  }
              }
              if (!desc) {
                  for (const pat of descPatterns) {
                      const m = pat.exec(text);
                      if (m) { 
                          const val = cleanText(m[1]);
                          if (val.length < 20000) desc = detachString(val); 
                          break; 
                      }
                  }
              }
          } catch (e) {}
          if (title && desc) break;
      }
  }

  return { title, desc, meta };
}

function mkdirClean(dir: string, clean: boolean = false) {
    if (clean && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
}

export async function parseAll3MFs(rootDirs: string | string[], outputDir: string, relBase?: string): Promise<Entry[]> {
    const dirs = Array.isArray(rootDirs) ? rootDirs : [rootDirs];
    const files: string[] = [];

    const SKIP_DIRS = new Set(['website', '_gallery_site', 'node_modules', '.git', '.agents', '.next', 'out', '.DS_Store']);

    // recursively find .3mf files
    function walk(dir: string) {
        if (!fs.existsSync(dir)) return;
        const list = fs.readdirSync(dir);
        for (const f of list) {
            if (SKIP_DIRS.has(f)) continue;
            const full = path.join(dir, f);
            const stat = fs.statSync(full);
            if (stat.isDirectory()) walk(full);
            else if (f.toLowerCase().endsWith('.3mf')) files.push(full);
        }
    }

    for (const rootDir of dirs) {
        if (fs.existsSync(rootDir)) {
            walk(rootDir);
        }
    }

    // rel_path 基准：优先使用 relBase，否则使用第一个 rootDir
    const baseForRel = relBase || dirs[0];

    const thumbsDir = path.join(outputDir, "assets", "thumbs");
    const previewsDir = path.join(outputDir, "assets", "previews");
    mkdirClean(thumbsDir, false); // 不清除以复用缓存
    mkdirClean(previewsDir, false);

    // --- 高速指纹缓存表 ---
    const manifestPath = path.join(outputDir, "manifest.json");
    const cacheMap = new Map<string, Entry>();
    
    if (fs.existsSync(manifestPath)) {
        try {
            const oldEntries: Entry[] = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            for (const e of oldEntries) {
                if (e.meta && e.meta._v === EXTRACTOR_VERSION && e.meta._mtime) {
                    cacheMap.set(e.abs_path, e);
                }
            }
            console.log(`[3MF Parser] Loaded ${cacheMap.size} cached entries.`);
        } catch(e) {}
    }

    const entriesRet: Entry[] = [];
    let skippedCount = 0;
    
    for (let currentIdx = 0; currentIdx < files.length; currentIdx++) {
        const f = files[currentIdx];
        
        // 生成极速指纹: ModifyTime + FileSize
        const stat = fs.statSync(f);
        const mtimeFingerprint = `${stat.mtimeMs}_${stat.size}`;
        
        // 缓存碰撞检测：完全一致则直接跳过！
        const cached = cacheMap.get(f);
        if (cached && cached.meta && cached.meta._mtime === mtimeFingerprint) {
            // 重新计算 rel_path 和 id，防止项目目录迁移后路径过期
            const freshRel = path.relative(baseForRel, f);
            cached.rel_path = freshRel;
            cached.id = crypto.createHash('sha1').update(freshRel).digest('hex');
            entriesRet.push(cached);
            skippedCount++;
            continue;
        }

        if (currentIdx > 0 && currentIdx % 30 === 0) {
            console.log(`[3MF Parser] Processing ${currentIdx}/${files.length} (${Math.round((currentIdx/files.length)*100)}%) ...`);
            await new Promise(r => setTimeout(r, 10)); // Yield completely so buffers clear
            if (global.gc) global.gc(); // optional forced GC for extra safety
        }

        const rel = path.relative(baseForRel, f);
        const eid = crypto.createHash('sha1').update(rel).digest('hex');
        const fileName = path.basename(f);
        const defaultTitle = path.basename(f, '.3mf');

        let thumbPath: string | null = null;
        let picturesOut: string[] = [];
        const metaValues = {
            title: "", desc: "", meta: {} as Record<string, string>
        };

        const zip = new StreamZip.async({ file: f, storeEntries: true });

        try {
            const zipEntries = await zip.entries();
            const entriesList = Object.values(zipEntries);
            
            // Thumb extraction
            for (const cand of THUMB_CANDIDATES) {
                const entry = entriesList.find((e: any) => e.name.toLowerCase() === cand.toLowerCase());
                if (entry) {
                    const thumbRelPath = `assets/thumbs/${eid}.png`;
                    const dest = path.join(outputDir, thumbRelPath);
                    if (!fs.existsSync(dest)) {
                        await zip.extract(entry.name, dest);
                    }
                    thumbPath = `/${thumbRelPath}`;
                    break;
                }
            }

            // Metatdata
            const extracted = await tryExtractTextMetadata(zip);
            metaValues.title = extracted.title || defaultTitle;
            metaValues.desc = extracted.desc;
            metaValues.meta = extracted.meta;

            // Pictures & Plate Renders
            const imgEntries = entriesList.filter((e: any) => {
                const nl = e.name.toLowerCase();
                if (!IMG_EXTS.some(ext => nl.endsWith(ext))) return false;
                
                // 深度过滤：只截获标准缩略图、分盘渲染截图和实拍图，杜绝抓取内部海量的 UV 材质噪声贴图
                if (nl.includes('texture')) return false; 
                
                return nl.includes('thumbnail') || 
                       nl.includes('model pictures') || 
                       nl.match(/plate_\d+/);
            });

            // Sort logic as in python: THUMBS back, model pictures front
            imgEntries.sort((a: any, b: any) => {
                const al = a.name.toLowerCase();
                const bl = b.name.toLowerCase();
                const aThumb = al.includes("/.thumbnails/") ? 1 : 0;
                const bThumb = bl.includes("/.thumbnails/") ? 1 : 0;
                if (aThumb !== bThumb) return aThumb - bThumb;
                
                const aPic = al.startsWith("auxiliaries/model pictures/") ? 0 : 1;
                const bPic = bl.startsWith("auxiliaries/model pictures/") ? 0 : 1;
                if (aPic !== bPic) return aPic - bPic;
                return al.localeCompare(bl);
            });

            let picIndex = 0;
            for (const img of imgEntries) {
                if (picIndex >= 50) break; // Limit pictures
                const ext = path.extname(img.name).toLowerCase() || '.png';
                
                // 识别盘(Plate)专门加上语义 Tag 后缀，前端将据此挂载角标
                const matchPlate = img.name.match(/plate_(\d+)/i);
                const suffix = matchPlate ? `_plate${matchPlate[1]}` : `_${picIndex.toString().padStart(2, '0')}`;
                
                const picRelPath = `assets/previews/${eid}${suffix}${ext}`;
                const dest = path.join(outputDir, picRelPath);
                
                if (!fs.existsSync(dest)) {
                    await zip.extract(img.name, dest);
                }
                picturesOut.push(`/${picRelPath}`);
                picIndex++;
            }
            
            // 扫描可能的耗材/时间标记 (通过探测 .gcode 与 slice_info.config)
            let filamentWeight = "";
            let printTime = "";
            let filamentsArray: {type: string, color: string}[] = [];
            for (const entry of entriesList as any[]) {
                if (entry.name.endsWith('.gcode') || entry.name.endsWith('.config') || entry.name.endsWith('.json')) {
                    if (entry.size > 2000000) continue; // skip massive gcode buffers
                    const text = (await zip.entryData(entry.name)).toString('utf8');
                    
                    if (entry.name === 'Metadata/project_settings.config') {
                        try {
                            const proj = JSON.parse(text);
                            if (proj.filament_type && Array.isArray(proj.filament_type)) {
                                for(let i=0; i<proj.filament_type.length; i++) {
                                    const t = proj.filament_type[i];
                                    if (!t || t.trim().length === 0) continue;
                                    const c = (proj.filament_multi_colour && proj.filament_multi_colour[i]) ? proj.filament_multi_colour[i] : "#808080";
                                    filamentsArray.push({ type: t, color: c });
                                }
                            }
                        } catch(e) {}
                    }
                    
                    const m1 = text.match(/filament used \[g\] = ([0-9.]+)/i); // 经典 GCode 结尾重量
                    const m2 = text.match(/estimated printing time \(normal mode\) = (.*)/i); // 经典 GCode 耗时
                    const m3 = text.match(/<plate[^>]*weight="([0-9.]+)"/i); // 提取 BBS plate_info 内重量
                    const mTotalWeight = text.match(/<metadata key="weight".*?value="([0-9.]+)"/i); // 有些情况写在 config 里
                    
                    if (m1 && !filamentWeight) filamentWeight = m1[1] + 'g';
                    if (mTotalWeight && !filamentWeight) filamentWeight = mTotalWeight[1] + 'g';
                    if (m3 && !filamentWeight) filamentWeight = m3[1] + 'g';
                    
                    if (m2 && !printTime) printTime = m2[1];
                }
            }
            
            if (filamentWeight) metaValues.meta.filamentWeight = filamentWeight;
            if (printTime) metaValues.meta.printTime = printTime;
            if (filamentsArray.length > 0) {
                const uniqueFils = new Map<string, {type:string, color:string}>();
                for (const f of filamentsArray) {
                    const key = `${f.type}-${f.color.toUpperCase()}`;
                    if (!uniqueFils.has(key)) uniqueFils.set(key, f);
                }
                metaValues.meta.filaments = JSON.stringify(Array.from(uniqueFils.values()));
            }

        } catch (e) {
            console.warn(`Failed to process ${f}`);
            metaValues.title = defaultTitle;
            metaValues.desc = "(BadZipFile or Access Error)";
        } finally {
            await zip.close();
        }

        const eMap = metaValues.meta;
        eMap._v = EXTRACTOR_VERSION; // 赋予版本
        eMap._mtime = mtimeFingerprint; // 缓存指纹
        
        entriesRet.push({
            id: eid,
            rel_path: rel,
            abs_path: f,
            file_name: fileName,
            title: metaValues.title,
            description: metaValues.desc,
            designer: eMap['Designer'] || "",
            creation_date: eMap['CreationDate'] || "",
            profile_title: eMap['ProfileTitle'] || "",
            profile_description: eMap['ProfileDescription'] || "",
            license: eMap['License'] || "",
            thumb: thumbPath,
            pictures: picturesOut,
            meta: metaValues.meta,
        });
    }

    if (skippedCount > 0) {
        console.log(`[3MF Parser] Cache skipped ${skippedCount} deeply parsed models!`);
    }

    return entriesRet.sort((a,b) => a.title.localeCompare(b.title));
}

export async function getEntries(): Promise<Entry[]> {
    const fs = await import('fs');
    const path = await import('path');
    const manifestPath = path.join(process.cwd(), "public", "manifest.json");
    
    if (!fs.existsSync(manifestPath)) {
        console.warn("[3MF Parser] manifest.json not found in public/, are you missing `npm run prebuild`?");
        return [];
    }
    
    const data = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(data);
}

import fs from 'fs';
import path from 'path';
import { parseAll3MFs } from '../src/lib/3mf-parser';

async function main() {
    // 支持多目录：MODELS_DIRS 用冒号分隔多个目录
    // 兼容旧写法：MODELS_DIR 单个目录
    // 默认：扫描项目父目录（即 nginx root）
    const modelsDirsEnv = process.env.MODELS_DIRS;
    const modelDirEnv = process.env.MODELS_DIR;
    
    let rootDirs: string[];
    
    if (modelsDirsEnv) {
        rootDirs = modelsDirsEnv.split(':').map(d => path.resolve(d.trim())).filter(d => d.length > 0);
    } else if (modelDirEnv) {
        rootDirs = [path.resolve(modelDirEnv)];
    } else {
        rootDirs = [path.resolve("../")];
    }
    
    // nginx root = 项目父目录，rel_path 以此为基准
    const nginxRoot = path.resolve("..");
    const outputDir = path.join(process.cwd(), "public");
    
    console.log(`[prebuild] nginx root: ${nginxRoot}`);
    console.log(`[prebuild] Scanning ${rootDirs.length} dir(s):`);
    rootDirs.forEach(d => console.log(`  → ${d}`));
    
    const entries = await parseAll3MFs(rootDirs, outputDir, nginxRoot);
    
    const manifestPath = path.join(outputDir, "manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(entries, null, 2));
    console.log(`[prebuild] Done. ${entries.length} models → manifest.json`);
}

main().catch(console.error);

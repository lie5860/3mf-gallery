import fs from 'fs';
import path from 'path';
import type { Entry } from './3mf-parser';

export type { Entry };

/**
 * 读取预构建的 manifest.json（仅在 SSG 构建时调用）
 */
export async function getEntries(): Promise<Entry[]> {
    const manifestPath = path.join(process.cwd(), "public", "manifest.json");
    
    if (!fs.existsSync(manifestPath)) {
        console.warn("[getEntries] manifest.json not found. Run `npm run extract` first.");
        return [];
    }
    
    const data = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(data);
}

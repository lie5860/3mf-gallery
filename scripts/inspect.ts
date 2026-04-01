import StreamZip from 'node-stream-zip';

async function inspect(file: string) {
    const zip = new StreamZip.async({ file, storeEntries: true });
    
    try {
        const entries = await zip.entries();
        for (const [name, entry] of Object.entries(entries) as any[]) {
            if (name.endsWith('.gcode')) {
                const data = await zip.entryData(name);
                const text = data.toString('utf8');
                const last2000 = text.substring(text.length - 2000);
                console.log(`\n--- ${name} ---`);
                console.log(last2000);
            }
        }
    } finally {
        await zip.close();
    }
}

inspect(process.argv[2]).catch(console.error);

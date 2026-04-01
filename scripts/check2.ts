import StreamZip from 'node-stream-zip';

async function check() {
    const file = "../在日光下等待嘎子姐情人节限定拆分版16cm.3mf";
    const zip = new StreamZip.async({ file });
    try {
        const data = await zip.entryData('Metadata/project_settings.config');
        const config = JSON.parse(data.toString('utf8'));
        const keys = Object.keys(config).filter(k => k.includes('color') || k.includes('filament'));
        console.log("Matching keys:", keys);
        keys.forEach(k => console.log(k, ":", config[k]));
    } catch (e) { console.error(e); }
    await zip.close();
}
check();

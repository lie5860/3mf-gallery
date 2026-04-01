import StreamZip from 'node-stream-zip';

async function check() {
    const file = "../在日光下等待嘎子姐情人节限定拆分版16cm.3mf";
    const zip = new StreamZip.async({ file });
    try {
        const data = await zip.entryData('Metadata/project_settings.config');
        const config = JSON.parse(data.toString('utf8'));
        console.log("Filament Type:", config.filament_type);
        console.log("Filament Id:", config.filament_id);
    } catch (e) { console.error(e); }
    await zip.close();
}
check();

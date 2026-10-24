// Publish the already-audited inventory for the static device view; no network requests.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const snapshot=JSON.parse(await fs.readFile(path.join(root,'docs/MONITORING-INVENTORY.json'),'utf8'));
if(snapshot.schemaVersion!==1||!snapshot.rows.length||!snapshot.sources.VD)throw Error('Invalid inventory');
const encoded=JSON.stringify(snapshot).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
await fs.writeFile(path.join(root,'web/data/vd-inventory.js'),'// Saved observation inventory, not a live feed. Regenerate with scripts/export-vd-inventory.mjs.\nwindow.VD_INVENTORY = '+encoded+';\n');
console.log('Exported VD inventory: '+new Set(snapshot.rows.map(r=>r.vdId)).size+' devices');

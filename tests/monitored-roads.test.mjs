import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildDisplayNetwork,matchObservations} from '../web/traffic-network.js';

const adapter = await import('../web/monitored-roads.js').catch(() => ({}));
const inventory = JSON.parse(fs.readFileSync(new URL('../docs/MONITORING-INVENTORY.json', import.meta.url)));
const history = JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json', import.meta.url)));
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../web/data/neihu-road-network.js', import.meta.url), 'utf8'), context);
const roads = context.window.NEIHU_ROADS;

test('current district monitoring retains all 80 exact directions, 52 devices and 21 road names', () => {
 assert.equal(typeof adapter.buildMonitoredSummary, 'function', 'all-current-direction adapter must exist');
 const original = JSON.stringify([inventory, history]);
 const summary = adapter.buildMonitoredSummary(inventory, history);
 assert.equal(summary.rows.length, 80);
 assert.equal(summary.representatives.length, 80, 'duplicate LinkIDs from different detectors must remain inspectable');
 assert.equal(new Set(summary.rows.map(d => d.vdId)).size, 52);
 assert.equal(new Set(summary.rows.map(d => d.roadName)).size, 21);
 assert.equal(summary.coverage.mapped, 80);
 assert.equal(summary.coverage.unmapped, 0);
 for (const row of summary.rows) {
  assert.ok(row.geometry?.shape?.length >= 2, row.id);
  assert.equal(row.geometryProvenance.method, 'exact-current-direction');
  assert.equal(row.geometryProvenance.sourceId, row.id);
  assert.ok(row.scope.included);
 }
 for (const name of ['東湖路', '成功路五段', '成功路四段', '文德路']) assert.ok(summary.rows.some(d => d.roadName === name && d.geometry?.shape?.length >= 2), name);
 assert.equal(JSON.stringify([inventory, history]), original, 'source observations remain immutable');
});

test('new district devices may use only exact LinkID, bearing and name geometry; unknown shapes stay visible', () => {
 assert.equal(typeof adapter.buildMonitoredSummary, 'function');
 const source = inventory.rows.find(d => d.vdId === 'VQBUL20');
 const newRow = {...source, id:'FUTURE:UNKNOWN', vdId:'FUTURE', linkId:'UNKNOWN'};
 const input = {...inventory, rows:[newRow]};
 const missing = adapter.buildMonitoredSummary(input, history);
 assert.equal(missing.rows.length, 1);
 assert.equal(missing.rows[0].geometry, null);
 assert.equal(missing.rows[0].geometryState, 'unmapped');
 assert.equal(missing.coverage.unmapped, 1);
 const reused = adapter.buildMonitoredSummary({...input,rows:[{...source,id:'FUTURE:'+source.linkId,vdId:'FUTURE'}]}, history).rows[0];
 assert.deepEqual(reused.geometry.shape, history.directions.find(d => d.id === source.id).geometry.shape);
 assert.equal(reused.geometryProvenance.method, 'exact-link-direction');
 for (const patch of [{bearing:'N'}, {roadName:'同名附近路'}, {linkId:'UNKNOWN'}]) {
  assert.equal(adapter.buildMonitoredSummary({...input,rows:[{...source,id:'NEW',vdId:'NEW',...patch}]},history).rows[0].geometry, null);
 }
});

test('expanded physical road asset contains all four missing streets, complete geometry bounds and source topology', () => {
 for (const name of ['東湖路', '成功路五段', '成功路四段', '文德路']) assert.ok(roads.features.some(f => f.properties.name === name && f.geometry.type === 'LineString'), name);
 assert.equal(typeof adapter.buildMonitoredSummary, 'function');
 for (const d of adapter.buildMonitoredSummary(inventory,history).rows) {
  for (const [lon,lat] of d.geometry.shape) assert.ok(lon >= roads.bbox[0] && lon <= roads.bbox[2] && lat >= roads.bbox[1] && lat <= roads.bbox[3], d.id);
 }
 for (const f of roads.features.filter(f => f.geometry.type === 'LineString')) {
  assert.equal(f.properties.nodeRefs?.length, f.geometry.coordinates.length, f.id + ' source nodes');
  assert.ok(f.properties.tags && Object.hasOwn(f.properties,'oneway'));
 }
 assert.ok(Array.isArray(roads.restrictions), 'preserve source turn restrictions separately');
});

test('physical network retains motorway and tertiary approaches as genuine source roads', () => {
 for (const highway of ['motorway_link','tertiary_link']) assert.ok(roads.features.some(f=>f.properties.highway===highway), highway+' approach geometry');
});

test('every current direction binds to a real road, and the elevated exit never inherits the ground road',()=>{
 const summary=adapter.buildMonitoredSummary(inventory,history),network=buildDisplayNetwork(roads);
 const paths=matchObservations(network,summary.representatives);
 const ids=new Set(paths.flatMap(p=>p.segments.flatMap(s=>s.routes)));
 assert.equal(ids.size,80,'same-LinkID detector directions must stay selectable');
 const ramp=paths.filter(p=>p.segments.some(s=>s.routes.includes('V6121A0:2000700100400A')));
 assert.ok(ramp.length);
 assert.ok(ramp.every(p=>p.sources.includes('51813000')&&p.bridge));
 assert.ok(ramp.every(p=>p.points.every(v=>v[1]>1.5)),'layer 3 ramp stays above 南京東路六段');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {deviceInventory,nearestOnReference,insideBounds} from '../web/vd-location-model.js';
const snapshot=JSON.parse(fs.readFileSync(new URL('../docs/MONITORING-INVENTORY.json',import.meta.url),'utf8'));
const history=JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json',import.meta.url),'utf8'));
const context={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../web/data/neihu-road-network.js',import.meta.url),'utf8'),context);
const bbox=context.window.NEIHU_ROADS.bbox;
test('current device inventory keeps two directions on one physical VD, with exact official coordinates',()=>{
 const before=JSON.stringify(snapshot),devices=deviceInventory(snapshot,history,bbox);
 assert.equal(devices.length,128);assert.equal(devices.filter(d=>d.inMap).length,90);assert.equal(devices.flatMap(d=>d.links).length,191);
 const d=devices.find(d=>d.id==='VQBUL20');assert.equal(d.links.length,2);assert.deepEqual(d.links.map(l=>l.bearing),['E','W']);
 assert.deepEqual(d.position,snapshot.rows.find(r=>r.vdId===d.id).position);assert.equal(d.links[0].reference.geometry.sectionId,null,'Do not manufacture a SectionID from a LinkID');
 const turning=devices.find(d=>d.id==='V6121A0').links[0];assert.equal(turning.roadDirection,'N');assert.equal(turning.bearing,'W');assert.ok(turning.reference,'Local bearing, not road direction, matches the historical reference');
 assert.equal(JSON.stringify(snapshot),before);
});
test('no geometry is inherited from a similar name, different direction or different device',()=>{
 const changed=structuredClone(snapshot),r=changed.rows.find(r=>r.id==='VQBUL20:6005320200000A');r.bearing='N';
 const d=deviceInventory(changed,history,bbox).find(d=>d.id==='VQBUL20');assert.equal(d.links[0].reference,null);assert.ok(d.links[1].reference);
 const added=deviceInventory(snapshot,history,bbox).flatMap(d=>d.links).filter(l=>!l.reference);assert.equal(added.length,110);
});
test('nearest point is only calculated on the supplied reference, preserves coordinates and is not a detector footprint',()=>{
 const p={lat:25,lon:121},shape=[[120.999,25.001],[121.001,25.001]];
 const result=nearestOnReference(p,shape);assert.ok(Math.abs(result.distance-111.32)<.01);assert.deepEqual(result.point,[121,25.001]);
 assert.deepEqual(p,{lat:25,lon:121});assert.equal(nearestOnReference(p,null),null);
 assert.equal(insideBounds({lat:25.2,lon:121.6},bbox),false);assert.equal(insideBounds({lat:25.07,lon:121.58},bbox),true);
});
test('published inventory is the audited source snapshot, not a fabricated live sample',()=>{
 const globals={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../web/data/vd-inventory.js',import.meta.url),'utf8'),globals);
 assert.equal(JSON.stringify(globals.window.VD_INVENTORY),JSON.stringify(snapshot));
});

test('supplemental road overlays use exact references and stay inside map bounds',async()=>{
 const {referenceRoads}=await import('../web/vd-location-model.js');
 const devices=deviceInventory(snapshot,history,bbox),roads=referenceRoads(devices,bbox);
 assert.ok(roads.length>0);assert.equal(new Set(roads.map(r=>r.id)).size,roads.length);
 for(const r of roads){const link=devices.flatMap(d=>d.links).find(l=>l.id===r.id);assert.ok(link.reference);assert.equal(link.reference.linkId,r.linkId);assert.equal(link.reference.bearing,r.bearing);for(const p of r.segments.flat())assert.ok(p[0]>=bbox[0]-1e-9&&p[0]<=bbox[2]+1e-9&&p[1]>=bbox[1]-1e-9&&p[1]<=bbox[3]+1e-9);}
 const omitted=referenceRoads(devices,bbox,[roads[0].id]);assert.ok(!omitted.some(r=>r.id===roads[0].id));
 const unknown=devices.filter(d=>d.links.every(l=>!l.reference));assert.equal(referenceRoads(unknown,bbox).length,0);
 const wrong=structuredClone(devices);for(const d of wrong)for(const l of d.links)l.bearing='INVALID';assert.equal(referenceRoads(wrong,bbox).length,0);
});

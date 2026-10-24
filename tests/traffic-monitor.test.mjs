import test from 'node:test';
import assert from 'node:assert/strict';
import {freshness,monitoringRows,monitoredPaths,observedVehicleLayout} from '../web/traffic-monitor-model.js';
const now=Date.parse('2026-10-24T11:20:00+08:00'),stamp='2026-10-24T11:19:00+08:00';
const direction={id:'a:l',vdId:'a',linkId:'l',roadName:'測試路',bearing:'E',geometry:{sectionId:'s'}};
const vd={id:'a:l',linkId:'l',roadName:'測試路',bearing:'E',basicValid:true,dataCollectTime:stamp,volumes:{M:12,S:30,L:2,T:1},speed:25};
const section={sectionId:'s',roadName:'測試路',bearing:'E',basicValid:true,dataCollectTime:stamp,speed:18,travelTime:120};
const snapshot=()=>({rows:[structuredClone(vd)],sections:[structuredClone(section)]});
const row=s=>monitoringRows(s,[direction],now)[0];
test('source timestamp, not fetch time, controls stale/missing/future observations',()=>{
 assert.equal(freshness(null,now),'missing');assert.equal(freshness(stamp,now),'fresh');
 assert.equal(freshness('2026-10-24T11:00:00+08:00',now),'stale');assert.equal(freshness('2026-10-24T11:30:00+08:00',now),'future');
 const s=snapshot();s.rows[0].dataCollectTime=s.sections[0].dataCollectTime='2026-10-24T11:00:00+08:00';s.fetchedAt=new Date(now).toISOString();
 assert.equal(row(s).state,'stale');assert.equal(row(s).volumes,null);assert.equal(row(s).speed,null);
});
test('same IDs/direction required; independently stale sections do not replace fresh VD speed',()=>{
 assert.equal(row(snapshot()).speed,18);const s=snapshot();s.sections[0].bearing='W';assert.equal(row(s).speed,25);
 s.rows[0].bearing='W';assert.equal(row(s).flowValid,false);assert.equal(row(s).speed,null);
 s.rows[0]={...vd};s.sections[0]={...section,dataCollectTime:'2026-10-24T11:00:00+08:00'};assert.equal(row(s).speed,25);
});
test('VD local bearing and official section road direction remain separate on a bend',()=>{
 const d={...direction,bearing:'W'},s=snapshot();s.rows[0]={...vd,bearing:'W',roadDirection:'N'};s.sections[0]={...section,bearing:'N'};
 const result=monitoringRows(s,[d],now)[0];assert.equal(result.flowValid,true);assert.equal(result.sectionValid,true);assert.equal(result.speed,18);
});
test('duplicate records, bad equipment and missing flow do not produce vehicles',()=>{
 const s=snapshot();s.rows.push({...vd});let r=row(s);assert.equal(r.flowValid,false);assert.equal(r.speed,18);assert.equal(observedVehicleLayout(8,r).length,0);
 s.rows=[{...vd,basicValid:false}];r=row(s);assert.equal(r.flowValid,false);assert.equal(observedVehicleLayout(8,r).length,0);
});
test('observed volume changes density, measured speed controls a common time scale; no guessed motorcycle split',()=>{
 const r=row(snapshot()),base=observedVehicleLayout(8,r);assert.ok(base.some(v=>v.kind==='moto'));assert.ok(base.some(v=>v.kind==='car'));
 const empty={...r,volumes:{M:0,S:0,L:0,T:0}};assert.equal(observedVehicleLayout(8,empty).length,0);
 const noMoto={...r,volumes:{M:0,S:30,L:0,T:0}};assert.ok(observedVehicleLayout(8,noMoto).every(v=>v.kind==='car'));
 const missing={...r,volumes:{S:30,L:0,T:0}};assert.equal(observedVehicleLayout(8,missing).length,0);
 assert.ok(observedVehicleLayout(8,r,{motorcycles:false}).every(v=>v.kind==='car'));
 assert.equal(observedVehicleLayout(8,{...r,speed:36})[0].speed/base[0].speed,2);
 assert.ok(observedVehicleLayout(8,{...r,volumes:{M:40,S:80,L:0,T:0}}).length>base.length);
});
test('measurement never propagates through an unobserved segment or to another road',()=>{
 const binding={id:'p',names:['測試路'],segments:[{a:[0,0,0],b:[1,0,0],route:'a:l'},{a:[1,0,0],b:[2,0,0],route:null},{a:[2,0,0],b:[3,0,0],route:'a:l'},{a:[3,0,0],b:[4,0,0],route:'other'}]};
 const paths=monitoredPaths([binding],[row(snapshot())]);assert.equal(paths.length,2);assert.deepEqual(paths[0].points,[[0,0,0],[1,0,0]]);assert.deepEqual(paths[1].points,[[2,0,0],[3,0,0]]);
 assert.equal(monitoredPaths([binding],[{...row(snapshot()),flowValid:false}]).length,0);
});

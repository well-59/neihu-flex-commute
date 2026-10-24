import test from 'node:test';
import assert from 'node:assert/strict';
import {freshness,monitoringRows,monitoredPaths,observedVehicleLayout,congestionHistory} from '../web/traffic-monitor-model.js';
import * as monitorModel from '../web/traffic-monitor-model.js';
const now=Date.parse('2026-10-24T11:20:00+08:00'),stamp='2026-10-24T11:19:00+08:00';
const direction={id:'a:l',vdId:'a',linkId:'l',roadName:'測試路',bearing:'E',geometry:{sectionId:'s'}};
const vd={id:'a:l',linkId:'l',roadName:'測試路',bearing:'E',basicValid:true,dataCollectTime:stamp,volumes:{M:12,S:30,L:2,T:1},speed:25};
const section={sectionId:'s',roadName:'測試路',bearing:'E',basicValid:true,dataCollectTime:stamp,speed:18,travelTime:120};

test('a stale primary detector cannot hide a valid overlapping detector or double its flow',()=>{
 const binding={id:'path',points:[[0,0,0],[1,0,0]],segments:[{a:[0,0,0],b:[1,0,0],route:'old',routes:['old','new']} ]};
 const valid={id:'new',flowValid:true,speed:20,vd:{dataCollectTime:stamp},volumes:{M:1,S:2,L:0,T:0}};
 const paths=monitoredPaths([binding],[{id:'old',flowValid:false,speed:null},valid]);
 assert.equal(paths.length,1);assert.equal(paths[0].observationId,'new');assert.equal(paths[0].monitoring.volumes.S,2);
});
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
test('local live speed bands share four explicit congestion states and boundary ownership',()=>{
 const classify=speed=>row({rows:[{...vd,speed}],sections:[]}).trafficStatus;
 assert.equal(classify(14.9)?.level,'severe');assert.equal(classify(15)?.level,'congested');
 assert.equal(classify(25)?.level,'slowing');assert.equal(classify(40)?.level,'free');
 assert.equal(new Set([10,20,30,50].map(v=>classify(v)?.color)).size,4);
 assert.match(classify(20)?.basis||'',/本地.*非官方/);
 assert.deepEqual(monitorModel.TRAFFIC_STATES?.map(s=>s.level),['free','slowing','congested','severe','unknown']);
});
test('invalid numeric speed and zero-flow do not become a green road',()=>{
 for(const speed of [0,-1,NaN,Infinity,201]){
  const r=row({rows:[{...vd,speed}],sections:[]});
  assert.equal(r.speed,null);assert.equal(r.trafficStatus?.level,'unknown');
 }
 const zero=row({rows:[{...vd,speed:50,volumes:{M:0,S:0,L:0,T:0}}],sections:[]});
 assert.equal(zero.speed,null);assert.equal(zero.trafficStatus?.level,'unknown');
});
test('published congestion requires a known applicable group and fresh exact section join',()=>{
 const d={...direction,geometry:{...direction.geometry,congestionLevelId:'RoadClass6_default'}};
 const s=snapshot();s.sections[0]={...section,congestionLevel:5,congestionLevelId:'RoadClass6_default'};
 const valid=monitoringRows(s,[d],now)[0];assert.equal(valid.trafficStatus?.grade,'E');
 assert.equal(valid.trafficStatus?.kind,'published');assert.equal(valid.trafficStatus?.level,'congested');
 s.sections[0].congestionLevelId='unknown';assert.notEqual(monitoringRows(s,[d],now)[0].trafficStatus?.kind,'published');
 s.sections[0].congestionLevelId='RoadClass6_default';s.sections[0].dataCollectTime='2026-10-24T11:00:00+08:00';
 assert.notEqual(monitoringRows(s,[d],now)[0].trafficStatus?.kind,'published');
});
test('a documented route group can classify measured speed without claiming official publication',()=>{
 const d={...direction,geometry:{...direction.geometry,congestionLevelId:'RoadClass6_default'}};
 const s={rows:[{...vd,speed:20}],sections:[]};const result=monitoringRows(s,[d],now)[0];
 assert.equal(result.trafficStatus?.grade,'E');assert.equal(result.trafficStatus?.kind,'derived');
 assert.match(result.trafficStatus?.basis||'',/試算/);assert.equal(result.color,result.trafficStatus?.color);
 s.rows[0].speed=40;assert.equal(monitoringRows(s,[d],now)[0].trafficStatus?.grade,'A');
 s.rows[0].speed=19.9;assert.equal(monitoringRows(s,[d],now)[0].trafficStatus?.grade,'F');
});
test('missing, stale, future and broken vehicle types remain gray even with a new fetch time',()=>{
 for(const timestamp of [null,'2026-10-24T11:00:00+08:00','2026-10-24T11:30:00+08:00']){
  const r=row({rows:[{...vd,dataCollectTime:timestamp}],sections:[],fetchedAt:new Date(now).toISOString()});
  assert.equal(r.trafficStatus?.level,'unknown');
 }
 const r=row({rows:[{...vd,volumes:{S:20,L:1,T:0}}],sections:[]});assert.equal(r.flowValid,false);
 assert.equal(r.trafficStatus?.level,'unknown');
});

test('monthly congestion history ranks slow slots, ignores thin or excluded days, and derives no per-slot speed',()=>{
 const bins=jam=>Array.from({length:10},(_,i)=>i===4?[15,jam]:i===5?[15,3]:i===9?[2,2]:[15,0]);
 const history={geometry:{congestionLevelId:'RoadClass6_default'},days:[
  {date:'d1',speedMinutes:100,speedSum:3000,congestionProfile:{bins:bins(9)}},
  {date:'d2',speedMinutes:100,speedSum:2000,congestionProfile:{bins:bins(6)}},
  {date:'d3',speedMinutes:100,speedSum:2500,congestionProfile:{bins:bins(0)}},
  {date:'holiday',speedMinutes:100,speedSum:9000,congestionProfile:{bins:bins(15)}}]};
 const levels=[{CongestionLevelID:'RoadClass6_default',Levels:[{Level:5,TopValue:25,LowValue:20},{Level:6,TopValue:20,LowValue:0}]}];
 const result=congestionHistory(history,['d1','d2','d3','d4'],levels);
 assert.equal(result.days,3);assert.equal(result.dates,4);
 assert.deepEqual(result.periods[4],{index:4,start:480,classified:45,congested:15,observedDays:3,jamDays:2,share:15/45});
 // Slot 09:15 is 100% slow but has only 6 classified minutes, so it is not called jam-prone.
 assert.deepEqual(result.hot.map(p=>p.index),[4,5]);
 assert.equal(result.averageSpeed,25);assert.equal(result.jamBelow,25);
 assert.equal(congestionHistory({days:[]},['d1']).averageSpeed,null);
 assert.deepEqual(congestionHistory(undefined,['d1']).hot,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {arrivalWindow,relativePosition,companyEvidence,renderCompanyCommute} from '../web/company-commute.js';
import {summarize} from '../web/route-evidence-model.js';
const bbox=[121.55,25.04,121.61,25.10],company={lat:25.07,lon:121.58,time:'08:00',radius:3000,rule:'half'};
const make=(id,position,bins)=>({id,vdId:id,roadName:'測試路',bearing:'S',position,days:[{date:'day',congestionProfile:{bins:Array.from({length:10},(_,i)=>bins[i]||[15,0])}}]});
const base={dates:['day'],requested:['day'],rows:[]};
test('cardinal sectors are company-to-detector positions, independent of traffic bearing',()=>{
 for(const [sector,p] of Object.entries({N:{lat:25.08,lon:121.58},S:{lat:25.06,lon:121.58},E:{lat:25.07,lon:121.59},W:{lat:25.07,lon:121.57}})){const r=relativePosition(company,p);assert.equal(r.sector,sector);assert.ok(r.distance>900&&r.distance<1200);}
 assert.equal(relativePosition(company,company).sector,'C');assert.throws(()=>relativePosition(company,{lat:NaN,lon:121}));
});
test('arrival windows are half-open and partial bins disclose coarse resolution',()=>{
 assert.deepEqual(arrivalWindow('08:00'),{start:465,end:480,label:'07:45–08:00'});
 const d=make('north',{lat:25.08,lon:121.58},{3:[15,9],4:[15,12]});
 let r=companyEvidence({...base,rows:[d]},company,bbox);assert.equal(r.status,'DISCUSS_FLEX');assert.equal(r.sectors.N[0].bearing,'S');assert.ok(Number.isFinite(r.sectors.N[0].azimuth));assert.deepEqual(r.sectors.N[0].hits.map(p=>p.index),[3]);assert.equal(r.sectors.N[0].hits[0].overlap,15);
 r=companyEvidence({...base,rows:[d]},{...company,time:'08:05'},bbox);assert.equal(r.partialSlots,true);assert.deepEqual(r.sectors.N[0].hits.map(p=>p.overlap),[10,5]);assert.equal(r.sectors.N[0].hits[0].share,.6,'Do not prorate observed congestion minutes');
 assert.throws(()=>arrivalWindow('25:00'));assert.throws(()=>arrivalWindow('00:05'));
});
test('thresholds, zero observations, missing coverage, radius, invalid positions and IDs',()=>{
 const low=make('low',{lat:25.08,lon:121.58},{3:[15,1]}),missing=make('missing',{lat:25.07,lon:121.57},{3:[0,0]});
 assert.equal(companyEvidence({...base,rows:[low]},company,bbox).status,'NO_TRIGGER');
 assert.equal(companyEvidence({...base,rows:[low]},{...company,rule:'any'},bbox).status,'DISCUSS_FLEX');
 assert.equal(companyEvidence({...base,rows:[missing]},company,bbox).status,'INSUFFICIENT_DATA');
 assert.equal(companyEvidence({...base,rows:[low]},{...company,time:'10:00'},bbox).status,'INSUFFICIENT_DATA');
 assert.equal(companyEvidence({...base,rows:[low]},{...company,radius:500},bbox).rows,0);
 const bad={...low,id:'bad',position:{lat:NaN,lon:121.58}};
 const r=companyEvidence({...base,rows:[low,low,bad]},company,bbox);assert.equal(r.rows,1);assert.equal(r.excludedPositions,1);
 assert.throws(()=>companyEvidence(base,{...company,lat:23},bbox));assert.throws(()=>companyEvidence(base,{...company,rule:'unknown'},bbox));
 const noDates=companyEvidence({...base,requested:[],dates:[],rows:[low]},company,bbox);assert.equal(noDates.status,'INSUFFICIENT_DATA');assert.equal(noDates.policyEffect,null);
});
test('production rows and raw bins remain source of recommendation; missing companies never trigger',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json',import.meta.url))),s=summarize(data,{scope:'all'}),before=JSON.stringify(data);
 const r=companyEvidence(s,{...company,radius:'map'},bbox);assert.ok(r.rows>0);
 for(const road of Object.values(r.sectors).flat())for(const p of road.hits){const d=data.directions.find(d=>d.id===road.id),bins=d.days.filter(day=>s.requested.includes(day.date)).map(day=>day.congestionProfile.bins[p.index]);const minutes=bins.reduce((n,b)=>n+b[0],0),jam=bins.reduce((n,b)=>n+b[1],0);assert.equal(p.share,jam/minutes);assert.ok(p.share>=.5);assert.equal(p.index,3);}
 assert.equal(JSON.stringify(data),before);assert.equal(renderCompanyCommute(s,{...company,lat:null,lon:null},bbox,'test').result,null);
 const partial=renderCompanyCommute(s,{...company,time:'08:05'},bbox,'test');assert.match(partial.html,/無法確定低速分鐘/);assert.match(partial.html,/不是員工來向/);
});

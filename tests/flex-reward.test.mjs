import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {flexPlan,maxSetWindow,recommendFlex,rewardCheck,places,parseTime} from '../web/flex-reward-model.js';
import {flexMethodHtml} from '../web/flex-reward.js';
import {createWallet,memoryStorage,catalog,SEED_POINTS} from '../web/reward-store.js';
import {summarize} from '../web/route-evidence-model.js';
const bbox=[121.55,25.04,121.61,25.10],company={lat:25.07,lon:121.58,time:'08:30'};
// bins[i]=[classified, congested] minutes for slot i (07:00 + 15i).
const make=(id,position,bins)=>({id,vdId:id,roadName:id,bearing:'N',position,days:[{date:'day',congestionProfile:{bins:Array.from({length:10},(_,i)=>bins[i]||[15,0])}}]});
const base={dates:['day'],requested:['day'],rows:[]},east={lat:25.07,lon:121.59},north={lat:25.08,lon:121.58};
const jam=slots=>Object.fromEntries(slots.map(i=>[i,[15,12]]));
test('max-set window holds the largest simultaneous set and prefers the core window',()=>{
 assert.equal(maxSetWindow([0,0,0,0,0,0,0,0,0,0],480),null);
 // n*=5 at 08:15; 0.8×5=4 keeps 08:00–08:45.
 assert.deepEqual(maxSetWindow([0,1,2,3,4,5,4,2,0,0],510).label,'08:00–08:45');
 // Two blocks reach the max: keep the one that overlaps [T−15,T+15), otherwise the nearest.
 assert.equal(maxSetWindow([1,0,0,0,0,0,0,0,1,0],540).label,'09:00–09:15');
 assert.equal(maxSetWindow([1,0,0,0,0,0,0,0,1,0],440).label,'07:00–07:15');
 // A near-peak block without n* is not the max set.
 assert.equal(maxSetWindow([4,0,5,0,0,0,0,0,0,0],420).label,'07:30–07:45');
});
test('recommended flex follows F=min(120,max(30,⌈max(T−a,b−T)+15⌉₁₅))',()=>{
 const T=parseTime('09:00');
 assert.deepEqual(recommendFlex(T,{start:510,end:570}),{flex:45,reason:'PEAK_NEAR_START',need:45,capped:false});
 assert.equal(recommendFlex(T,{start:495,end:540}).flex,60);
 assert.equal(recommendFlex(T,{start:540,end:555}).flex,30,'small peaks keep the base flex');
 assert.deepEqual(recommendFlex(T,{start:420,end:465}),{flex:30,reason:'PEAK_ELSEWHERE',need:null,capped:false});
 assert.equal(recommendFlex(T,null).reason,'NO_CONGESTION');
 assert.deepEqual(recommendFlex(parseTime('08:00'),{start:420,end:570}),{flex:105,reason:'PEAK_NEAR_START',need:105,capped:false});
 assert.equal(recommendFlex(parseTime('07:00'),{start:420,end:570}).capped,true);
});
test('reward rule: ±15-minute core earns nothing, both sides inside flex earn one point',()=>{
 assert.equal(rewardCheck('09:00',45,'08:15').points,1);assert.equal(rewardCheck('09:00',45,'08:44').zone,'early');
 assert.equal(rewardCheck('09:00',45,'08:45').zone,'core');assert.equal(rewardCheck('09:00',45,'09:15').zone,'core');
 assert.equal(rewardCheck('09:00',45,'09:16').zone,'late');assert.equal(rewardCheck('09:00',45,'09:45').points,1);
 assert.equal(rewardCheck('09:00',45,'09:46').zone,'outside');assert.equal(rewardCheck('09:00',45,'08:14').points,0);
 assert.throws(()=>rewardCheck('09:00',45,'9:00'));
});
test('sectors, chronic roads, empty directions and input validation',()=>{
 const rows=[make('e1',east,jam([5,6])),make('e2',east,jam([6,7])),make('chronic',east,jam([0,1,2,3,4,5,6,7,8,9])),make('n1',north,{})];
 const r=flexPlan({...base,rows},company,bbox);
 assert.equal(r.sectors.E.roads.length,3);assert.deepEqual(r.sectors.E.chronic.map(x=>x.id),['chronic']);
 assert.deepEqual(r.sectors.E.counts,[0,0,0,0,0,1,2,1,0,0]);assert.equal(r.sectors.E.peak.label,'08:30–08:45');
 assert.equal(r.sectors.E.reason,'PEAK_NEAR_START');assert.equal(r.sectors.E.flex,30);
 assert.equal(r.sectors.N.reason,'NO_CONGESTION');assert.equal(r.sectors.S.reason,'NO_ROADS');assert.equal(r.sectors.W.flex,30);
 assert.equal(flexPlan({...base,rows:[make('c',east,jam([0,1,2,3,4,5,6,7,8,9]))]},company,bbox).sectors.E.reason,'CHRONIC_ONLY');
 assert.equal(flexPlan({...base,rows:[make('m',east,Object.fromEntries(Array.from({length:10},(_,i)=>[i,[0,0]])))]},company,bbox).sectors.E.reason,'NO_DATA');
 assert.equal(flexPlan({...base,rows},company,bbox,{radius:500}).rows,0);
 assert.throws(()=>flexPlan(base,{...company,time:'10:00'},bbox),/07:00–09:30/);
 assert.throws(()=>flexPlan(base,{...company,lat:23},bbox));assert.throws(()=>flexPlan(base,company,bbox,{theta:0}));
 const clear=r.sectors.E.clear;assert.ok(clear.every(([a,b])=>b<=r.sectors.E.peak.start||a>=r.sectors.E.peak.end),'peak-free arrivals avoid W');
});
test('production data: counts match raw bins and the snapshot is not changed',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json',import.meta.url))),before=JSON.stringify(data),s=summarize(data,{scope:'all',skipHolidays:true});
 const bounds=[121.55,25.047,121.623,25.091];
 for(const place of places){
  const r=flexPlan(s,{...place,time:'09:00'},bounds);assert.equal(r.policyEffect,null);
  for(const sector of Object.values(r.sectors)){
   for(const road of sector.roads)for(const p of road.slots){const d=data.directions.find(d=>d.id===road.id),bins=d.days.filter(day=>s.requested.includes(day.date)).map(day=>day.congestionProfile.bins[p.index]),minutes=bins.reduce((n,b)=>n+b[0],0);assert.equal(p.share,minutes?bins.reduce((n,b)=>n+b[1],0)/minutes:null);}
   assert.ok(sector.flex>=30&&sector.flex<=120&&sector.flex%15===0);
  }
 }
 const park=flexPlan(s,{...places[0],time:'09:00'},bounds);assert.deepEqual(Object.values(park.sectors).map(x=>x.flex),[30,30,60,45]);
 assert.equal(JSON.stringify(data),before);
 const html=flexMethodHtml(park);for(const formula of ['s(r,t) = Σ<sub>d</sub> 低速分鐘(r,t,d) ÷ Σ<sub>d</sub> 可判讀分鐘(r,t,d)','n(D,t) = ｜S(D,t)｜','C = [T − 15, T + 15)','F(D) = min(120, max(30,','T + 15 &lt; x ≤ T + F　→　1 點'])assert.ok(html.includes(formula),formula);
 // Every symbol used in the steps is defined before it is used, including what a low-speed minute is.
 const glossary=html.slice(0,html.indexOf('<h4>計算步驟</h4>'));
 for(const term of ['T','t','d','D','r','R','θ','s(r,t)','h(r,t)','S(D,t)','n(D,t)','n*','W(D) = [a, b)','C','F(D)','x','Σ','Σ<sub>d</sub>','Σ<sub>t</sub>','max、min','｜S｜','{ r ∈ D ｜ 條件 }','[a, b)','∩、∪、∅、≠','⌈x⌉<sub>15</sub>','低速分鐘','可判讀分鐘','A–F 級','VD'])assert.ok(glossary.includes(`<dt>${term}</dt>`),term);
 assert.match(glossary,/前情提要/);assert.match(glossary,/E 或 F 級/);assert.match(glossary,/19 個上班日（其中 18 天有資料）/);
 assert.match(html,/計算範例：目前選擇的南方/);assert.doesNotMatch(flexMethodHtml(null),/計算範例/);
 // The worked example quotes the same raw sums the model used.
 const south=park.sectors.S,road=south.peakRoads[0],slot=road.slots.slice(south.peak.from,south.peak.to+1).find(p=>p.hot);
 assert.ok(html.includes(`Σ<sub>d</sub> 低速分鐘 = ${slot.congested}、Σ<sub>d</sub> 可判讀分鐘 = ${slot.classified}`));
});
test('wallet: one point per workday, redemption, stock, persistence and reset',()=>{
 const storage=memoryStorage(),w=createWallet(storage),coffee=catalog.find(i=>i.id==='coffee'),earn=(date,arrival)=>w.earn({date,arrival,time:'09:00',flex:45,direction:'南方',check:rewardCheck('09:00',45,arrival)});
 assert.equal(w.balance,SEED_POINTS);
 assert.equal(earn('2026-10-26','08:50').recorded,false,'core arrival');
 assert.equal(earn('2026-10-26','08:20').recorded,true);
 assert.equal(earn('2026-10-26','09:30').duplicate,true);
 assert.equal(w.balance,SEED_POINTS+1);
 const {code}=w.redeem('coffee','2026-10-26');assert.match(code,/^NH-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
 assert.equal(w.balance,SEED_POINTS+1-coffee.cost);assert.equal(w.stockLeft(coffee),coffee.stock-1);assert.equal(w.history[0].points,-coffee.cost);
 assert.throws(()=>w.redeem('leave-2h','2026-10-26'),/點數不足/);assert.throws(()=>w.redeem('missing'),/找不到/);
 const again=createWallet(storage);assert.equal(again.balance,w.balance);assert.equal(again.checkedIn('2026-10-26'),'08:20');
 again.reset();assert.equal(createWallet(storage).balance,SEED_POINTS);
 const broken=memoryStorage();broken.setItem('neihu-flex-wallet-v1','{bad');assert.equal(createWallet(broken).balance,SEED_POINTS);
 assert.ok(catalog.length>=12&&catalog.every(i=>Number.isInteger(i.cost)&&i.cost>0));
});

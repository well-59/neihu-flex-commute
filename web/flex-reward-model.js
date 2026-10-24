import {periodEvidence} from './route-evidence-model.js';
import {insideBounds,relativePosition} from './vd-location-model.js';
// Multi-day snapshot: ten 15-minute slots, 07:00–09:30. Minutes are counted from midnight.
export const SLOT_START=420,SLOT_COUNT=10,DATA_END=570,CORE=15,BASE_FLEX=30,MAX_FLEX=120,PEAK_RATIO=.8,CHRONIC_RATIO=.8;
export const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const directionNames={N:'北方',E:'東方',S:'南方',W:'西方'};
export const reasonNames={PEAK_NEAR_START:'高峰撞上上班時間',PEAK_ELSEWHERE:'高峰不在上班時段',NO_CONGESTION:'未達壅塞門檻',CHRONIC_ONLY:'只有全早壅塞路段',NO_DATA:'缺少可判讀資料',NO_ROADS:'範圍內無觀測路段'};
// Public landmarks with approximate coordinates; no real enterprise is preset.
export const places=[
 {id:'park',name:'內湖科學園區（瑞光路中段）',lat:25.0760,lon:121.5770},
 {id:'gangqian',name:'港墘站周邊',lat:25.0801,lon:121.5750},
 {id:'xihu',name:'西湖站周邊',lat:25.0821,lon:121.5673},
 {id:'jiannan',name:'劍南路站周邊',lat:25.0849,lon:121.5555},
 {id:'wende',name:'文德站周邊',lat:25.0784,lon:121.5849},
 {id:'neihu',name:'內湖站周邊',lat:25.0836,lon:121.5943},
 {id:'dahu',name:'大湖公園站周邊',lat:25.0838,lon:121.6022},
 {id:'huzhou',name:'葫洲站周邊',lat:25.0727,lon:121.6073},
 {id:'donghu',name:'東湖站周邊',lat:25.0672,lon:121.6115},
 {id:'south',name:'舊宗路／民權東路口（園區南側）',lat:25.0668,lon:121.5753}
];
export const startTimes=Array.from({length:11},(_,i)=>clock(SLOT_START+i*15));
export function parseTime(time){
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time||''))throw Error('請輸入有效時間');
 const [h,m]=time.split(':').map(Number);return h*60+m;
}
const overlap=(a,b,c,d)=>Math.max(0,Math.min(b,d)-Math.max(a,c));
const ceil15=m=>Math.ceil(m/15)*15;
const slotStart=i=>SLOT_START+i*15;
// W(D): contiguous slots with n(t) ≥ 0.8·n*, holding a slot where n(t)=n*. Prefer the block that overlaps
// the core [T−15, T+15) most, then the one nearest T.
export function maxSetWindow(counts,T){
 const max=Math.max(0,...counts);if(!max)return null;
 const blocks=[];let current=null;
 counts.forEach((n,i)=>{if(n>=max*PEAK_RATIO){if(current)current.to=i;else blocks.push(current={from:i,to:i});}else current=null;});
 const core=[T-CORE,T+CORE],ranked=blocks.filter(b=>counts.slice(b.from,b.to+1).includes(max)).map(b=>{
  const start=slotStart(b.from),end=slotStart(b.to+1);
  return {...b,start,end,max,label:`${clock(start)}–${clock(end)}`,coreOverlap:overlap(start,end,...core),gap:T>=start&&T<end?0:Math.min(Math.abs(start-T),Math.abs(end-T))};
 });
 return ranked.sort((a,b)=>b.coreOverlap-a.coreOverlap||a.gap-b.gap||a.from-b.from)[0];
}
// F(D)=min(120, max(30, ⌈max(T−a, b−T)+15⌉₁₅)) when W(D) overlaps the core; otherwise the 30-minute base.
// The +15 buffer leaves at least 15 minutes of peak-free arrival on both the early and the late side.
export function recommendFlex(T,peak){
 if(!peak)return {flex:BASE_FLEX,reason:'NO_CONGESTION',need:null,capped:false};
 if(!overlap(peak.start,peak.end,T-CORE,T+CORE))return {flex:BASE_FLEX,reason:'PEAK_ELSEWHERE',need:null,capped:false};
 const need=Math.max(T-peak.start,peak.end-T)+CORE;
 return {flex:Math.min(MAX_FLEX,Math.max(BASE_FLEX,ceil15(need))),reason:'PEAK_NEAR_START',need,capped:need>MAX_FLEX};
}
export function flexPlan(summary,company,bbox,{theta=.5,radius=2000}={}){
 const T=parseTime(company.time);
 if(T<SLOT_START||T>DATA_END)throw Error('歷史資料涵蓋 07:00–09:30，請選此範圍內的上班時間');
 if(!(theta>0&&theta<=1))throw Error('壅塞門檻須介於 0 與 100% 之間');
 if(!Number.isFinite(radius)||radius<=0||radius>10000)throw Error('範圍須大於 0 且不超過 10 公里');
 if(!insideBounds(company,bbox))throw Error('請選擇目前內湖底圖範圍內的公司位置');
 const sectors=Object.fromEntries(Object.entries(directionNames).map(([key,name])=>[key,{key,name,roads:[]}]));
 let excluded=0,outside=0;const seen=new Set();
 for(const d of summary.rows){
  if(seen.has(d.id))continue;seen.add(d.id);
  if(!insideBounds(d.position,bbox)){excluded++;continue;}
  const location=relativePosition(company,d.position);
  if(location.distance>radius){outside++;continue;}
  // A detector within 1 m has no meaningful side of the company.
  if(location.sector==='C'){excluded++;continue;}
  const slots=Array.from({length:SLOT_COUNT},(_,i)=>{const p=periodEvidence(d,summary.dates,i,summary.requested);return {index:i,start:slotStart(i),share:p.share,congested:p.congested,classified:p.classified,hot:p.share!==null&&p.share>=theta};});
  sectors[location.sector].roads.push({id:d.id,vdId:d.vdId,roadName:d.roadName,bearing:d.bearing,position:d.position,distance:location.distance,azimuth:location.azimuth,slots});
 }
 for(const s of Object.values(sectors)){
  s.roads.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
  s.readable=Array.from({length:SLOT_COUNT},(_,i)=>s.roads.filter(r=>r.slots[i].share!==null).length);
  // Roads congested in ≥80% of readable slots cannot be avoided by shifting arrival; they are listed, not counted.
  for(const r of s.roads){const readable=r.slots.filter(p=>p.share!==null).length;r.hotSlots=r.slots.filter(p=>p.hot).length;r.chronic=readable>=5&&r.hotSlots/readable>=CHRONIC_RATIO;}
  s.chronic=s.roads.filter(r=>r.chronic);
  s.counts=Array.from({length:SLOT_COUNT},(_,i)=>s.roads.filter(r=>!r.chronic&&r.slots[i].hot).length);
  s.peak=maxSetWindow(s.counts,T);
  s.peakRoads=s.peak?s.roads.filter(r=>!r.chronic&&r.slots.slice(s.peak.from,s.peak.to+1).some(p=>p.hot)):[];
  Object.assign(s,recommendFlex(T,s.peak));
  if(!s.roads.length)s.reason='NO_ROADS';else if(!s.readable.some(Boolean))s.reason='NO_DATA';else if(!s.peak&&s.chronic.length)s.reason='CHRONIC_ONLY';
  const early=[T-s.flex,T-CORE],late=[T+CORE,T+s.flex];
  s.window={start:T-s.flex,end:T+s.flex,label:`${clock(T-s.flex)}–${clock(T+s.flex)}`};
  s.reward={early,late,label:`${clock(early[0])}–${clock(early[1])}、${clock(late[0])}–${clock(late[1])}`};
  // Peak-free arrival: the reward sides minus the max-set window.
  s.clear=[s.peak?[early[0],Math.min(early[1],s.peak.start)]:early,s.peak?[Math.max(late[0],s.peak.end),late[1]]:late].filter(([a,b])=>b>a);
  s.rewardInPeak=s.peak?overlap(...early,s.peak.start,s.peak.end)+overlap(...late,s.peak.start,s.peak.end):0;
  s.lateBeyondData=T+s.flex>DATA_END;s.peakMayContinue=s.peak?.end===DATA_END;
 }
 const list=Object.values(sectors);
 return {source:'HISTORICAL',company:{...company},time:T,core:{start:T-CORE,end:T+CORE,label:`${clock(T-CORE)}–${clock(T+CORE)}`},theta,radius,sectors,rows:list.reduce((n,s)=>n+s.roads.length,0),excluded,outside,dates:summary.dates.length,requested:summary.requested.length,firstDate:summary.requested[0]||null,lastDate:summary.requested.at(-1)||null,policyEffect:null};
}
// Reward: T−F ≤ x < T−15 or T+15 < x ≤ T+F earns one point; the ±15-minute core earns none.
export function rewardCheck(time,flex,arrival){
 const T=parseTime(time),x=parseTime(arrival);
 if(x<T-flex||x>T+flex)return {points:0,zone:'outside',message:`超出彈性工時 ${clock(T-flex)}–${clock(T+flex)}，不列入獎勵`};
 if(x<T-CORE)return {points:1,zone:'early',message:`提早錯峰到班（早於 ${clock(T-CORE)}），可得 1 點`};
 if(x>T+CORE)return {points:1,zone:'late',message:`延後錯峰到班（晚於 ${clock(T+CORE)}），可得 1 點`};
 return {points:0,zone:'core',message:`${clock(T-CORE)}–${clock(T+CORE)} 是尖峰核心時段，這段到班不給點`};
}

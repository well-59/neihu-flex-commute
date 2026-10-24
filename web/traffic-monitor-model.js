// Display states are shared by the map, legend, road list and detail card.
export const TRAFFIC_STATES=Object.freeze([
 {level:'free',label:'通暢',color:'#438d76'},
 {level:'slowing',label:'車速下降',color:'#c2a647'},
 {level:'congested',label:'壅塞',color:'#d67c3e'},
 {level:'severe',label:'嚴重壅塞',color:'#bb4e4b'},
 {level:'unknown',label:'無有效路況',color:'#9fa8a5'}
].map(Object.freeze));
const trafficState=level=>TRAFFIC_STATES.find(s=>s.level===level);
const validSpeed=speed=>Number.isFinite(speed)&&speed>0&&speed<=200;
const validVolumes=v=>v&&['M','S','L','T'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0);
// Saved TDX RoadClass6_default metadata: LowValue <= speed < TopValue.
// Only use it when this exact direction explicitly names the group. A current
// one-minute VD calculation remains a trial, not a published official grade.
const knownGroup='RoadClass6_default';
export function trafficClassification({speed,state,direction,section,sectionValid=false}={}){
 if(state!=='fresh'||!validSpeed(speed))return {...trafficState('unknown'),kind:'unknown',grade:null,basis:'無有效速度、觀測過期或資料未通過檢查；灰色不代表順暢'};
 const group=direction?.geometry?.congestionLevelId,published=Number(section?.congestionLevel);
 let grade=null,kind='local',basis='本地速度色帶（非官方等級）：<15 嚴重壅塞、15–<25 壅塞、25–<40 車速下降、≥40 通暢 km/h';
 if(sectionValid&&group===knownGroup&&section?.congestionLevelId===group&&Number.isInteger(published)&&published>=1&&published<=6){
  grade=published;kind='published';basis='官方發布等級 · 市區一般道路；依相同路段與道路方向對照';
 }else if(group===knownGroup){
  grade=speed>=40?1:speed>=35?2:speed>=30?3:speed>=25?4:speed>=20?5:6;
  kind='derived';basis='依既有路段門檻試算 · '+['A ≥40','B 35–<40','C 30–<35','D 25–<30','E 20–<25','F <20'][grade-1]+' km/h；單次速度，非官方發布等級';
 }
 const level=grade?grade<=2?'free':grade<=4?'slowing':grade===5?'congested':'severe':speed>=40?'free':speed>=25?'slowing':speed>=15?'congested':'severe';
 return {...trafficState(level),kind,grade:grade?'ABCDEF'[grade-1]:null,basis};
}
// Monitoring uses exact IDs; no nearby road or guessed motorcycle share fallback.
export function freshness(timestamp,now=Date.now(),limit=180){
 const ms=Date.parse(timestamp),age=(now-ms)/1000;
 return !Number.isFinite(ms)?'missing':age < -90?'future':age>limit?'stale':'fresh';
}
export function monitoringRows(snapshot,directions,now=Date.now()){
 const unique=(rows,key)=>{const map=new Map();for(const r of rows||[]){const id=r[key];map.set(id,map.has(id)?null:r);}return map;};
 const vds=unique(snapshot?.rows,'id'),sections=unique(snapshot?.sections,'sectionId');
 const sourceOK=name=>!snapshot?.sources?.[name]||snapshot.sources[name].status==='PARSED';
 return directions.map(d=>{
  const vd=vds.get(d.id),section=sections.get(d.geometry?.sectionId);
  const vdState=freshness(vd?.dataCollectTime,now),sectionState=freshness(section?.dataCollectTime,now);
  const sameVD=vd?.linkId===d.linkId&&vd?.bearing===d.bearing&&vd?.roadName===d.roadName;
  const sameSection=section?.bearing===(vd?.roadDirection||d.roadDirection||d.bearing)&&section?.roadName===d.roadName;
  const flowValid=!!(sameVD&&vd.basicValid&&validVolumes(vd.volumes)&&vdState==='fresh'&&sourceOK('VD')&&sourceOK('VDLive'));
  const sectionValid=!!(sameSection&&section.basicValid&&validSpeed(section.speed)&&sectionState==='fresh'&&sourceOK('Section')&&sourceOK('LiveTraffic'));
  const hasFlow=flowValid&&['M','S','L','T'].reduce((sum,key)=>sum+vd.volumes[key],0)>0;
  const speed=sectionValid?section.speed:hasFlow&&validSpeed(vd.speed)?vd.speed:null;
  const state=flowValid||sectionValid?'fresh':vdState==='stale'||sectionState==='stale'?'stale':vdState==='future'||sectionState==='future'?'future':vd||section?'invalid':'missing';
  const trafficStatus=trafficClassification({speed,state,direction:d,section,sectionValid});
  return {id:d.id,direction:d,vd,section,state,vdState,sectionState,flowValid,sectionValid,
   volumes:flowValid?vd.volumes:null,speed,speedSource:sectionValid?'官方路段旅行速度':speed!=null?'VD 車道加權速度':null,
   speedTime:sectionValid?section.dataCollectTime:flowValid?vd.dataCollectTime:null,
   travelTime:sectionValid&&Number.isFinite(section.travelTime)&&section.travelTime>0?section.travelTime:null,
   trafficStatus,color:trafficStatus.color};
 });
}
export function monitoredPaths(bindings,rows){
 const observations=new Map(rows.map(r=>[r.id,r])),result=[];
 for(const path of bindings){let current=null;
  for(const segment of path.segments){const reading=(segment.routes||[segment.route]).map(id=>observations.get(id)).filter(r=>r?.flowValid&&Number.isFinite(r.speed)&&r.speed>0).sort((a,b)=>(Date.parse(b.vd?.dataCollectTime)||0)-(Date.parse(a.vd?.dataCollectTime)||0))[0];
   if(!reading?.flowValid||reading.speed==null){current=null;continue;}
   if(!current||current.observationId!==reading.id){current={...path,points:[segment.a,segment.b],route:path.id+':'+result.length,observationId:reading.id,monitoring:reading,context:false,share:null,closed:false};result.push(current);}
   else current.points.push(segment.b);
  }
 }
 return result;
}
export function observedVehicleLayout(length,reading,{motorcycles=true}={}){
 if(!reading?.flowValid||!reading.volumes||!Number.isFinite(reading.speed)||reading.speed<=0||!Number.isFinite(length)||length<=0)return [];
 const v=reading.volumes;
 if(!['M','S','L','T'].every(k=>Number.isInteger(v[k])&&v[k]>=0))return [];
 const groups=[['car',v.S+v.L+v.T],...(motorcycles?[['moto',v.M]]:[])];
 // Each nonzero mode gets a low/medium/high display density, not a vehicle count estimate.
 // Road model: .005 world units/metre. Same 4x time scale for all measured speeds.
 const speed=reading.speed/3.6*.005*4;
 const records=[];
 for(const [kind,volume] of groups){if(!volume)continue;const density=volume<=10?1:volume<=30?2:3;
  const count=Math.min(60,Math.max(1,Math.ceil(length*density/2)));
  for(let i=0;i<count;i++)records.push({kind,phase:(i+.5)/count,speed});
 }
 return records.map((record,i)=>({...record,phase:(i+.5)/records.length}));
}
// A month of weekday mornings (07:00–09:30) from the saved multi-day VD snapshot.
// Each slot counts E/F minutes over classified minutes, as in the replay view.
// The snapshot keeps per-slot jam minutes but only a whole-morning speed, so no
// per-slot average speed is derived; jamBelow is the road group's E-level top speed.
export const HOT_SLOT_SHARE=.1,HOT_SLOT_MINUTES=45;
export function congestionHistory(direction,dates,levels=[]){
 const days=(direction?.days||[]).filter(d=>dates.includes(d.date));
 const periods=Array.from({length:10},(_,index)=>{
  let classified=0,congested=0,observedDays=0,jamDays=0;
  for(const day of days){const [c=0,j=0]=day.congestionProfile?.bins?.[index]||[];classified+=c;congested+=j;if(c)observedDays++;if(j)jamDays++;}
  return {index,start:420+index*15,classified,congested,observedDays,jamDays,share:classified?congested/classified:null};
 });
 const hot=periods.filter(p=>p.share!==null&&p.share>=HOT_SLOT_SHARE&&p.classified>=HOT_SLOT_MINUTES).sort((a,b)=>b.share-a.share||b.jamDays-a.jamDays).slice(0,3);
 const speedMinutes=days.reduce((s,d)=>s+(d.speedMinutes||0),0),speedSum=days.reduce((s,d)=>s+(d.speedSum||0),0);
 const group=levels.find(g=>g.CongestionLevelID===direction?.geometry?.congestionLevelId),eLevel=group?.Levels?.find(l=>l.Level===5);
 return {days:days.length,dates:dates.length,periods,hot,averageSpeed:speedMinutes?speedSum/speedMinutes:null,speedMinutes,jamBelow:eLevel?.TopValue??null};
}

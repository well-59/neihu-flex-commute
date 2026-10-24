// Monitoring uses exact IDs; no nearby road or guessed motorcycle share fallback.
export function freshness(timestamp,now=Date.now(),limit=180){
 const ms=Date.parse(timestamp),age=(now-ms)/1000;
 return !Number.isFinite(ms)?'missing':age < -90?'future':age>limit?'stale':'fresh';
}
export function monitoringRows(snapshot,directions,now=Date.now()){
 const unique=(rows,key)=>{const map=new Map();for(const r of rows||[]){const id=r[key];map.set(id,map.has(id)?null:r);}return map;};
 const vds=unique(snapshot?.rows,'id'),sections=unique(snapshot?.sections,'sectionId');
 return directions.map(d=>{
  const vd=vds.get(d.id),section=sections.get(d.geometry?.sectionId);
  const vdState=freshness(vd?.dataCollectTime,now),sectionState=freshness(section?.dataCollectTime,now);
  const sameVD=vd?.linkId===d.linkId&&vd?.bearing===d.bearing&&vd?.roadName===d.roadName;
  const sameSection=section?.bearing===(vd?.roadDirection||d.bearing)&&section?.roadName===d.roadName;
  const flowValid=!!(sameVD&&vd.basicValid&&vdState==='fresh');
  const sectionValid=!!(sameSection&&section.basicValid&&sectionState==='fresh');
  const speed=sectionValid?section.speed:flowValid?vd.speed:null;
  const state=flowValid||sectionValid?'fresh':vdState==='stale'||sectionState==='stale'?'stale':vdState==='future'||sectionState==='future'?'future':vd||section?'invalid':'missing';
  return {id:d.id,direction:d,vd,section,state,vdState,sectionState,flowValid,sectionValid,
   volumes:flowValid?vd.volumes:null,speed,speedSource:sectionValid?'官方路段旅行速度':speed!=null?'VD 車道加權速度':null,
   speedTime:sectionValid?section.dataCollectTime:flowValid?vd.dataCollectTime:null,
   travelTime:sectionValid?section.travelTime:null,
   // Fixed display bands, not official LOS or road-specific performance thresholds.
   color:speed==null?'#9fa8a5':speed<=15?'#c65f50':speed<=30?'#ddab64':'#548f78'};
 });
}
export function monitoredPaths(bindings,rows){
 const observations=new Map(rows.map(r=>[r.id,r])),result=[];
 for(const path of bindings){let current=null;
  for(const segment of path.segments){const reading=observations.get(segment.route);
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

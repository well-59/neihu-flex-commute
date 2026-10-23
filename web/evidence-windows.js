/* Descriptive comparisons of retained observations, never a traffic forecast. */
(function(root){
  'use strict';
  const minute=t=>{
    if(typeof t!=='string'||!/^\d{2}:\d{2}$/.test(t))throw Error('Invalid observation time');
    const [h,m]=t.split(':').map(Number);
    if(h>23||m>59||m%15)throw Error('Expected a fifteen-minute boundary');
    return h*60+m;
  };
  const clock=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function compare(data,gate,{start='07:30',shift=60,date=data.meta.days[0]}={}){
    const from=minute(start),duration=60;
    if(!Number.isInteger(shift)||shift<15||shift>120||shift%15||from<420||from+duration+shift>630)throw Error('Comparison must fit within 07:00–10:30');
    const records=data.measured?.[date]?.[gate];
    if(!records||data.meta.slotMinutes!==15)throw Error('Unknown observation or interval');
    const times=data.slots.map(minute);
    if(times.some((t,i)=>i&&t<=times[i-1]))throw Error('Observation times must be unique and ordered');
    const windows=[from,from+shift].map(begin=>{
      const labels=Array.from({length:4},(_,i)=>clock(begin+i*15));
      const metrics={};
      for(const key of ['flow','moto','speed']){
        const values=labels.map(t=>{const i=data.slots.indexOf(t),v=i<0?null:records[key]?.[i];return Number.isFinite(v)&&v>=0?v:null;});
        const valid=values.filter(v=>v!==null).length;
        metrics[key]={value:valid===4?values.reduce((a,b)=>a+b,0)/(key==='speed'?4:1):null,valid,expected:4,values};
      }
      return {start:clock(begin),end:clock(begin+duration),labels,metrics};
    });
    const [earlier,later]=windows,metrics={};
    for(const key of ['flow','moto','speed']){
      const a=earlier.metrics[key],b=later.metrics[key],delta=a.value!==null&&b.value!==null?b.value-a.value:null;
      metrics[key]={earlier:a.value,later:b.value,delta,percent:delta!==null&&a.value!==0?delta/a.value*100:null,available:[a.valid,b.valid],expected:4};
    }
    return {date,gate,start,shift,duration,earlier,later,metrics,overlapMinutes:Math.max(0,duration-shift),
      status:'DESCRIPTIVE_SINGLE_DAY_UNVERIFIED_RAW',rawCoverageVerified:false,motorcycleShare:null,
      spareCapacity:null,travelTimeBenefit:null,policyEffect:null};
  }
  const corridors=[
    {gate:'G1',name:'民權大橋走廊',road:'民權東路六段',direction:'東向',coverage:'周邊道路觀測，非橋上實測',coverageStatus:'ROAD_POINT'},
    {gate:'G6',name:'成美橋走廊',road:'新明路代理點',direction:'東北向',coverage:'代理代表性待確認，非橋上實測',coverageStatus:'PROXY_UNVERIFIED'},
    {gate:'G2',name:'堤頂大道走廊',road:'堤頂大道',direction:'北向',coverage:'單一點位，非全路段覆蓋',coverageStatus:'ROAD_POINT'}
  ];
  function scan(data,gate,{start='07:30',date=data.meta.days[0]}={}){
    const from=minute(start);
    if(from<420||from>555)throw Error('Source window must leave room for a later window');
    return [15,30,45,60,90,120].filter(shift=>from+60+shift<=630).map(shift=>{
      const c=compare(data,gate,{start,shift,date});
      const paired={higher:0,lower:0,equal:0,valid:0,expected:4};
      c.earlier.metrics.speed.values.forEach((a,i)=>{
        const b=c.later.metrics.speed.values[i];
        if(a===null||b===null)return;
        paired.valid++;paired[b>a?'higher':b<a?'lower':'equal']++;
      });
      return {...c,pairedSpeeds:paired};
    });
  }
  function corridorSummary(data,options={}){
    const rows=corridors.map(c=>({...c,comparison:compare(data,c.gate,options)}));
    const counts={higher:0,lower:0,equal:0,missing:0};
    rows.forEach(r=>{const delta=r.comparison.metrics.speed.delta;counts[delta===null?'missing':delta>0?'higher':delta<0?'lower':'equal']++;});
    return {rows,counts,policyEffect:null,scope:'三個點位在同日同時窗的車道均速差異；非三條走廊的政策成效'};
  }
  function surveyPeaks(data,date='2025-09-11'){
    const times=Array.from({length:8},(_,i)=>clock(420+i*15));
    const stations=data.stations.filter(s=>s.date===date);
    if(new Set(stations.map(s=>s.id)).size!==stations.length)throw Error('Duplicate survey station');
    const rows=stations.map(s=>{
      const series=s.series.filter(r=>r.time>='07:00'&&r.time<'09:00');
      const complete=series.length===8&&series.every((r,i)=>r.time===times[i]&&['small','large','moto','total'].every(k=>Number.isInteger(r[k])&&r[k]>=0)&&r.total===r.small+r.large+r.moto);
      const maximum=complete?Math.max(...series.map(r=>r.total)):null;
      return {id:s.id,name:s.name,date:s.date,source:s.source,status:complete?'COMPLETE_SURVEY_WINDOW':'INCOMPLETE_SURVEY_WINDOW',maximum,
        peakTimes:complete?series.filter(r=>r.total===maximum).map(r=>({start:r.time,end:clock(minute(r.time)+15)})):[]};
    });
    return {date,window:'07:00–09:00',rows,trafficEffect:null,scope:'同日路口各進口方向三類機動車通過次數；不與2026 VD接成路徑'};
  }
  const api={compare,scan,corridorSummary,surveyPeaks};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NeihuEvidenceWindows=api;
})(typeof window!=='undefined'?window:globalThis);

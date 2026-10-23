import {buildObservedRankings,buildCongestionRankings,representativeDirections} from './vendor/route-clarity/ranking.js';

export function validateSnapshot(data) {
 if(!data?.directions?.length || !data.coverage?.availableDates?.length)throw Error('缺少多日快照');
 const ids=new Set();
 for(const d of data.directions){
  if(ids.has(d.id))throw Error('重複方向');ids.add(d.id);
  const dates=new Set();
  for(const day of d.days){
   if(dates.has(day.date))throw Error('重複日期');dates.add(day.date);
   if(!Number.isInteger(day.validMinutes)||day.validMinutes<0||day.validMinutes>150)throw Error('有效分鐘異常');
   if(!Number.isInteger(day.receivedMinutes)||day.receivedMinutes<day.validMinutes||day.receivedMinutes>150)throw Error('收到分鐘異常');
   if(day.validMinutes>0&&(!Number.isSafeInteger(day.volume)||day.volume<0))throw Error('車次異常');
   if(!Number.isInteger(day.speedMinutes)||day.speedMinutes<0||day.speedMinutes>day.validMinutes)throw Error('車速分鐘異常');
   const bins=day.congestionProfile?.bins;
   if(!bins||bins.length!==10||bins.some(b=>b.length!==2||b.some(n=>!Number.isInteger(n)||n<0)||b[0]>15||b[1]>b[0]))throw Error('十五分鐘格異常');
   const all=bins.reduce((s,b)=>s+b[0],0),jam=bins.reduce((s,b)=>s+b[1],0);
   if(all!==day.speedMinutes||all!==Object.values(day.levelMinutes).reduce((s,n)=>s+n,0)||jam!==(day.levelMinutes[5]??0)+(day.levelMinutes[6]??0))throw Error('分時與每日分母不一致');
   const c=day.officialComparison;
   if(c&&(![c.minutes,c.exact,c.withinOne].every(n=>Number.isInteger(n)&&n>=0)||c.exact>c.withinOne||c.withinOne>c.minutes||c.minutes>day.speedMinutes))throw Error('官方配對分鐘異常');
  }
 }
 return data;
}

export function summarize(data,{skipHolidays=true,date=null,metric='flow',scope='park'}={}) {
 if(!['park','all','entering','internal','leaving','outside','expressway'].includes(scope))throw Error('未知路段範圍');
 if(!['flow','congestion'].includes(metric))throw Error('未知排序指標');
 const holidays=new Set(data.holidays.dates.map(d=>d.date));
 const chosen=data.coverage.requestedDates.filter(d=>!date||d===date);
 const requested=chosen.filter(d=>!skipHolidays||!holidays.has(d));
 const dates=data.coverage.availableDates.filter(d=>requested.includes(d));
 const candidates=data.directions.filter(d=>scope==='all'||(scope==='park'?d.scope.included:d.scope.category===scope));
 const representatives=representativeDirections(candidates,{includeExcluded:true});
 const flow=buildObservedRankings(representatives,dates,{limit:Infinity,includeExcluded:true});
 const congestion=buildCongestionRankings(representatives,dates,{limit:Infinity,includeExcluded:true});
 const heat=representatives.map(direction=>{
  const periods=Array.from({length:10},(_,i)=>{const p=periodEvidence(direction,dates,i);return {start:420+i*15,...p};});
  const classified=periods.reduce((s,p)=>s+p.classified,0),jam=periods.reduce((s,p)=>s+p.congested,0);
  return {direction,periods,classified,share:classified?jam/classified:null};
 });
 const periods=Array.from({length:10},(_,i)=>{
  const classified=heat.reduce((s,r)=>s+r.periods[i].classified,0),congested=heat.reduce((s,r)=>s+r.periods[i].congested,0);
  return {index:i,classified,congested,share:classified?congested/classified:null};
 });
 const records=representatives.flatMap(d=>d.days.filter(day=>dates.includes(day.date)));
 const total=key=>records.reduce((s,d)=>s+(d[key]??0),0);
 const official=records.reduce((s,d)=>{for(const key of ['minutes','exact','withinOne'])s[key]+=d.officialComparison?.[key]??0;return s;},{minutes:0,exact:0,withinOne:0});
 official.share=official.minutes?official.exact/official.minutes:null;
 const classified=periods.reduce((s,p)=>s+p.classified,0),congested=periods.reduce((s,p)=>s+p.congested,0);
 const peakShare=periods.some(p=>p.share!==null)?Math.max(...periods.map(p=>p.share??-1)):null;
 const expected=representatives.length*requested.length*150,availableExpected=representatives.length*dates.length*150;
 const ranked=metric==='flow'?flow:congestion;
 // Keep uncovered representatives visible; never remove them from the completeness denominator.
 const rows=[...ranked,...representatives.filter(d=>!ranked.some(r=>r.id===d.id))];
 return {dates,requested,missing:requested.filter(d=>!dates.includes(d)),excludedHolidayCount:chosen.length-requested.length,metric,scope,skipHolidays,
  candidatesCount:candidates.length,representativeCount:representatives.length,representatives,
  flow,congestion,heat,periods,ranked,rows,official,
  totals:{received:total('receivedMinutes'),valid:total('validMinutes'),speed:total('speedMinutes'),expected,availableExpected,classified,congested,
   share:classified?congested/classified:null,completeness:expected?total('validMinutes')/expected:null},
  peakPeriods:peakShare===null?[]:periods.filter(p=>p.share===peakShare),policyEffect:null};
}

export function qualityRows(direction,requestedDates) {
 return requestedDates.map(date=>{
  const d=direction.days.find(d=>d.date===date);
  return {date,received:d?.receivedMinutes??null,valid:d?.validMinutes??null,speed:d?.speedMinutes??null,
   volume:d?.volume??null,reasons:d?.reasonCounts??null,official:d?.officialComparison??null,
   unclassified:d?d.validMinutes-d.speedMinutes:null};
 });
}

export function periodEvidence(direction,dates,index,requestedDates=dates) {
 if(!Number.isInteger(index)||index<0||index>9)throw Error('時段超出觀測範圍');
 const days=requestedDates.map(date=>{
  const b=direction.days.find(d=>d.date===date)?.congestionProfile?.bins[index];
  const classified=b?.[0]??0,congested=b?.[1]??0;
  return {date,classified,congested,share:classified?congested/classified:null};
 });
 const observed=days.filter(d=>d.classified>0),classified=days.reduce((s,d)=>s+d.classified,0),congested=days.reduce((s,d)=>s+d.congested,0);
 return {days,observedDays:observed.length,highDays:observed.filter(d=>d.share>=.5).length,classified,congested,expected:requestedDates.length*15,availableExpected:dates.length*15,share:classified?congested/classified:null,endOfObservation:index===9,policyEffect:null};
}

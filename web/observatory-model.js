/* Scenario arithmetic is separate from observations and company commitments. */
(function(root) {
  'use strict';
  const queue = typeof module !== 'undefined' && module.exports ? require('./negotiation-model.js').queue : root.Negotiation.queue;
  const sum = xs => xs.reduce((a,b)=>a+b,0);
  const time = minutes => `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
  const inDisplayWindow=t=>t>='07:00'&&t<'10:30';
  function scenario(data,{gateId,pct,shift,tail='continue'}) {
    const day=data.meta.days[0],gate=data.gates.find(g=>g.id===gateId);
    if(!gate||!Number.isFinite(pct)||pct<0||pct>30||![15,30,45,60,90,120].includes(shift)||!['continue','zero'].includes(tail))throw Error('無效的情境條件');
    const arrivals=data.days[day][gateId];
    if(arrivals.length!==15||arrivals.some(x=>!Number.isFinite(x)||x<0))throw Error('需求資料不完整');
    const before=arrivals.concat(Array(4).fill(tail==='continue'?arrivals.at(-1):0)),after=before.slice();
    let moved=0;
    data.slots.forEach((t,i)=>{if(t>='07:30'&&t<'08:30'){const n=arrivals[i]*pct/100;after[i]-=n;after[i+shift/15]+=n;moved+=n;}});
    if(after.some(x=>x < -1e-8)||Math.abs(sum(before)-sum(after))>1e-6)throw Error('車次守恆失敗');
    const baseline=queue(before,gate.capacity),result=queue(after,gate.capacity);
    const percent=baseline.wait>0?(baseline.wait-result.wait)/baseline.wait*100:null;
    const later=after.map((v,i)=>i>=7?v-before[i]:0);
    const maxIncrease=Math.max(...later),increaseIndex=later.indexOf(maxIncrease);
    const sensitivity=[.95,1,1.05].map(f=>{
      const b=f===1?baseline:queue(before,gate.capacity*f),a=f===1?result:queue(after,gate.capacity*f);
      return {factor:f,capacity:gate.capacity*f,beforeWait:b.wait,afterWait:a.wait,deltaWait:a.wait-b.wait,percent:b.wait>0?(b.wait-a.wait)/b.wait*100:null};
    });
    const lateRows=data.slots.map((t,i)=>{
      const observed=data.measured[day]?.[gateId]?.flow?.[i];
      return {time:t,observed:Number.isFinite(observed)?observed:null,before:before[i],after:after[i],delta:after[i]-before[i],queueBefore:baseline.rows[i].queue,queueAfter:result.rows[i].queue};
    }).filter(r=>r.time>='09:30'&&inDisplayWindow(r.time));
    const lateWindow={rows:lateRows,before:sum(lateRows.map(r=>r.before)),after:sum(lateRows.map(r=>r.after)),added:sum(lateRows.map(r=>r.delta)),queueBefore:lateRows.at(-1).queueBefore,queueAfter:lateRows.at(-1).queueAfter};
    const deltaWait=result.wait-baseline.wait;
    const capacityReversal=deltaWait < -1e-8&&sensitivity.some(s=>s.deltaWait>1e-8);
    const lateQueueIncreased=lateWindow.queueAfter>lateWindow.queueBefore+1e-8;
    // Descriptive screening only; these labels do not authorize a real-world pilot.
    const assessment=pct===0?'unchanged':deltaWait>1e-8?'worse':deltaWait>=-1e-8?'no-gain':capacityReversal||lateQueueIncreased?'tradeoff':'candidate';
    return {gate,day,before,after,moved,baseline,result,percent,shift,pct,tail,maxIncrease,increaseTime:time(405+increaseIndex*15),sensitivity,lateWindow,deltaWait,capacityReversal,lateQueueIncreased,assessment};
  }
  function observations(data,gateId,metric) {
    if(!['flow','moto','speed'].includes(metric))throw Error('未知觀測指標');
    const row=data.measured[data.meta.days[0]]?.[gateId]?.[metric];
    return data.slots.map((t,i)=>({time:t,value:Number.isFinite(row?.[i])?row[i]:null})).filter(r=>inDisplayWindow(r.time));
  }
  function fingerprint(data,options) {
    const result=scenario(data,options);
    // Every row uses model demand, so observed flow is never mixed with inferred arrivals.
    const rows=data.gates.map(g=>({gateId:g.id,cells:data.slots.map((t,i)=>{
      const before=data.days[result.day][g.id][i],after=g.id===result.gate.id?result.after[i]:before;
      return {time:t,before,after,delta:after-before};
    }).filter(r=>inDisplayWindow(r.time))}));
    // Keep a fixed scale across shares, delays and selected gates (up to a 30% inflow).
    const max=Math.max(1,...rows.flatMap(r=>r.cells.map(c=>c.before)))*1.3;
    return {rows,max};
  }
  function allocationComparison(data,options) {
    const r=scenario(data,options),sources=[3,4,5,6];
    const batches=sources.map(i=>({index:i,time:data.slots[i],base:r.before[i],moved:r.before[i]*r.pct/100}));
    const sourceTotal=sum(batches.map(b=>b.base));
    // Exhaustive, bounded comparison: each source cohort moves intact, in 15-minute steps.
    // This minimizes waiting at the central capacity only, not employee burden or real-world cost.
    let best=null,searched=0;
    function visit(delays) {
      if(delays.length<4){
        for(let delay=15;delay<=r.shift;delay+=15)visit([...delays,delay]);
        return;
      }
      const after=r.before.slice();
      batches.forEach((b,i)=>{after[b.index]-=b.moved;after[b.index+delays[i]/15]+=b.moved;});
      const result=queue(after,r.gate.capacity),burden=sum(batches.map((b,i)=>b.moved*delays[i]));
      searched++;
      if(!best||result.wait<best.result.wait-1e-8||(Math.abs(result.wait-best.result.wait)<1e-8&&burden<best.burden))best={after,result,delays,burden};
    }
    if(r.moved===0){best={after:r.before.slice(),result:r.baseline,delays:[0,0,0,0],burden:0};searched=1;}
    else visit([]);
    const row=(id,after,result,delays)=>({id,after,result,moved:id==='baseline'?0:r.moved,delays,
      averageDelay:r.moved?sum(batches.map((b,i)=>b.moved*delays[i]))/r.moved:0,
      maxDelay:r.moved?Math.max(...delays):0,
      queue1030:result.rows[14].queue,deltaWait:result.wait-r.baseline.wait,
      sensitivity:r.sensitivity.map(s=>{const afterWait=s.factor===1?result.wait:queue(after,s.capacity).wait;return {factor:s.factor,beforeWait:s.beforeWait,afterWait,deltaWait:afterWait-s.beforeWait};})});
    const plans=[row('baseline',r.before,r.baseline,[0,0,0,0]),row('uniform',r.after,r.result,Array(4).fill(r.moved?r.shift:0)),row('batched',best.after,best.result,best.delays)];
    const periods=[['06:45–07:30',0,3],['07:30–08:30',3,7],['08:30–09:30',7,11],['09:30–10:30',11,15],['10:30 後至清空',15,Infinity]].map(([label,start,end])=>({label,waits:plans.map(p=>sum(p.result.rows.slice(start,end).map(row=>row.mean*15)))}));
    return {sourceTotal,batches:batches.map((b,i)=>({...b,weight:sourceTotal?b.base/sourceTotal:0,delay:best.delays[i],destination:time(405+b.index*15+best.delays[i])})),plans,periods,searched};
  }
  const api={scenario,observations,fingerprint,time,allocationComparison};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Observatory=api;
})(typeof window!=='undefined'?window:globalThis);

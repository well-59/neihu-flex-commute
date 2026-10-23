/* Constraint planning over declared synthetic cohorts; no road-speed or delay prediction. */
(function(root){
  'use strict';
  const modes=['car','moto'],sum=a=>a.reduce((s,n)=>s+n,0);
  const time=i=>{const n=420+i*15;return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
  function demo(){return {
    source:'SYNTHETIC',slots:Array.from({length:14},(_,i)=>time(i)),
    background:{car:[160,220,420,480,600,520,410,330,260,230,210,190,170,150],moto:[130,180,320,390,450,400,310,260,210,170,150,130,110,100]},
    groups:[{id:'A',label:'甲組',slot:2,car:100,moto:90,maxDelay:30,active:true},{id:'B',label:'乙組',slot:3,car:130,moto:100,maxDelay:45,active:true},{id:'C',label:'丙組',slot:4,car:160,moto:130,maxDelay:60,active:true},{id:'D',label:'丁組',slot:5,car:140,moto:110,maxDelay:30,active:true}],
    limits:{car:30,moto:30},uniformDelay:30
  };}
  function validate(c){
    if(c?.source!=='SYNTHETIC'||c.slots?.length!==14||c.groups?.length!==4)throw Error('此沙盒只接受四組、十四格的明示示範資料。');
    if(c.slots.some((t,i)=>t!==time(i)))throw Error('示範時段須為 07:00 起連續十四格、每格十五分鐘。');
    if(![15,30,45,60].includes(c.uniformDelay))throw Error('統一延後須為 15、30、45 或 60 分鐘。');
    for(const mode of modes){
      if(!Number.isFinite(c.limits?.[mode])||c.limits[mode]<0||c.limits[mode]>100)throw Error('各車種上限須介於 0–100%；未知不可當成可參與。');
      if(c.background?.[mode]?.length!==14||c.background[mode].some(x=>!Number.isInteger(x)||x<0))throw Error('示範需求必須為非負整數。');
    }
    if(new Set(c.groups.map(g=>g.id)).size!==4)throw Error('群組識別碼不得重複。');
    for(const g of c.groups){
      if(typeof g.active!=='boolean'||!Number.isInteger(g.slot)||g.slot<0||g.slot>9||![0,15,30,45,60].includes(g.maxDelay))throw Error('群組時段或限制無效。');
      for(const mode of modes)if(!Number.isInteger(g[mode])||g[mode]<0)throw Error('群組車次須為非負整數。');
    }
    for(const mode of modes)for(let i=0;i<14;i++)if(sum(c.groups.filter(g=>g.slot===i).map(g=>g[mode]))>c.background[mode][i])throw Error('群組車次超過示範基準需求。');
  }
  const cap=(c,g,mode)=>g.active&&g.maxDelay>0?Math.floor(g[mode]*c.limits[mode]/100):0;
  const metrics=a=>({total:sum(a),peak:Math.max(...a),peakShare:sum(a)?Math.max(...a)/sum(a)*100:0});
  function apply(c,choices){
    validate(c);
    if(choices?.length!==4)throw Error('需提供四組配置。');
    const after={car:c.background.car.slice(),moto:c.background.moto.slice()},reasons=[],groups=[];
    let burden=0,moved=0,maxDelay=0;
    c.groups.forEach((g,i)=>{
      const ch=choices[i];if(!ch||![0,.5,1].includes(ch.fraction)||![0,15,30,45,60].includes(ch.delay))throw Error('配置選項無效。');
      const counts=Object.fromEntries(modes.map(mode=>[mode,Math.floor(cap(c,g,mode)*ch.fraction)]));
      const n=counts.car+counts.moto,delay=n?ch.delay:0;
      if(n&&(!delay||delay>g.maxDelay))reasons.push(`${g.label}最多延後 ${g.maxDelay} 分鐘，不能套用 ${delay} 分鐘。`);
      modes.forEach(mode=>{after[mode][g.slot]-=counts[mode];after[mode][g.slot+delay/15]+=counts[mode];});
      moved+=n;burden+=n*delay;maxDelay=Math.max(maxDelay,delay);
      groups.push({id:g.id,label:g.label,from:time(g.slot),to:time(g.slot+delay/15),delay,counts,stayed:{car:g.car-counts.car,moto:g.moto-counts.moto},ceiling:{car:cap(c,g,'car'),moto:cap(c,g,'moto')}});
    });
    for(const mode of modes)if(after[mode].some(x=>x<0)||sum(after[mode])!==sum(c.background[mode]))throw Error('車種守恆失敗。');
    return {feasible:reasons.length===0,reasons,after,groups,moved,burden,averageDelay:moved?burden/moved:0,maxDelay,
      movedByMode:Object.fromEntries(modes.map(mode=>[mode,sum(groups.map(g=>g.counts[mode]))])),
      metrics:Object.fromEntries(modes.map(mode=>[mode,metrics(after[mode])]))};
  }
  function solve(c){
    validate(c);
    const baseline=apply(c,c.groups.map(()=>({fraction:0,delay:0})));
    const uniform=apply(c,c.groups.map(()=>({fraction:1,delay:c.uniformDelay})));
    const choices=c.groups.map(g=>{
      const out=[{fraction:0,delay:0}];
      if(cap(c,g,'car')+cap(c,g,'moto'))for(const fraction of [.5,1])for(let delay=15;delay<=g.maxDelay;delay+=15)out.push({fraction,delay});
      return out;
    });
    // Compare each mode against its own baseline peak; never convert motorcycles to car equivalents.
    // Minimax, then the other mode, then fewer shifted trips, then smaller schedule changes.
    const score=p=>{const r=modes.map(mode=>baseline.metrics[mode].peak?p.metrics[mode].peak/baseline.metrics[mode].peak:1).sort((a,b)=>b-a);return [...r,p.moved,p.burden];};
    const better=(a,b)=>{const aa=score(a),bb=score(b);for(let i=0;i<aa.length;i++){if(aa[i]<bb[i]-1e-9)return true;if(aa[i]>bb[i]+1e-9)return false;}return false;};
    let best=baseline,searched=0;
    function visit(xs){
      if(xs.length<4){for(const ch of choices[xs.length])visit([...xs,ch]);return;}
      const p=apply(c,xs);searched++;
      if(p.feasible&&modes.every(mode=>p.metrics[mode].peak<=baseline.metrics[mode].peak)&&better(p,best))best=p;
    }
    visit([]);
    return {baseline,uniform,best,searched,ceilings:Object.fromEntries(modes.map(mode=>[mode,sum(c.groups.map(g=>cap(c,g,mode)))])),
      source:'SYNTHETIC',travelTimeBenefit:null,speedAfter:null,businessBenefit:null};
  }
  function observed(d,gateId,slot){
    const m=d.measured[d.meta.days[0]]?.[gateId];if(!m||!Number.isInteger(slot)||slot<1||slot>14)throw Error('觀測點或時段無效。');
    const value=k=>Number.isFinite(m[k]?.[slot])?m[k][slot]:null;
    return {car:value('flow'),moto:value('moto'),speed:value('speed'),motoShare:null,ratioStatus:'INCOMPARABLE_COVERAGE'};
  }
  function history(station){
    const rows=station.series.filter(r=>r.time>='07:00'&&r.time<'09:00');
    if(rows.length!==8||rows.some((r,i)=>r.time!==time(i)||['small','large','moto','total'].some(k=>!Number.isInteger(r[k])||r[k]<0)||r.small+r.large+r.moto!==r.total))throw Error('歷史比例需要八格完整且同口徑的車種資料。');
    const totals=Object.fromEntries(['small','large','moto','total'].map(k=>[k,sum(rows.map(r=>r[k]))]));
    return {...totals,motoShare:totals.total?totals.moto/totals.total*100:null};
  }
  const api={demo,validate,apply,solve,observed,history,time};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NeihuPlanning=api;
})(typeof window!=='undefined'?window:globalThis);

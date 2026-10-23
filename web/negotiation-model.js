/* Deterministic single-gate negotiation. No model-generated traffic numbers. */
(function(root) {
  'use strict';
  const DT=15, sum=a=>a.reduce((s,v)=>s+v,0);
  function queue(arrivals,capacity,initial=0) {
    if(!Array.isArray(arrivals)||!arrivals.length||arrivals.some(v=>!Number.isFinite(v)||v<0)||!Number.isFinite(capacity)||capacity<=0||!Number.isFinite(initial)||initial<0) throw Error('需求與容量必須有效且非負。');
    let q=initial,wait=0,maximum=q; const rows=[];
    for(let i=0;i<arrivals.length||q>1e-8;i++) {
      if(i>2000) throw Error('排隊未能清空。');
      const a=arrivals[i]||0, end=Math.max(0,q+a-capacity);
      const busy=end===0&&a<capacity?DT*q/(capacity-a):DT;
      const area=(q+end)*busy/2;
      wait+=area;maximum=Math.max(maximum,end);rows.push({arrival:a,queue:end,mean:area/DT});q=end;
    }
    return {wait,maximum,rows};
  }
  function companies(data,gateId) {
    return data.archetypes.slice(0,2).map((a,i)=>({...a,id:i?'B':'A',name:i?'乙公司':'甲公司',profile:a.name,vehicles:a.staff*a.driveShare*(a.gateShare[gateId]||0),dist:a.arrivalDist.slice()}));
  }
  function prepare(data,config) {
    const day=data.meta.days?.[0]||Object.keys(data.days)[0];
    const gate=data.gates.find(g=>g.id===config.gateId);
    if(!gate) throw Error('找不到通勤口。');
    const original=data.days[day][gate.id].slice(), groups=companies(data,gate.id);
    if(original.some(v=>!Number.isFinite(v)||v<0)) throw Error('基準需求不完整。');
    if(!Number.isFinite(config.target)||config.target<0||config.target>100) throw Error('目標須介於 0–100%。');
    if(!['continue','zero'].includes(config.tail)) throw Error('請確認後段背景假設。');
    for(const g of groups) {
      if(!Number.isFinite(g.staff)||g.staff<0||!Number.isFinite(g.driveShare)||g.driveShare<0||g.driveShare>1||!Number.isFinite(g.vehicles)||g.vehicles<0||g.vehicles>g.staff||g.dist.some(v=>!Number.isFinite(v)||v<0)) throw Error('企業樣板數值無效。');
      if(g.dist.length!==original.length||Math.abs(sum(g.dist)-1)>1e-8) throw Error('企業到達分布不完整。');
      const c=config.constraints[g.id];
      if(!c||typeof c.active!=='boolean'||!Number.isFinite(c.maxPct)||c.maxPct<0||c.maxPct>100||![0,15,30,45,60].includes(c.maxShift)) throw Error('請補齊企業可移動比例與時間。');
    }
    for(let i=0;i<original.length;i++) if(sum(groups.map(g=>g.vehicles*g.dist[i]))>original[i]+1e-8) throw Error('企業樣板的車次超過基準需求，不能用這組資料試算。');
    const tail=config.tail==='continue'?original.at(-1):0;
    return {day,gate,groups,original,base:original.concat(Array(4).fill(tail)),tail};
  }
  function apply(context,choices) {
    const after=context.base.slice();let people=0,vehicles=0,maxShift=0;
    context.groups.forEach(g=>{
      const c=choices[g.id];
      if(!c||!Number.isFinite(c.pct)||c.pct<0||c.pct>100||![0,15,30,45,60].includes(c.shift)) throw Error('無效的移轉配置。');
      if(c.pct>0&&c.shift===0) throw Error('移轉時間不可為零。');
      const n=g.vehicles*c.pct/100;
      people+=g.staff*c.pct/100;vehicles+=n;if(n>0)maxShift=Math.max(maxShift,c.shift);
      g.dist.forEach((p,k)=>{after[k]-=n*p;after[k+c.shift/DT]+=n*p;});
    });
    if(after.some(v=>v < -1e-8)||Math.abs(sum(after)-sum(context.base))>1e-6) throw Error('移轉未通過非負與總量守恆檢查。');
    return {after:after.map(v=>Math.max(0,v)),people,vehicles,maxShift};
  }
  function evaluate(context,choices) {
    const moved=apply(context,choices), before=queue(context.base,context.gate.capacity),after=queue(moved.after,context.gate.capacity);
    const cut=before.wait>0?(before.wait-after.wait)/before.wait*100:0;
    return {...moved,choices,before,result:after,cut};
  }
  function options(c) {
    const out=[{pct:0,shift:0}];
    if(c.active)for(let pct=5;pct<=c.maxPct;pct+=5)for(let shift=15;shift<=c.maxShift;shift+=15)out.push({pct,shift});
    return out;
  }
  function solve(data,config) {
    const context=prepare(data,config), all=[];
    const aa=options(config.constraints.A),bb=options(config.constraints.B);
    for(const a of aa)for(const b of bb)all.push(evaluate(context,{A:a,B:b}));
    const valid=all.filter(r=>r.cut+1e-8>=config.target);
    const best=all.reduce((a,b)=>b.result.wait<a.result.wait?b:a);
    const pick=(key,compare)=>{const r=valid.slice().sort(compare)[0];return r?{...r,key}:null;};
    const burden=r=>Math.max(...Object.values(r.choices).map(c=>c.pct*c.shift));
    const plans=[pick('few',(a,b)=>a.people-b.people||a.maxShift-b.maxShift||a.result.wait-b.result.wait),pick('wait',(a,b)=>a.result.wait-b.result.wait||a.people-b.people),pick('balance',(a,b)=>burden(a)-burden(b)||a.people-b.people||a.result.wait-b.result.wait)].filter(Boolean);
    return {context,plans,best,searched:all.length,feasible:valid.length,target:config.target};
  }
  function sensitivity(context,plan) {
    return [.95,1,1.05].map(f=>{
      const b=queue(context.base,context.gate.capacity*f),a=queue(plan.after,context.gate.capacity*f);
      return {factor:f,cut:b.wait>0?(b.wait-a.wait)/b.wait*100:null,baselineWait:b.wait};
    });
  }
  // Deliberately narrow offline grammar: unsupported clauses must be clarified.
  function parseOffline(text) {
    const rows=text.trim().split(/[；;\n]+/).map(s=>s.trim().replace(/[。.]$/,'')).filter(Boolean);
    const companies=[],missing=[];
    for(const row of rows) {
      const m=row.match(/^([甲乙])公司最多\s*(\d+)%\s*(?:員工)?可晚\s*(15|30|45|60)\s*分鐘$/);
      if(!m) {missing.push('未辨識條件：'+row);continue;}
      companies.push({id:m[1]==='甲'?'A':'B',maxPct:Number(m[2]),maxShift:Number(m[3]),quote:row});
    }
    for(const id of ['A','B'])if(companies.filter(c=>c.id===id).length!==1)missing.push((id==='A'?'甲':'乙')+'公司須有且只有一組明確條件');
    if(companies.some(c=>c.maxPct>100))missing.push('比例不可超過 100%');
    return {companies,missing,mode:'offline'};
  }
  function validateProposal(p,text) {
    if(!p||!Array.isArray(p.companies)||!Array.isArray(p.missing)||p.missing.some(s=>typeof s!=='string'))throw Error('條件回應格式不正確。');
    const seen=new Set();
    for(const c of p.companies) {
      if(!['A','B'].includes(c.id)||seen.has(c.id)||!Number.isFinite(c.maxPct)||c.maxPct<0||c.maxPct>100||![0,15,30,45,60].includes(c.maxShift)||typeof c.quote!=='string'||!c.quote||!text.includes(c.quote))throw Error('條件缺少有效範圍或原句依據，請重述。');
      seen.add(c.id);
    }
    if(seen.size!==2&&!p.missing.length)throw Error('兩家公司條件未完整。');
    return p;
  }
  const api={queue,companies,prepare,apply,evaluate,solve,sensitivity,parseOffline,validateProposal};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Negotiation=api;
})(typeof window!=='undefined'?window:globalThis);

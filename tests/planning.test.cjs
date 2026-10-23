const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../web/planning-model'),sum=a=>a.reduce((s,n)=>s+n,0);
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../web/data/neihu-data.js'),'utf8'),ctx);const D=ctx.window.NEIHU_DATA;
test('synthetic default selects a bounded subset rather than forcing the ceiling',()=>{
 const c=M.demo(),source=JSON.stringify(c),r=M.solve(c);
 assert.equal(r.source,'SYNTHETIC');assert.equal(r.searched,1575);
 assert.deepEqual(r.ceilings,{car:159,moto:129});assert.deepEqual(r.best.movedByMode,{car:48,moto:39});
 assert.equal(r.best.metrics.car.peak,552);assert.equal(r.best.metrics.moto.peak,411);
 assert.equal(r.best.groups[2].from,'08:00');assert.equal(r.best.groups[2].to,'08:30');
 assert.equal(r.best.averageDelay,30);assert.equal(r.best.maxDelay,30);
 assert.equal(r.travelTimeBenefit,null);assert.equal(r.speedAfter,null);assert.equal(r.businessBenefit,null);
 assert.equal(JSON.stringify(c),source);
});
test('hand-computable two-mode peak redistribution and no-gain zero choice',()=>{
 const c=M.demo();c.background={car:Array(14).fill(10),moto:Array(14).fill(10)};
 c.background.car[2]=50;c.background.moto[2]=50;c.limits={car:100,moto:100};
 c.groups.forEach((g,i)=>{g.car=i?0:20;g.moto=i?0:20;g.maxDelay=15;});
 const r=M.solve(c);assert.equal(r.best.metrics.car.peak,30);assert.equal(r.best.metrics.moto.peak,30);
 assert.equal(r.best.moved,40);assert.equal(r.best.burden,600);assert.equal(r.best.averageDelay,15);
 c.background={car:Array(14).fill(20),moto:Array(14).fill(20)};
 assert.equal(M.solve(c).best.moved,0); // Shifting a flat profile creates a peak.
});
test('separate mode ceilings, group withdrawal and time restrictions survive the full plan',()=>{
 for(const car of [0,35,100])for(const moto of [0,25,100])for(const delay of [0,15,60]){
  const c=M.demo();c.limits={car,moto};c.groups[0].active=false;c.groups[2].maxDelay=delay;c.uniformDelay=60;
  const r=M.solve(c);
  for(const p of [r.baseline,r.best])for(const mode of ['car','moto']){
   assert.equal(sum(p.after[mode]),sum(c.background[mode]));assert.ok(p.after[mode].every(x=>Number.isInteger(x)&&x>=0));
   assert.ok(p.movedByMode[mode]<=r.ceilings[mode]);
   p.groups.forEach((g,i)=>{assert.ok(g.counts[mode]<=g.ceiling[mode]);assert.equal(g.counts[mode]+g.stayed[mode],c.groups[i][mode]);assert.ok(g.delay<=c.groups[i].maxDelay);});
   assert.equal(p.groups[0].counts[mode],0);
   if(c.limits[mode]===0)assert.deepEqual(p.after[mode],c.background[mode]);
  }
  assert.equal(r.best.feasible,true);assert.ok(r.best.metrics.car.peak<=r.baseline.metrics.car.peak);assert.ok(r.best.metrics.moto.peak<=r.baseline.metrics.moto.peak);
  if(car||moto){assert.equal(r.uniform.feasible,false);assert.ok(r.uniform.reasons.some(s=>s.includes('乙組')||s.includes('丁組')));}
  else{assert.equal(r.best.moved,0);assert.deepEqual(r.best.after,r.baseline.after);}
 }
});
test('unknown constraints, invalid counts, duplicated cohorts and overbooked demand are rejected',()=>{
 const changes=[c=>c.limits.car=null,c=>c.limits.moto=101,c=>c.groups[0].active='yes',c=>c.groups[0].maxDelay=20,c=>c.groups[0].car=-1,c=>c.groups[0].car=999,c=>c.groups[1].id='A',c=>c.background.car[0]=null,c=>c.source='OBSERVED',c=>c.uniformDelay=120];
 for(const change of changes){const c=M.demo();change(c);assert.throws(()=>M.solve(c));}
 const reordered=M.demo();reordered.slots[0]='07:15';assert.throws(()=>M.solve(reordered));
 assert.throws(()=>M.apply(M.demo(),[]));
});
test('VD observations stay independent, and incomparable coverage never produces a mode share',()=>{
 const before=JSON.stringify(D),first=M.observed(D,'G1',5);assert.equal(first.car,417);assert.equal(first.moto,188);assert.equal(first.speed,24);assert.equal(first.motoShare,null);
 const c=M.demo();c.limits={car:100,moto:0};M.solve(c);assert.deepEqual(M.observed(D,'G1',5),first);
 const d=JSON.parse(before);d.measured[d.meta.days[0]].G1.speed[14]=null;d.measured[d.meta.days[0]].G1.moto[14]=0;
 const last=M.observed(d,'G1',14);assert.equal(last.speed,null);assert.equal(last.moto,0);assert.equal(JSON.stringify(D),before);
 assert.throws(()=>M.observed(D,'bad',1));assert.throws(()=>M.observed(D,'G1',15));
});
test('historical composition uses only complete same-scope morning counts and preserves missingness',()=>{
 const d=JSON.parse(fs.readFileSync(require.resolve('../web/evidence/data/observations.json'),'utf8'));
 const r=M.history(d.stations.find(s=>s.id==='NI001'));assert.equal(r.moto,5203);assert.equal(r.total,9195);assert.equal(r.motoShare,5203/9195*100);
 const s=structuredClone(d.stations[0]);s.series[0].moto=null;assert.throws(()=>M.history(s));
 const repeated=structuredClone(d.stations[0]);repeated.series[1].time='07:00';assert.throws(()=>M.history(repeated));
 const z=structuredClone(d.stations[0]);z.series.slice(0,8).forEach(r=>{r.small=r.large=r.moto=r.total=0;});assert.equal(M.history(z).motoShare,null);
});

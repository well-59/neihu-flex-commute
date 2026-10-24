const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const M=require('../web/observatory-model.js'),ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/data/neihu-data.js'),'utf8'),ctx);const D=JSON.parse(JSON.stringify(ctx.window.NEIHU_DATA));
const sum=a=>a.reduce((s,v)=>s+v,0);
test('allocation comparison preserves cohorts, exposes burden, and keeps unfavorable results',()=>{
 const original=JSON.stringify(D);
 for(const g of D.gates)for(const pct of [0,15,30])for(const shift of [15,30,120])for(const tail of ['zero','continue']){
  const a=M.allocationComparison(D,{gateId:g.id,pct,shift,tail}),[b,u,s]=a.plans;
  assert.equal(a.searched,pct?(shift/15)**4:1);
  assert.equal(s.moved,u.moved);assert.equal(b.moved,0);
  assert.ok(s.result.wait<=u.result.wait+1e-8);
  assert.ok(s.maxDelay<=shift);assert.ok(s.averageDelay<=s.maxDelay+1e-8);
  assert.ok(Math.abs(sum(a.batches.map(x=>x.moved))-u.moved)<1e-8);
  for(const [i,p] of a.plans.entries()){
   assert.ok(Math.abs(sum(p.after)-sum(b.after))<1e-8);assert.ok(p.after.every(x=>x>=0));
   assert.ok(Math.abs(sum(a.periods.map(x=>x.waits[i]))-p.result.wait)<1e-7);
   assert.equal(p.sensitivity[1].afterWait,p.result.wait);
   assert.equal(p.queue1030,p.result.rows[14].queue);
  }
  const expected=b.after.slice();a.batches.forEach(x=>{expected[x.index]-=x.moved;expected[x.index+x.delay/15]+=x.moved;});
  assert.deepEqual(expected,s.after);
  if(!pct)assert.deepEqual(s.after,b.after);
 }
 const g1=M.allocationComparison(D,{gateId:'G1',pct:15,shift:30});
 assert.equal(g1.sourceTotal,1675);assert.equal(g1.plans[2].moved,251.25);
 assert.equal((g1.plans[2].result.wait/60).toFixed(2),'80.60');
 assert.ok(g1.plans[2].deltaWait>0); // A smaller loss is still a loss versus no action.
 const g3=M.allocationComparison(D,{gateId:'G3',pct:15,shift:30});
 assert.equal((g3.plans[2].result.wait/60).toFixed(2),'13.24');
 assert.ok(g3.plans[2].deltaWait<0);
 assert.equal(JSON.stringify(D),original);
});
test('bounded allocation search matches an independent sixteen-plan enumeration',()=>{
 const queue=require('../web/negotiation-model.js').queue;
 for(const g of D.gates){
  const r=M.scenario(D,{gateId:g.id,pct:15,shift:30}),candidates=[];
  for(let mask=0;mask<16;mask++){
   const after=r.before.slice();let burden=0;
   for(let j=0;j<4;j++){const i=j+3,n=r.before[i]*.15,delay=(mask&(1<<j))?2:1;after[i]-=n;after[i+delay]+=n;burden+=n*delay*15;}
   candidates.push({wait:queue(after,g.capacity).wait,burden});
  }
  candidates.sort((a,b)=>Math.abs(a.wait-b.wait)<1e-8?a.burden-b.burden:a.wait-b.wait);
  const best=M.allocationComparison(D,{gateId:g.id,pct:15,shift:30}).plans[2];
  assert.ok(Math.abs(best.result.wait-candidates[0].wait)<1e-8);
  assert.ok(Math.abs(best.averageDelay*best.moved-candidates[0].burden)<1e-8);
 }
});
test('all six gates, shifts and tail assumptions conserve cars without changing observations',()=>{
 const source=JSON.stringify(D);
 for(const g of D.gates)for(const pct of [0,5,15,30])for(const shift of [15,30,45,60,90,120])for(const tail of ['zero','continue']){
  const r=M.scenario(D,{gateId:g.id,pct,shift,tail});
  assert.ok(Math.abs(sum(r.before)-sum(r.after))<1e-8);assert.ok(r.after.every(v=>v>=0));
  assert.ok(Math.abs(r.moved-sum(D.days[r.day][g.id].slice(3,7))*pct/100)<1e-8);
  assert.ok(Math.abs(r.after[3]-r.before[3]*(1-pct/100))<1e-9);
  assert.equal(r.after[0],r.before[0]);assert.equal(r.after[18],r.before[18]);
  assert.ok(Math.abs(r.after[14]-r.before[14]-(shift===120?D.days[r.day][g.id][6]*pct/100:0))<1e-8);
  if(pct===0){assert.deepEqual(r.after,r.before);assert.equal(r.result.wait,r.baseline.wait);}
 }
 assert.equal(JSON.stringify(D),source);
});
test('known shift moves demand to the destination without claiming guaranteed improvement',()=>{
 const d=JSON.parse(JSON.stringify(D));d.gates[0].capacity=100;d.days[d.meta.days[0]].G1=Array(15).fill(100);
 const r=M.scenario(d,{gateId:'G1',pct:30,shift:60,tail:'zero'});
 assert.deepEqual(r.after.slice(3,7),[70,70,70,70]);assert.deepEqual(r.after.slice(7,11),[130,130,130,130]);
 assert.equal(r.moved,120);assert.equal(r.percent,null);assert.ok(r.result.wait>r.baseline.wait);assert.equal(r.maxIncrease,30);
});
test('07:00–10:30 uses fourteen slots, retains all late observations and missing values',()=>{
 const rows=M.observations(D,'G1','moto');assert.equal(rows.length,14);assert.equal(rows[0].time,'07:00');assert.equal(rows.at(-1).time,'10:15');assert.equal(rows[0].value,118);assert.equal(rows.at(-1).value,159);
 assert.deepEqual(M.observations(D,'G1','flow').slice(10).map(r=>r.value),[381,370,266,321]);
 assert.equal(M.observations(D,'G1','speed').at(-1).value,31);
 const d=JSON.parse(JSON.stringify(D));d.measured[d.meta.days[0]].G1.flow[1]=null;
 d.measured[d.meta.days[0]].G1.flow[14]=null;
 assert.equal(M.observations(d,'G1','flow').at(-1).value,null);
 assert.equal(M.observations(d,'G1','flow')[0].value,null);assert.throws(()=>M.observations(D,'G1','wait'));
});
test('reject unknown gates, unsupported shifts and invalid shares',()=>{
 for(const args of [{gateId:'G99'},{pct:NaN},{pct:-1},{pct:31},{shift:20},{shift:135},{tail:'invented'}])assert.throws(()=>M.scenario(D,{gateId:'G1',pct:15,shift:30,...args}));
});
test('fingerprint shifts only the selected demand row and never mixes in measured flow',()=>{
 const original=JSON.stringify(D),day=D.meta.days[0];let scale;
 for(const gate of D.gates)for(const pct of [0,5,15,30])for(const shift of [15,30,45,60,90,120]){
  const f=M.fingerprint(D,{gateId:gate.id,pct,shift});
  assert.equal(f.rows.length,6);if(scale===undefined)scale=f.max;else assert.equal(f.max,scale);
  for(const row of f.rows){
   assert.equal(row.cells.length,14);assert.equal(row.cells[0].time,'07:00');assert.equal(row.cells.at(-1).time,'10:15');
   assert.ok(Math.abs(sum(row.cells.map(c=>c.delta)))<1e-8);
   row.cells.forEach((c,i)=>{
    assert.equal(c.before,D.days[day][row.gateId][i+1]);
    assert.ok(c.after>=0&&c.after<=f.max);
    if(row.gateId!==gate.id||pct===0)assert.equal(c.after,c.before);
   });
  }
 }
 const f=M.fingerprint(D,{gateId:'G1',pct:30,shift:30}),g1=f.rows[0].cells;
 assert.ok(Math.abs(g1[2].after-296.8)<1e-8);assert.ok(Math.abs(g1[6].after-545.1)<1e-8);
 assert.equal(g1[2].before,424);assert.equal(D.measured[day].G1.flow[3],306);
 assert.notEqual(g1[2].before,D.measured[day].G1.flow[3]);
 assert.equal(JSON.stringify(D),original);
});
test('late disclosure includes partial and full arrivals plus queues persisting after the shift',()=>{
 const d=JSON.parse(JSON.stringify(D)),day=d.meta.days[0];d.gates[0].capacity=100;d.days[day].G1=Array(15).fill(100);
 const original=JSON.stringify(d);
 for(const [shift,added,values] of [[60,0,[100,100,100,100]],[90,60,[130,130,100,100]],[120,120,[130,130,130,130]]]){
  const r=M.scenario(d,{gateId:'G1',pct:30,shift,tail:'zero'}),late=r.lateWindow;
  assert.equal(late.before,400);assert.equal(late.after,400+added);assert.equal(late.added,added);
  assert.deepEqual(late.rows.map(row=>row.after),values);
  assert.deepEqual(late.rows.map(row=>row.observed),[381,370,266,321]);
  assert.deepEqual(late.rows.map(row=>row.time),['09:30','09:45','10:00','10:15']);
  assert.equal(late.queueBefore,0);assert.equal(late.queueAfter,120);
  assert.equal(r.moved,120);assert.equal(sum(r.before),sum(r.after));
 }
 const zero=M.scenario(d,{gateId:'G1',pct:0,shift:120}).lateWindow;
 assert.equal(zero.added,0);assert.equal(zero.queueAfter,zero.queueBefore);
 assert.equal(JSON.stringify(d),original);
 d.measured[day].G1.flow[14]=null;
 assert.equal(M.scenario(d,{gateId:'G1',pct:30,shift:120}).lateWindow.rows.at(-1).observed,null);
});
test('G2 sensitivity retains the worsening central case between improving capacity endpoints',()=>{
 const r=M.scenario(D,{gateId:'G2',pct:5,shift:15});
 assert.deepEqual(r.sensitivity.map(s=>s.factor),[.95,1,1.05]);
 const [low,central,high]=r.sensitivity;
 assert.ok(Math.abs(low.percent-2.2068370925)<1e-6);
 assert.ok(Math.abs(central.percent+49.9936241346)<1e-6);
 assert.ok(Math.abs(high.percent-91.3809221191)<1e-6);
 assert.equal(central.beforeWait,r.baseline.wait);assert.equal(central.afterWait,r.result.wait);
 assert.equal(central.deltaWait,r.deltaWait);assert.equal(central.percent,r.percent);
 assert.equal(r.assessment,'worse');
 for(const s of r.sensitivity){assert.equal(s.capacity,r.gate.capacity*s.factor);assert.equal(s.deltaWait,s.afterWait-s.beforeWait);}
});
test('screening keeps worsening, zero denominators, tradeoffs, neutral and candidate results distinct',()=>{
 const r=M.scenario(D,{gateId:'G3',pct:15,shift:30});
 assert.ok(r.deltaWait<0);assert.equal(r.sensitivity[2].beforeWait,0);
 assert.ok(r.sensitivity[2].afterWait>0);assert.equal(r.sensitivity[2].percent,null);
 assert.equal(r.capacityReversal,true);assert.equal(r.assessment,'tradeoff');
 const d=JSON.parse(JSON.stringify(D)),day=d.meta.days[0];d.gates[0].capacity=100;d.days[day].G1=Array(15).fill(100);
 const worse=M.scenario(d,{gateId:'G1',pct:30,shift:60,tail:'zero'});
 assert.equal(worse.percent,null);assert.equal(worse.assessment,'worse');
 assert.equal(M.scenario(d,{gateId:'G1',pct:0,shift:60}).assessment,'unchanged');
 d.days[day].G1=Array(15).fill(10);
 assert.equal(M.scenario(d,{gateId:'G1',pct:30,shift:60}).assessment,'no-gain');
 d.days[day].G1=[0,0,0,150,150,150,150,0,0,0,0,0,0,0,0];
 const better=M.scenario(d,{gateId:'G1',pct:30,shift:60,tail:'zero'});
 assert.ok(better.deltaWait<0);assert.equal(better.assessment,'candidate');
 assert.ok(better.sensitivity.every(s=>s.deltaWait<=0));assert.equal(better.lateQueueIncreased,false);
});

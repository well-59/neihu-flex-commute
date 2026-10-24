const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const M=require('../web/negotiation-model.js');
const box={window:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../web/data/neihu-data.js'),'utf8'),box);const D=JSON.parse(JSON.stringify(box.window.NEIHU_DATA));
const config=()=>({gateId:'G1',target:20,tail:'continue',constraints:{A:{active:true,maxPct:10,maxShift:30},B:{active:true,maxPct:20,maxShift:45}}});
const total=a=>a.reduce((x,y)=>x+y,0);
test('queue uses full clearing horizon and known triangular waiting integral',()=>{
 const r=M.queue([600,0],300);assert.equal(r.wait,4500);assert.equal(r.maximum,300);assert.equal(r.rows.at(-1).queue,0);
 assert.throws(()=>M.queue([-1],300));assert.throws(()=>M.queue([1],0));
});
test('search results obey confirmed constraints, conserve vehicles and meet target',()=>{
 const c=config(),r=M.solve(D,c);assert.ok(r.plans.length>0);assert.equal(r.searched,65);
 for(const p of r.plans){assert.ok(p.cut>=20);assert.ok(p.after.every(x=>x>=0));assert.ok(Math.abs(total(p.after)-total(r.context.base))<1e-6);for(const id of ['A','B']){assert.ok(p.choices[id].pct<=c.constraints[id].maxPct);assert.ok(p.choices[id].shift<=c.constraints[id].maxShift);}}
});
test('company withdrawal restores its demand and never removes vehicles',()=>{
 const c=config();c.constraints.A.active=false;const r=M.solve(D,c);assert.equal(r.best.choices.A.pct,0);assert.equal(r.searched,13);assert.ok(Math.abs(total(r.best.after)-total(r.context.base))<1e-6);
 c.constraints.B.active=false;const none=M.solve(D,c);assert.equal(none.feasible,0);assert.equal(none.best.cut,0);assert.deepEqual(none.best.after,none.context.base);
});
test('late shifts go to their actual future bins, not the last observed bin',()=>{
 const d=structuredClone(D),n=d.slots.length;d.archetypes[0].arrivalDist=Array(n).fill(0);d.archetypes[0].arrivalDist[n-1]=1;d.archetypes[0].staff=100;
 const context=M.prepare(d,config()),p=M.apply(context,{A:{pct:100,shift:60},B:{pct:0,shift:0}}),m=context.groups[0].vehicles;
 assert.equal(p.after[n+3],context.base[n+3]+m);assert.equal(p.after[n-1],context.base[n-1]-m);assert.equal(p.after.length,n+4);
});
test('reject incompatible demand, missing constraints and incomplete distributions',()=>{
 const d=structuredClone(D);d.archetypes[0].staff=100000;assert.throws(()=>M.solve(d,config()),/超過/);
 const c=config();c.constraints.A.maxPct=NaN;assert.throws(()=>M.solve(D,c),/補齊/);
 const short=structuredClone(D);short.archetypes[0].arrivalDist.pop();assert.throws(()=>M.solve(short,config()),/不完整/);
});
test('parser does not silently discard unsupported business restrictions',()=>{
 const text='甲公司最多10%可晚30分鐘；乙公司最多20%可晚45分鐘';const p=M.parseOffline(text);assert.equal(p.missing.length,0);assert.equal(M.validateProposal(p,text).companies.length,2);
 for(const text of ['甲公司最多10%可晚30分鐘；乙公司最多20%可晚45分鐘；客服不能晚到','甲公司最多10%可晚30分鐘','甲公司最多110%可晚30分鐘；乙公司最多20%可晚45分鐘'])assert.ok(M.parseOffline(text).missing.length>0);
 const bad=structuredClone(p);bad.companies[0].quote='自行編造';assert.throws(()=>M.validateProposal(bad,text),/原句/);
});
test('sensitivity recomputes both baseline and candidate with same capacity assumption',()=>{
 const r=M.solve(D,config()),p=r.plans[0],s=M.sensitivity(r.context,p);assert.equal(s.length,3);assert.ok(Math.abs(s[1].cut-p.cut)<1e-8);
});

test('zero-wait sensitivity does not report an undefined percentage as zero improvement',()=>{
 const r=M.solve(D,config()),p=r.plans[0],s=M.sensitivity(r.context,p);for(const x of s)if(x.baselineWait===0)assert.equal(x.cut,null);
});

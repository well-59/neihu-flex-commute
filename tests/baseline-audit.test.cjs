const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {audit}=require('../web/baseline-audit.js');
const box={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/data/neihu-data.js'),'utf8'),box);
const D=JSON.parse(JSON.stringify(box.window.NEIHU_DATA));
const fixture=(arrivals,wait,capacity=150)=>({meta:{days:['sample'],slotMinutes:15},
 slots:arrivals.map((_,i)=>String(i)),gates:[{id:'G',name:'Synthetic',capacity}],
 days:{sample:{G:arrivals}},measured:{sample:{G:{wait}}}});

test('retained data exposes threshold drift without changing observations or forcing Q',()=>{
 const before=JSON.stringify(D),r=audit(D);
 assert.equal(r.status,'INCONSISTENT');assert.equal(r.summary.rowCount,90);
 assert.equal(r.evidenceStatus,'UNVERIFIED');assert.equal(r.physicalCalibration,'UNVERIFIED');
 const g6=r.gates.find(g=>g.gateId==='G6');
 assert.ok(Math.abs(g6.mae-18.392)<1e-9);
 assert.ok(Math.abs(g6.maxAbsoluteError-25.592)<1e-9);
 const zero=g6.rows.find(row=>row.time==='07:45');
 assert.equal(zero.targetQueue,0);assert.equal(zero.baselineQueue,25);
 assert.equal(zero.exceedsRoundingTolerance,true);
 const later=g6.rows.find(row=>row.time==='09:00');
 assert.equal(later.baselineQueue,59);assert.ok(Math.abs(later.targetQueue-33.408)<1e-9);
 assert.equal(JSON.stringify(D),before);
});
test('an exact synthetic baseline remains unvalidated physically',()=>{
 const r=audit(fixture([160,140],[1,0]));
 assert.equal(r.status,'CONSISTENT_NOT_VALIDATED');
 assert.equal(r.physicalCalibration,'UNVERIFIED');
 assert.equal(r.gates[0].mae,0);assert.equal(r.targetKind,'INFERRED_NOT_OBSERVED');
});
test('rounding-compatible mismatch is not called valid or proven to be rounding',()=>{
 const r=audit(fixture([150,150],[0.04,0.08]));
 assert.equal(r.status,'ROUNDING_COMPATIBLE_NOT_VALIDATED');
 assert.equal(r.gates[0].rows[0].arrivalRoundingBound,0.5);
 assert.equal(r.gates[0].rows[1].arrivalRoundingBound,1);
 assert.equal(r.gates[0].rows[0].targetReportingBound,0.05);
 assert.equal(r.evidenceStatus,'UNVERIFIED');
 const bad=audit(fixture([150],[0.2]));
 assert.equal(bad.status,'INCONSISTENT');
});
test('all reported days are audited and malformed input fails visibly',()=>{
 const d=fixture([160,140],[1,0]);d.meta.days.push('second');
 d.days.second={G:[150,150]};d.measured.second={G:{wait:[2,2]}};
 const r=audit(d);assert.equal(r.gates.length,2);assert.equal(r.summary.inconsistentGateDays,1);
 for(const mutate of [d=>{d.measured.sample.G.wait[0]=null},d=>{d.days.sample.G[0]=-1},
   d=>{d.gates[0].capacity=0},d=>{d.measured.sample.G.wait.pop()},d=>{d.meta.slotMinutes=5}]){
  const invalid=fixture([160,140],[1,0]);mutate(invalid);assert.throws(()=>audit(invalid));
 }
});
test('browser API matches Node audit on production inputs',()=>{
 const context={window:{}};
 for(const file of ['negotiation-model.js','baseline-audit.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web',file),'utf8'),context);
 assert.deepEqual(JSON.parse(JSON.stringify(context.window.BaselineAudit.audit(D))),audit(D));
});

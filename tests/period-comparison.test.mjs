import test from 'node:test';
import assert from 'node:assert/strict';
import {flowEvidence,renderPeriodComparison} from '../web/period-comparison.js';
import {summarize} from '../web/route-evidence-model.js';
import fs from 'node:fs';
import vm from 'node:vm';
const observations=JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json',import.meta.url)));
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../web/data/period-flow.js',import.meta.url),'utf8'),ctx);
const source=ctx.window.NEIHU_PERIOD_FLOW;
test('production data pairs exact direction and dates, does not expand missing days',()=>{
 const s=summarize(observations),d=s.rows.find(r=>r.vdId==='VQBUL20'&&r.bearing==='E');
 const f=flowEvidence(source,d,s.requested,0);
 assert.equal(f.samples.length,1);assert.equal(f.samples[0].date,'2026-10-22');assert.equal(f.expected,285);assert.ok(f.minutes>0&&f.minutes<=15);assert.equal(f.complete,false);
 assert.equal(f.total,Object.values(f.volumes).reduce((a,b)=>a+b));
 // Independently counted in the raw CSV: 60 lane rows, 15 timestamps, M=118/S=134/L=23/T=0.
 assert.equal(f.total,275);assert.equal(f.volumes.M,118);assert.equal(f.volumes.S,134);assert.equal(f.volumes.L,23);
 assert.equal(flowEvidence(source,d,['2026-10-21'],0).total,null);
 assert.equal(flowEvidence(source,{...d,bearing:'W'},['2026-10-22'],0).total,null);
 assert.equal(flowEvidence(source,{...d,roadName:'別路'},['2026-10-22'],0).total,null);
});
test('zero, incomplete samples, and missing are distinct',()=>{
 const d={id:'test',roadName:'road',bearing:'N'};
 const p={days:{day:{test:{...d,periods:[{validMinutes:15,volumes:{M:0,S:0,L:0,T:0}}]}}}};
 const zero=flowEvidence(p,d,['day'],0);assert.equal(zero.total,0);assert.equal(zero.complete,true);
 assert.equal(flowEvidence(p,d,['day','missing'],0).complete,false);
 p.days.day.test.periods[0].validMinutes=0;assert.equal(flowEvidence(p,d,['day'],0).total,null);
 assert.throws(()=>flowEvidence(p,d,['day'],10));
});
test('display uses selected period, partial source labels and full date coverage denominator',()=>{
 const summary=summarize(observations);
 const html=renderPeriodComparison(summary,source,0);
 assert.match(html,/07:00–07:15/);assert.match(html,/2026-10-22/);assert.match(html,/部分樣本/);assert.match(html,/所選日期應有 285 分鐘/);
 const missing=renderPeriodComparison(summarize(observations,{date:'2026-09-24'}),source,0);
 assert.match(missing,/尚無分時車次/);assert.doesNotMatch(missing,/0 車次/);
});

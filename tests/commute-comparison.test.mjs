import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {commuteComparison,renderCommuteComparison} from '../web/commute-comparison.js';
import {summarize} from '../web/route-evidence-model.js';
const direction={id:'r',roadName:'路',bearing:'N',days:[
 {date:'both',congestionProfile:{bins:[[10,8],[15,3]]}},
 {date:'only-a',congestionProfile:{bins:[[15,0],[0,0]]}},
 {date:'only-b',congestionProfile:{bins:[[0,0],[10,10]]}}
]};
const dates=['both','only-a','only-b','missing'];
test('difference pairs dates rather than mixing unequal populations; no causal output',()=>{
 const r=commuteComparison(direction,dates,dates,0,1,null);
 assert.deepEqual(r.commonDates,['both']);assert.equal(r.left.period.classified,25);assert.equal(r.right.period.classified,25);
 assert.equal(r.paired.left.minutes,10);assert.equal(r.paired.right.minutes,15);assert.ok(Math.abs(r.difference+60)<1e-10);
 assert.equal(r.policyEffect,null);assert.equal(r.travelTimeBenefit,null);
});
test('no paired data, unknown roads and unsupported periods never become zero congestion',()=>{
 for(const r of [commuteComparison(direction,dates,dates,0,10,null),commuteComparison(direction,['only-a','only-b'],['only-a','only-b'],0,1,null),commuteComparison(undefined,dates,dates,0,1,null)]){assert.equal(r.difference,null);assert.equal(r.paired,null);}
 assert.equal(commuteComparison(direction,dates,dates,0,13,null).right.period,null);
 assert.throws(()=>commuteComparison(direction,dates,dates,0,14,null));
 assert.equal(commuteComparison(direction,dates,dates,0,0,null).difference,0);
});
test('production comparison uses raw bins, preserves source and discloses incomplete data',()=>{
 const data=JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json',import.meta.url))),before=JSON.stringify(data),s=summarize(data),d=s.rows[0];
 const r=commuteComparison(d,s.dates,s.requested,4,6,null);
 const common=d.days.filter(day=>s.requested.includes(day.date)&&day.congestionProfile.bins[4][0]>0&&day.congestionProfile.bins[6][0]>0);
 const share=i=>common.reduce((n,day)=>n+day.congestionProfile.bins[i][1],0)/common.reduce((n,day)=>n+day.congestionProfile.bins[i][0],0);
 assert.ok(Math.abs(r.difference-(share(6)-share(4))*100)<1e-10);
 const html=renderCommuteComparison(d,s,null,4,10).html;
 assert.match(html,/缺多日資料/);assert.match(html,/不是出發或到班時間/);assert.match(html,/尚無分時車次/);assert.doesNotMatch(html,/0 車次/);assert.equal((html.match(/data-commute-slot=/g)||[]).length,14);assert.equal(JSON.stringify(data),before);
});

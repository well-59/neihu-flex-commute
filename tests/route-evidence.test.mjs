import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateSnapshot,summarize,periodEvidence,qualityRows} from '../web/route-evidence-model.js';
import {renderEvidenceMap,trafficColor,directedGeometry} from '../web/route-evidence-map.js';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),scene=require('../web/road-scene.js');
const data=JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json',import.meta.url)));
test('imported snapshot has consistent daily and bin counts and retains provenance',()=>{
 assert.equal(validateSnapshot(data),data);
 assert.equal(data.provenance.commit,'ed126ccf4fb8e2d79a2cbe1047509b7540167901');
 assert.equal(data.provenance.rawMinutesAvailable,false);
 assert.equal(data.directions.length,84);
});
test('all-date ranking reproduces upstream known counts without expanding missing minutes',()=>{
 const s=summarize(data,{skipHolidays:false});
 assert.equal(s.dates.length,21);assert.equal(s.requested.length,22);assert.equal(s.representativeCount,30);
 assert.deepEqual(s.missing,['2026-09-24']);
 assert.equal(s.flow[0].vdId,'VQBUL20');assert.equal(s.flow[0].bearing,'E');
 assert.equal(s.flow[0].totalObservedVolume,95015);assert.equal(s.flow[0].validMinutes,2142);
 assert.equal(s.flow[0].averageMinuteVolume,95015/2142);
 assert.equal(s.congestion[0].vdId,'VQZTP20');assert.equal(s.congestion[0].congestedShare,2112/2147*100);
 assert.equal(new Set(s.flow.map(d=>d.linkId)).size,s.flow.length);
 assert.equal(s.policyEffect,null);
});
test('holiday, single-date and missing-date selections recompute the evidence and keep input intact',()=>{
 const before=JSON.stringify(data),s=summarize(data);
 assert.equal(s.dates.length,18);assert.equal(s.requested.length,19);
 assert.equal(s.dates.includes('2026-09-25'),false);
 assert.notEqual(s.flow[0].averageMinuteVolume,summarize(data,{skipHolidays:false}).flow[0].averageMinuteVolume);
 assert.equal(summarize(data,{date:'2026-10-22'}).dates.length,1);
 assert.equal(summarize(data,{date:'2026-09-24'}).ranked.length,0);
 assert.equal(summarize(data,{date:'2026-09-25'}).ranked.length,0);
 assert.equal(JSON.stringify(data),before);
});
test('per-day recurrence keeps missing and true zero distinct; right boundary is not clearing time',()=>{
 const d={days:[{date:'a',congestionProfile:{bins:[[10,6]]}},{date:'b',congestionProfile:{bins:[[15,0]]}}]};
 const p=periodEvidence(d,['a','b','c'],0);
 assert.equal(p.highDays,1);assert.equal(p.observedDays,2);assert.equal(p.classified,25);assert.equal(p.expected,45);
 assert.equal(p.share,6/25);assert.equal(p.days[1].share,0);assert.equal(p.days[2].share,null);
 assert.equal(periodEvidence(d,['a'],9).endOfObservation,true);
 assert.throws(()=>periodEvidence(d,['a'],10));assert.equal(p.policyEffect,null);
});
test('malformed snapshots cannot generate persuasive evidence',()=>{
 const d=structuredClone(data);d.directions[0].days[0].congestionProfile.bins[0][1]=16;
 assert.throws(()=>validateSnapshot(d),/十五分鐘/);
 const counts=structuredClone(data);counts.directions[0].days[0].speedMinutes--;
 assert.throws(()=>validateSnapshot(counts),/分母/);
 const duplicate=structuredClone(data);duplicate.directions.push(duplicate.directions[0]);
 assert.throws(()=>validateSnapshot(duplicate),/重複方向/);
});
test('KPI official agreement follows the representative set and chosen date, not global validation',()=>{
 const s=summarize(data,{skipHolidays:false});
 assert.equal(s.official.minutes,27387);assert.equal(s.official.exact,21558);
 assert.equal(s.official.share,21558/27387);assert.notEqual(s.official.share,96964/122324);
 assert.equal(s.totals.expected,30*22*150);assert.equal(s.totals.availableExpected,30*21*150);
 const one=summarize(data,{date:'2026-10-22'});
 const manual=s.representatives.map(d=>d.days.find(r=>r.date==='2026-10-22')).reduce((a,d)=>a+(d?.officialComparison?.minutes??0),0);
 assert.equal(one.official.minutes,manual);assert.ok(manual<s.official.minutes);
 assert.equal(s.rows.length,30);assert.equal(s.heat.length,30);
 const all=summarize(data,{scope:'all'});assert.ok(all.representativeCount>30);
 assert.equal(all.representativeCount,new Set(all.representatives.map(d=>d.linkId)).size);
});
test('missing and excluded dates keep unknown indicators without deleting uncovered directions',()=>{
 for(const date of ['2026-09-24','2026-09-25']){
  const s=summarize(data,{date});assert.equal(s.totals.share,null);assert.equal(s.official.share,null);
  assert.equal(s.rows.length,30);assert.deepEqual(s.peakPeriods,[]);
  assert.ok(s.heat.every(row=>row.periods.every(p=>p.share===null)));
 }
 const missing=summarize(data,{date:'2026-09-24'});
 assert.equal(missing.totals.completeness,0);assert.equal(missing.totals.expected,4500);
 const excluded=summarize(data,{date:'2026-09-25'});
 assert.equal(excluded.excludedHolidayCount,1);assert.equal(excluded.totals.completeness,null);
 const q=qualityRows(data.directions[0],['2026-09-24','2026-09-23']);
 assert.equal(q[0].received,null);assert.equal(q[0].volume,null);assert.ok(q[1].received>=q[1].valid);
 assert.equal(q[1].unclassified,q[1].valid-q[1].speed);
});
test('directions with no speed still contribute to completeness denominator; ties are retained',()=>{
 const d=structuredClone(data);d.directions=d.directions.filter(x=>x.scope.included).slice(0,2);
 d.directions[1].linkId='unique';d.directions[1].days=[];
 const s=summarize(d);assert.equal(s.representativeCount,2);assert.equal(s.totals.expected,2*19*150);
 assert.equal(s.heat[1].share,null);assert.equal(s.rows.length,2);
 const empty=structuredClone(d);empty.directions[0].days=[];assert.deepEqual(summarize(empty).peakPeriods,[]);
});
test('map renders one selectable geometry per representative with selected-period values and missingness',()=>{
 const s=summarize(data),base={bbox:[121.55,25.05,121.62,25.1],features:[]};
 const svg=renderEvidenceMap(data,s,0,s.rows[0].id,base,scene);
 assert.equal((svg.match(/data-map-route=/g)||[]).length,s.representatives.filter(d=>d.geometry?.shape?.length).length);
 assert.ok(svg.includes('marker-end="url(#route-map-arrow)"'));assert.ok(!svg.includes('NaN'));
 assert.notEqual(svg,renderEvidenceMap(data,s,9,s.rows[0].id,base,scene));
 const missing=renderEvidenceMap(data,summarize(data,{date:'2026-09-24'}),0,null,base,scene);
 assert.ok(missing.includes('此時段無有效分級'));assert.equal(trafficColor(null),'#66757e');assert.notEqual(trafficColor(0),trafficColor(null));
});

test('direction offsets preserve surveyed junction endpoints and keep arrows away from junctions',()=>{
 const input=[[0,0],[100,0]],g=directedGeometry(input),reverse=directedGeometry([...input].reverse());
 assert.deepEqual(g.shifted[0],input[0]);assert.deepEqual(g.shifted.at(-1),input.at(-1));
 assert.deepEqual(reverse.shifted[0],input[1]);assert.deepEqual(reverse.shifted.at(-1),input[0]);
 assert.ok(g.shifted.some(p=>p[1]===3));assert.ok(reverse.shifted.some(p=>p[1]===-3));
 assert.ok(g.shifted.every(p=>p[0]>=0&&p[0]<=100&&p[1]>=0&&p[1]<=3));
 assert.ok(g.arrow.every(p=>p[0]>0&&p[0]<100));assert.deepEqual(input,[[0,0],[100,0]]);
 for(const points of [[[0,0],[0,0]],[[0,0],[0,0],[5,0]],[[0,0],[30,0],[30,30]]]){
  const result=directedGeometry(points);assert.ok(result.shifted.flat().every(Number.isFinite));
  assert.deepEqual(result.shifted[0],points[0]);assert.deepEqual(result.shifted.at(-1),points.at(-1));
 }
 assert.deepEqual(directedGeometry([[0,0],[5,0]]).arrow,[]);
});
test('every observation has a source road bed even when the base extract has no road',()=>{
 const s=summarize(data),base={bbox:[121.55,25.05,121.62,25.1],features:[]},before=JSON.stringify(data);
 const svg=renderEvidenceMap(data,s,0,null,base,scene);
 const visible=s.representatives.filter(d=>d.geometry?.shape?.length>1);
 assert.equal((svg.match(/data-tdx-road=/g)||[]).length,new Set(visible.map(d=>d.linkId)).size);
 for(const d of visible)assert.ok(svg.includes(`data-tdx-road="${d.linkId}"`),d.roadName);
 assert.match(svg,/洲子街/);assert.match(svg,/瑞湖街/);assert.match(svg,/道路補線：TDX/);
 assert.equal(JSON.stringify(data),before);
});

test('selected-period export denominator includes missing target dates while available coverage stays separate',()=>{
 const summary=summarize(data),d=data.directions.find(d=>d.vdId==='VQBUL20'&&d.bearing==='E');
 const p=periodEvidence(d,summary.dates,4,summary.requested);
 assert.equal(p.classified,219);assert.equal(p.expected,285);assert.equal(p.availableExpected,270);
 assert.equal(p.days.length,19);assert.equal(p.days.find(d=>d.date==='2026-09-24').share,null);
 assert.equal(p.observedDays,18);assert.equal(p.highDays,0);
});

const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../web/evidence-windows');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../web/data/neihu-data.js'),'utf8'),ctx);
const data=ctx.window.NEIHU_DATA;
const fresh=()=>JSON.parse(JSON.stringify(data));

test('retained G1 comparison sums distinct one-hour windows and averages speeds without weighting',()=>{
 const before=JSON.stringify(data),r=E.compare(data,'G1');
 assert.deepEqual(r.earlier.labels,['07:30','07:45','08:00','08:15']);
 assert.deepEqual(r.later.labels,['08:30','08:45','09:00','09:15']);
 assert.equal(r.metrics.flow.earlier,1657);assert.equal(r.metrics.flow.later,1839);assert.equal(r.metrics.flow.delta,182);
 assert.equal(r.metrics.moto.earlier,803);assert.equal(r.metrics.moto.later,859);
 assert.equal(r.metrics.speed.earlier,25.75);assert.equal(r.metrics.speed.later,26.75);assert.equal(r.metrics.speed.delta,1);
 assert.equal(r.metrics.flow.percent,182/1657*100);
 assert.equal(r.overlapMinutes,0);assert.equal(r.rawCoverageVerified,false);
 for(const k of ['motorcycleShare','spareCapacity','travelTimeBenefit','policyEffect'])assert.equal(r[k],null);
 assert.equal(JSON.stringify(data),before);
});

test('lower flow can coincide with lower speed and must retain the adverse observation',()=>{
 const r=E.compare(data,'G2');assert.equal(r.metrics.flow.delta,-35);assert.equal(r.metrics.moto.delta,2);assert.equal(r.metrics.speed.delta,-2.75);
 assert.equal(r.policyEffect,null);
});

test('hand-computable overlapping windows keep shared observations and disclose overlap',()=>{
 const d=fresh(),m=d.measured[d.meta.days[0]].G1;
 for(const key of ['flow','moto','speed'])m[key]=d.slots.map((_,i)=>i);
 const r=E.compare(d,'G1',{start:'07:00',shift:15});
 assert.equal(r.overlapMinutes,45);assert.equal(r.metrics.flow.earlier,10);assert.equal(r.metrics.flow.later,14);assert.equal(r.metrics.speed.delta,1);
});

test('missing or invalid values suppress only the affected metric, without silently replacing them',()=>{
 for(const bad of [null,undefined,NaN,Infinity,-1,'20']){
  const d=fresh();d.measured[d.meta.days[0]].G1.moto[7]=bad;
  const r=E.compare(d,'G1');
  assert.equal(r.metrics.moto.later,null);assert.equal(r.metrics.moto.delta,null);assert.equal(r.metrics.moto.percent,null);
  assert.deepEqual(r.metrics.moto.available,[4,3]);assert.equal(r.metrics.flow.delta,182);assert.equal(r.metrics.speed.delta,1);
 }
 const d=fresh();delete d.measured[d.meta.days[0]].G1.speed;
 assert.equal(E.compare(d,'G1').metrics.speed.earlier,null);
});

test('true zero counts and zero speeds remain valid; a zero denominator has no percentage',()=>{
 const d=fresh(),m=d.measured[d.meta.days[0]].G1;
 for(const key of ['flow','moto','speed'])m[key]=d.slots.map((_,i)=>i<7?0:5);
 const r=E.compare(d,'G1');
 assert.equal(r.metrics.flow.earlier,0);assert.equal(r.metrics.flow.later,20);assert.equal(r.metrics.flow.delta,20);assert.equal(r.metrics.flow.percent,null);
 assert.equal(r.metrics.speed.earlier,0);assert.equal(r.metrics.speed.later,5);
});

test('end boundary includes 10:15–10:30 but never fabricates a later bin',()=>{
 const r=E.compare(data,'G1',{start:'07:30',shift:120});
 assert.equal(r.later.start,'09:30');assert.equal(r.later.end,'10:30');assert.equal(r.metrics.flow.later,1338);
 assert.equal(E.compare(data,'G1',{start:'09:00',shift:30}).later.end,'10:30');
 for(const options of [{start:'09:00',shift:45},{start:'06:45',shift:15},{shift:0},{shift:150},{shift:16},{shift:'30'},{start:'25:00'},{start:'07:11'}])assert.throws(()=>E.compare(data,'G1',options));
});

test('unknown dates, points, duplicated timestamps and mismatched slot sizes are rejected',()=>{
 assert.throws(()=>E.compare(data,'invalid'));assert.throws(()=>E.compare(data,'G1',{date:'2099-01-01'}));
 const d=fresh();d.slots[3]=d.slots[2];assert.throws(()=>E.compare(d,'G1'));
 const wrong=fresh();wrong.meta.slotMinutes=5;assert.throws(()=>E.compare(wrong,'G1'));
});

test('absent time bins stay absent even if the remaining sequence is ordered',()=>{
 const d=fresh();d.slots.splice(3,1);
 for(const g of Object.values(d.measured[d.meta.days[0]]))for(const key of ['flow','moto','speed'])g[key].splice(3,1);
 const r=E.compare(d,'G1');assert.equal(r.metrics.flow.earlier,null);assert.equal(r.metrics.flow.later,1839);assert.deepEqual(r.metrics.flow.available,[3,4]);
});

test('scan enumerates every configured later window in chronological order without selecting a winner',()=>{
 const before=JSON.stringify(data),r=E.scan(data,'G2');
 assert.deepEqual(r.map(x=>x.shift),[15,30,45,60,90,120]);
 assert.equal(r.find(x=>x.shift===60).metrics.speed.delta,-2.75);
 assert.equal(r.at(-1).later.end,'10:30');
 assert.deepEqual(E.scan(data,'G2',{start:'09:00'}).map(x=>x.shift),[15,30]);
 assert.throws(()=>E.scan(data,'G2',{start:'09:30'}));
 assert.ok(r.every(x=>x.policyEffect===null&&x.spareCapacity===null));assert.equal(JSON.stringify(data),before);
});

test('paired speeds disclose missing pairs, ties and overlapping observations',()=>{
 const d=fresh(),m=d.measured[d.meta.days[0]].G1;
 [10,20,30,40].forEach((x,i)=>m.speed[i+3]=x);
 [11,20,29,null].forEach((x,i)=>m.speed[i+7]=x);
 const r=E.scan(d,'G1').find(x=>x.shift===60);
 assert.deepEqual(r.pairedSpeeds,{higher:1,lower:1,equal:1,valid:3,expected:4});
 assert.equal(r.metrics.speed.delta,null);assert.equal(r.overlapMinutes,0);
 assert.equal(E.scan(d,'G1')[0].overlapMinutes,45);
});

test('corridor review uses the three declared points and does not turn a proxy into a bridge observation',()=>{
 const r=E.corridorSummary(data);
 assert.deepEqual(r.rows.map(x=>x.gate),['G1','G6','G2']);
 assert.deepEqual(r.counts,{higher:1,lower:2,equal:0,missing:0});
 assert.equal(r.rows[1].coverageStatus,'PROXY_UNVERIFIED');assert.equal(r.rows[1].comparison.metrics.speed.delta,-.5);assert.equal(r.policyEffect,null);
 const d=fresh();d.measured[d.meta.days[0]].G6.speed[7]=null;
 assert.deepEqual(E.corridorSummary(d).counts,{higher:1,lower:1,equal:0,missing:1});
});

const surveys=JSON.parse(fs.readFileSync(require.resolve('../web/evidence/data/observations.json'),'utf8'));
test('same-day historical peaks reproduce four official survey summaries without mixing dates',()=>{
 const before=JSON.stringify(surveys),r=E.surveyPeaks(surveys);
 assert.equal(r.rows.length,4);assert.equal(r.date,'2025-09-11');assert.equal(r.window,'07:00–09:00');
 const expected={NI001:[1334,'08:00'],NI008:[1997,'08:45'],SI020:[2473,'08:00'],SI021:[1861,'08:15']};
 r.rows.forEach(row=>{assert.equal(row.maximum,expected[row.id][0]);assert.equal(row.peakTimes[0].start,expected[row.id][1]);assert.equal(row.peakTimes.length,1);assert.equal(row.status,'COMPLETE_SURVEY_WINDOW');});
 assert.equal(E.surveyPeaks(surveys,'2025-06-24').rows.length,2);
 assert.equal(r.trafficEffect,null);assert.equal(JSON.stringify(surveys),before);
});

test('survey peak calculation keeps ties and suppresses incomplete or internally inconsistent samples',()=>{
 const d=structuredClone(surveys),s=d.stations.find(s=>s.id==='NI001');
 s.series[0]={...s.series[0],small:1334,large:0,moto:0,total:1334};
 assert.deepEqual(E.surveyPeaks(d).rows.find(r=>r.id==='NI001').peakTimes.map(t=>t.start),['07:00','08:00']);
 s.series[0].total=null;
 const row=E.surveyPeaks(d).rows.find(r=>r.id==='NI001');assert.equal(row.maximum,null);assert.deepEqual(row.peakTimes,[]);assert.equal(row.status,'INCOMPLETE_SURVEY_WINDOW');
 s.series[0].total=12;assert.equal(E.surveyPeaks(d).rows.find(r=>r.id==='NI001').maximum,null);
 const duplicate=structuredClone(surveys);duplicate.stations.push(duplicate.stations[0]);assert.throws(()=>E.surveyPeaks(duplicate));
});

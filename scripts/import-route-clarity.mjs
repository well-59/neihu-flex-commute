// Import only public, aggregate evidence from the teammate checkout. No network or credentials.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.resolve(process.argv[2] || path.join(root,'../neihu-route-clarity'));
const bytes=fs.readFileSync(path.join(source,'data/dashboard.json'));
const data=JSON.parse(bytes);
const pick=(object,keys)=>Object.fromEntries(keys.filter(k=>object[k]!==undefined).map(k=>[k,object[k]]));
const snapshot={
 provenance:{repository:'https://github.com/zach0627/neihu-route-clarity',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),sourceSHA256:createHash('sha256').update(bytes).digest('hex'),generatedAt:data.meta.generatedAt,rawMinutesAvailable:false,status:'TEAMMATE_AGGREGATED_SNAPSHOT',policyEffect:null},
 meta:pick(data.meta,['requestedStart','requestedEnd','timeStart','timeEnd','qualityRule','rankingRule','congestionRule','boundaryNote','expectedMinutesPerDay','park','congestionLevels','representativeRule']),
 coverage:data.coverage,holidays:data.holidays,sources:data.sources,referenceSources:data.referenceSources,
 officialSources:data.validation.sources,officialMissingDates:data.validation.missingDates,
 directions:data.directions.map(d=>({...pick(d,['id','vdId','linkId','roadName','bearing','position','scope','geometry','laneCount','actualLaneCount','representativeId','representativePriority','representative','isRepresentative']),days:d.days.map(day=>pick(day,['date','receivedMinutes','validMinutes','volume','speedMinutes','speedSum','levelMinutes','congestionProfile','officialComparison','reasonCounts']))}))
};
const out=path.join(root,'web/data/route-clarity.json');
fs.writeFileSync(out,JSON.stringify(snapshot));
const vendor=path.join(root,'web/vendor/route-clarity');fs.mkdirSync(vendor,{recursive:true});
for(const name of ['ranking','dashboard']) {
 const code=fs.readFileSync(path.join(source,`lib/${name}.mjs`),'utf8').replace("'./ranking.mjs'","'./ranking.js'");
 fs.writeFileSync(path.join(vendor,`${name}.js`),`// Source: ${snapshot.provenance.repository} @ ${snapshot.provenance.commit}\n// Imported for team integration; only module extension changed.\n`+code);
}
console.log(JSON.stringify({commit:snapshot.provenance.commit,directions:snapshot.directions.length,availableDates:snapshot.coverage.availableDates.length,bytes:fs.statSync(out).size}));

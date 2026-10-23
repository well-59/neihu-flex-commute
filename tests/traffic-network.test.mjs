import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildDisplayNetwork,matchObservations} from '../web/traffic-network.js';
import {vehicleLayout,tripPosition} from '../web/traffic-flow.js';
import {summarize} from '../web/route-evidence-model.js';
const c={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../web/data/neihu-road-network.js',import.meta.url),'utf8'),c);
const geo=c.window.NEIHU_ROADS,network=buildDisplayNetwork(geo),snapshot=JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json',import.meta.url)));
const feature=(id,coords,props={})=>({id,properties:{osmId:id,name:'測試路',highway:'secondary',oneway:'yes',...props},geometry:{type:'LineString',coordinates:coords}});
const fixture=features=>({bbox:[0,0,1,1],features});
test('production network covers all source roads and assigns each directed edge once',()=>{
 const roadIds=new Set(geo.features.filter(f=>f.properties.highway&&f.geometry.type==='LineString').map(f=>f.properties.osmId));
 assert.equal(network.sourceCount,roadIds.size);assert.equal(network.sourceCount,549);
 const ids=network.paths.flatMap(p=>p.edges);assert.equal(ids.length,network.edgeCount);assert.equal(new Set(ids).size,ids.length);
 for(const bridge of ['民權大橋','成美橋','麥帥一橋','麥帥二橋','成功橋'])assert.ok(network.paths.some(p=>p.names.includes(bridge)));
 for(const p of network.paths){assert.ok(p.length>0);assert.ok(p.points.flat().every(Number.isFinite));}
});
test('touching one-way pieces continue without resetting; reverse one-way is respected',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]]),feature('b',[[.2,.5],[.3,.5]])]));
 assert.equal(n.paths.length,1);assert.equal(n.paths[0].sources.length,2);assert.ok(n.paths[0].points.at(-1)[0]>n.paths[0].points[0][0]);
 const rev=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{oneway:'-1'})]));assert.ok(rev.paths[0].points.at(-1)[0]<rev.paths[0].points[0][0]);
});
test('two-way lanes remain separate and do not join into an immediate U-turn',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{oneway:'no'})]));assert.equal(n.paths.length,2);assert.ok(n.paths.every(p=>!p.closed&&p.edges.length===1));assert.notEqual(n.paths[0].points[0][2],n.paths[1].points.at(-1)[2]);
});
test('crossing roads and geometry gaps are not invented connections',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.3,.5]]),feature('b',[[.2,.4],[.2,.6]],{layer:'1'}),feature('c',[[.31,.5],[.4,.5]])]));assert.equal(n.paths.length,3);assert.ok(n.paths.find(p=>p.sources.includes('b')).points[0][1]>n.paths.find(p=>p.sources.includes('a')).points[0][1]);
});
test('bridge/approach shared vertices have identical road heights',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]]),feature('b',[[.2,.5],[.3,.5]],{bridge:true,layer:'1'})]));assert.equal(n.paths.length,1);assert.ok(n.paths[0].points[1][1]>n.paths[0].points[0][1]);assert.ok(n.paths[0].points[1][1]<n.paths[0].points[2][1]);
});
test('observation mapping does not color a nearby differently named bridge',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{name:'橋梁'})]));
 const d={id:'sensor',roadName:'測試路',scope:{category:'internal'},geometry:{shape:[[.1,.5],[.2,.5]]}};
 assert.ok(matchObservations(n,[d]).every(p=>p.segments.every(s=>s.route===null)));
 d.roadName='橋梁';assert.equal(matchObservations(n,[d])[0].segments[0].route,'sensor');d.geometry.shape.reverse();assert.equal(matchObservations(n,[d])[0].segments[0].route,null);
});
test('explicit road sections never inherit a different section’s measurement',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{name:'民權東路五段'})]));
 const d={id:'six',roadName:'民權東路六段',scope:{category:'internal'},geometry:{shape:[[.1,.5],[.2,.5]]}};
 assert.equal(matchObservations(n,[d])[0].segments[0].route,null);
});
test('real matched directions are disclosed; observations remain immutable',()=>{
 const before=JSON.stringify(snapshot);
 for(const [scope,expected] of [['park',30],['all',70]]){const summary=summarize(snapshot,{scope}),paths=matchObservations(network,summary.representatives),ids=new Set(paths.flatMap(p=>p.segments.map(s=>s.route)).filter(Boolean));assert.equal(ids.size,expected);assert.equal(paths.length,network.paths.length);}
 assert.equal(JSON.stringify(snapshot),before);
});
test('open-trip exit becomes invisible before restarting, without reversing visible progress',()=>{
 const length=4,speed=.4,phase=.5;let previous=tripPosition(length,speed,phase,0);let hidden=false,reentered=false;
 for(let t=.02;t<15;t+=.02){const p=tripPosition(length,speed,phase,t);if(p.visible&&previous.visible)assert.ok(p.progress>=previous.progress-1e-10);if(!p.visible)hidden=true;if(hidden&&p.visible)reentered=true;assert.ok(p.scale>=0&&p.scale<=1);previous=p;}
 assert.ok(hidden&&reentered);const tiny=tripPosition(.05,.4,.5,.3);assert.equal(tiny.visible,false);
});
test('illustrative quantities follow road length/class and pressure, never become measured flow',()=>{
 const free=vehicleLayout(8,0),slow=vehicleLayout(8,1);assert.ok(slow.length>free.length);assert.ok(slow[0].speed<free[0].speed);assert.equal(vehicleLayout(8,null).length,0);
 assert.ok(vehicleLayout(8,null,{context:true}).length>0);assert.ok(vehicleLayout(8,null,{context:true,motorcycles:false}).every(v=>v.kind==='car'));assert.ok(vehicleLayout(16,null,{context:true}).length>vehicleLayout(8,null,{context:true}).length);
});

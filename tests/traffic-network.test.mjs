import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildDisplayNetwork,matchObservations} from '../web/traffic-network.js';
import {vehicleLayout,tripPosition} from '../web/traffic-flow.js';
import * as flow from '../web/traffic-flow.js';
import {summarize} from '../web/route-evidence-model.js';
const c={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../web/data/neihu-road-network.js',import.meta.url),'utf8'),c);
const geo=c.window.NEIHU_ROADS,network=buildDisplayNetwork(geo),snapshot=JSON.parse(fs.readFileSync(new URL('../web/data/route-clarity.json',import.meta.url)));
const feature=(id,coords,props={})=>({id,properties:{osmId:id,name:'測試路',highway:'secondary',oneway:'yes',...props},geometry:{type:'LineString',coordinates:coords}});
const fixture=features=>({bbox:[0,0,1,1],features});
test('production network covers all source roads and assigns each directed edge once',()=>{
 const roadIds=new Set(geo.features.filter(f=>f.properties.highway&&f.geometry.type==='LineString').map(f=>f.properties.osmId));
 assert.equal(network.sourceCount,roadIds.size);assert.equal(network.sourceCount,1273);
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
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{nodeRefs:['1','2']}),feature('b',[[.2,.5],[.3,.5]],{bridge:true,layer:'1',nodeRefs:['2','3']})]));assert.equal(n.paths.length,1);assert.ok(n.paths[0].points[1][1]>n.paths[0].points[0][1]);assert.ok(n.paths[0].points[1][1]<n.paths[0].points[2][1]);
});
test('shared coordinates never connect different source nodes or crossing grades',()=>{
 const distinct=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{nodeRefs:['1','2']}),feature('b',[[.2,.5],[.3,.5]],{nodeRefs:['3','4']})]));
 assert.equal(distinct.paths.length,2);
 const crossing=buildDisplayNetwork(fixture([
  feature('a',[[.1,.5],[.2,.5],[.3,.5]]),
  feature('b',[[.2,.4],[.2,.5],[.2,.6]],{layer:'1',bridge:true})
 ]));
 assert.equal(crossing.paths.length,2);assert.ok(crossing.paths.every(p=>p.sources.length===1));
 assert.equal(crossing.paths.find(p=>p.sources.includes('a')).center[1][1],.65);
 assert.equal(crossing.paths.find(p=>p.sources.includes('b')).center[1][1],1.07);
});
test('explicit access overrides hierarchy and keeps restricted roads visible without vehicles',()=>{
 for(const [props,cars,motorcycles] of [
  [{motor_vehicle:'no',motorcycle:'yes'},false,true],
  [{access:'private'},false,false],
  [{motorcar:'no'},false,true],
  [{motor_vehicle:'no'},false,false],
  [{access:'no',motorcar:'yes'},true,false],
  [{highway:'motorway',access:'yes'},true,false],
  [{highway:'motorway',motorcycle:'yes'},true,true]
 ]){
  const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],props)]));
  assert.ok(n.paths.length>0);assert.equal(n.paths[0].cars,cars);assert.equal(n.paths[0].motorcycles,motorcycles);
 }
});
test('mode specific one-way rules keep motorcycle contraflow separate from cars',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{oneway:'true','oneway:motorcycle':'no'})]));
 assert.equal(n.paths.length,2);const backward=n.paths.find(p=>p.points.at(-1)[0]<p.points[0][0]);
 assert.equal(backward.cars,false);assert.equal(backward.motorcycles,true);
 const roundabout=buildDisplayNetwork(fixture([feature('r',[[.1,.5],[.2,.5]],{oneway:undefined,junction:'roundabout'})]));
 assert.equal(roundabout.paths.length,1);
 const reversible=buildDisplayNetwork(fixture([feature('r',[[.1,.5],[.2,.5]],{oneway:'reversible'})]));
 assert.ok(reversible.paths.every(p=>!p.cars&&!p.motorcycles&&p.directionUnknown));
});
test('unresolved conditional directions remain inspectable in both directions without moving traffic',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{oneway:'no','oneway:conditional':'yes @ (Mo-Fr 17:00-19:30)'})]));
 assert.equal(n.paths.length,2);assert.ok(n.paths.every(p=>p.directionUnknown&&!p.cars&&!p.motorcycles));
 const directions=[{id:'e',roadName:'測試路',scope:{category:'internal'},geometry:{shape:[[.1,.5],[.2,.5]]}},{id:'w',roadName:'測試路',scope:{category:'internal'},geometry:{shape:[[.2,.5],[.1,.5]]}}];
 assert.deepEqual(new Set(matchObservations(n,directions).flatMap(p=>p.segments.map(s=>s.route))),new Set(['e','w']));
});
test('unknown branches stop trips even when one branch makes a sharp turn',()=>{
 const n=buildDisplayNetwork(fixture([
  feature('a',[[.1,.5],[.2,.5]],{nodeRefs:['1','2']}),
  feature('b',[[.2,.5],[.3,.5]],{nodeRefs:['2','3']}),
  feature('c',[[.2,.5],[.11,.51]],{nodeRefs:['2','4']})
 ]));
 assert.equal(n.paths.find(p=>p.sources.includes('a')).sources.length,1);
});
test('known turn restrictions stop a prohibited sole continuation and remain inspectable',()=>{
 const roads=fixture([feature('a',[[.1,.5],[.2,.5]],{nodeRefs:['1','2']}),feature('b',[[.2,.5],[.3,.5]],{nodeRefs:['2','3']})]);
 roads.restrictions=[{osmId:'r',tags:{type:'restriction',restriction:'no_straight_on'},members:[{type:'way',ref:'a',role:'from'},{type:'node',ref:'2',role:'via'},{type:'way',ref:'b',role:'to'}]}];
 const n=buildDisplayNetwork(roads);assert.equal(n.paths.length,2);assert.equal(n.restrictions.length,1);
 assert.ok(n.paths.find(p=>p.sources.includes('a')).restrictionIds.includes('r'));
});
test('restrictions remain attached at an ambiguous junction where trips already stop',()=>{
 const roads=fixture([feature('a',[[.1,.5],[.2,.5]],{nodeRefs:['1','2']}),feature('b',[[.2,.5],[.3,.5]],{nodeRefs:['2','3']}),feature('c',[[.2,.5],[.2,.6]],{nodeRefs:['2','4']})]);
 roads.restrictions=[{osmId:'r',tags:{type:'restriction',restriction:'no_right_turn'},members:[{type:'way',ref:'a',role:'from'},{type:'node',ref:'2',role:'via'},{type:'way',ref:'c',role:'to'}]}];
 const n=buildDisplayNetwork(roads);assert.equal(n.paths.find(p=>p.sources.includes('a')).sources.length,1);assert.deepEqual(n.paths.find(p=>p.sources.includes('a')).restrictionIds,['r']);
});
test('observation mapping does not color a nearby differently named bridge',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{name:'橋梁'})]));
 const d={id:'sensor',roadName:'測試路',scope:{category:'internal'},geometry:{shape:[[.1,.5],[.2,.5]]}};
 assert.ok(matchObservations(n,[d]).every(p=>p.segments.every(s=>s.route===null)));
 d.roadName='橋梁';assert.equal(matchObservations(n,[d])[0].segments[0].route,'sensor');d.geometry.shape.reverse();assert.equal(matchObservations(n,[d])[0].segments[0].route,null);
});
test('coincident monitoring directions remain independently selectable with one primary reading',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]])]));
 const direction={roadName:'測試路',linkId:'same',scope:{category:'internal'},geometry:{shape:[[.1,.5],[.2,.5]]}};
 const paths=matchObservations(n,[{...direction,id:'one'},{...direction,id:'two'},{...direction,id:'wrong',roadName:'別條路'}]);
 assert.equal(paths[0].segments[0].route,'one');assert.deepEqual(paths[0].segments[0].routes,['one','two']);
});
test('explicit road sections never inherit a different section’s measurement',()=>{
 const n=buildDisplayNetwork(fixture([feature('a',[[.1,.5],[.2,.5]],{name:'民權東路五段'})]));
 const d={id:'six',roadName:'民權東路六段',scope:{category:'internal'},geometry:{shape:[[.1,.5],[.2,.5]]}};
 assert.equal(matchObservations(n,[d])[0].segments[0].route,null);
});
test('real matched directions are disclosed; observations remain immutable',()=>{
 const before=JSON.stringify(snapshot);
 for(const [scope,expected] of [['park',30],['all',79]]){const summary=summarize(snapshot,{scope}),paths=matchObservations(network,summary.representatives),ids=new Set(paths.flatMap(p=>p.segments.map(s=>s.route)).filter(Boolean));assert.equal(ids.size,expected);assert.equal(paths.length,network.paths.length);}
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
test('distance based samples travel equal distances through unequal curve pieces',()=>{
 assert.equal(typeof flow.sampleTripCurve,'function');
 // Two collinear pieces have lengths 1 and 9; edge-index sampling would accelerate ninefold.
 const curve={getPointAt:u=>({x:u*10,y:0,z:0}),getTangentAt:()=>({x:1,y:0,z:0}),getPoint:u=>({x:u<.5?u*2:1+(u-.5)*18,y:0,z:0})};
 const positions=[0,1,2,3].map(time=>flow.sampleTripCurve(curve,10,1,.1,time));
 assert.deepEqual(positions.map(p=>p.point.x),[1,2,3,4]);
 assert.ok(positions.every(p=>p.tangent.x===1&&p.visible));
});
test('illustrative layouts honor both vehicle permissions including motorcycle-only roads',()=>{
 assert.ok(vehicleLayout(8,.5,{cars:false,motorcycles:true}).every(v=>v.kind==='moto'));
 assert.equal(vehicleLayout(8,.5,{cars:false,motorcycles:false}).length,0);
});

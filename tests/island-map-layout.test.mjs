import test from 'node:test';
import assert from 'node:assert/strict';
import {fitIslandFrame} from '../web/island-map-layout.js';

test('expanded real geography fits the island instead of cropping the east edge',()=>{
 const original=fitIslandFrame([121.55,25.047,121.605,25.091],{width:1440,height:780});
 const expanded=fitIslandFrame([121.55,25.047,121.623,25.091],{width:1440,height:780});
 assert.ok(expanded.radius>original.radius);
 assert.ok(expanded.distance>original.distance);
 assert.ok(expanded.radius*Math.cos(Math.PI/6)>=Math.hypot(expanded.spanX/2,expanded.spanZ/2));
});
test('side drawers and a narrow phone leave the whole map within the usable view',()=>{
 const bounds=[121.55,25.047,121.623,25.091];
 const clear=fitIslandFrame(bounds,{width:1440,height:780});
 const drawer=fitIslandFrame(bounds,{width:1440,height:780,left:236,right:320});
 const phone=fitIslandFrame(bounds,{width:390,height:500});
 assert.ok(drawer.distance>clear.distance);
 assert.ok(drawer.shiftX>0,'map is offset away from the larger right drawer');
 assert.ok(phone.distance>clear.distance);
 assert.ok(Number.isFinite(fitIslandFrame(bounds,{width:0,height:0,left:400,right:400}).distance));
});

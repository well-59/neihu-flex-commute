import test from 'node:test';
import assert from 'node:assert/strict';
import {fitIslandFrame} from '../web/island-map-layout.js';

test('expanded real geography fits the island instead of cropping the east edge',()=>{
 const original=fitIslandFrame([121.55,25.047,121.605,25.091],{width:1440,height:780});
 const expanded=fitIslandFrame([121.55,25.047,121.623,25.091],{width:1440,height:780});
 assert.ok(expanded.radius>original.radius);
 assert.ok(expanded.distance>original.distance);
 // Each edge must contain the entire road rectangle, including the eastern corners.
 for(const x of [-expanded.spanX/2,expanded.spanX/2])for(const z of [-expanded.spanZ/2,expanded.spanZ/2]){
  for(let i=0;i<expanded.outline.length;i++){const a=expanded.outline[i],b=expanded.outline[(i+1)%expanded.outline.length];assert.ok((b[0]-a[0])*(z-a[1])-(b[1]-a[1])*(x-a[0])>0);}
 }
 const area=Math.abs(expanded.outline.reduce((n,a,i)=>{const b=expanded.outline[(i+1)%expanded.outline.length];return n+a[0]*b[1]-a[1]*b[0];},0))/2;
 const formerRadius=Math.hypot(expanded.spanX/2,expanded.spanZ/2)/Math.cos(Math.PI/6)+.8;
 assert.ok(area<3*Math.sqrt(3)/2*formerRadius**2*.8,'remove at least 20% of the enlarged empty base');
 const width=Math.max(...expanded.outline.map(p=>p[0]))-Math.min(...expanded.outline.map(p=>p[0]));
 assert.ok(width<=41.2+1e-6,'restore the original island width while supporting the expanded map');
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

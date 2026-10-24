import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

import {vehicleLayout,tripPosition} from './traffic-flow.js';
import {observedVehicleLayout} from './traffic-monitor-model.js';
export {vehicleLayout,tripPosition} from './traffic-flow.js';

export function createVehicleFleet(parent){
 const geometries={};
 function model(moto){
  const parts=[];
  const add=(geometry,x,y,z,color)=>{if(geometry.index){const original=geometry;geometry=geometry.toNonIndexed();original.dispose();}geometry.translate(x,y,z);const c=new THREE.Color(color),colors=new Float32Array(geometry.attributes.position.count*3);for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry);};
  const box=(w,h,l,x,y,z,c)=>add(new RoundedBoxGeometry(w,h,l,1,.018),x,y,z,c);
  if(moto){
   box(.065,.07,.18,0,.065,0,0x4b9297);box(.065,.035,.085,0,.11,-.025,0x343f40);
   box(.07,.095,.06,0,.16,-.015,0xdca57e);add(new THREE.SphereGeometry(.045,8,6),0,.23,.005,0xffe6ad);
   box(.12,.014,.018,0,.13,.065,0x343f40);
   for(const z of [-.065,.065]){const g=new THREE.CylinderGeometry(.04,.04,.025,8);g.rotateZ(Math.PI/2);add(g,0,.04,z,0x313a39);}
  }else{
   box(.145,.075,.28,0,.085,0,0xd87556);box(.12,.075,.135,0,.15,-.015,0x608c90);
   box(.12,.018,.09,0,.194,-.025,0xf9e8c6);
   for(const x of [-.077,.077])for(const z of [-.085,.085]){const g=new THREE.CylinderGeometry(.034,.034,.024,8);g.rotateZ(Math.PI/2);add(g,x,.04,z,0x34403d);}
   for(const x of [-.046,.046])box(.035,.025,.012,x,.09,.145,0xffedb5);
  }
  const merged=mergeGeometries(parts);parts.forEach(g=>g.dispose());if(!merged)throw new Error("車輛模型組合失敗");return merged;
 }
 geometries.car=model(false);geometries.moto=model(true);
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82}),meshes={},dummy=new THREE.Object3D();let records=[],paths=[];
 function update(time){
  const counts={car:0,moto:0};
  for(const p of records){const trip=tripPosition(p.length,p.speed,p.phase,time,p.closed),progress=trip.progress,point=p.curve.getPoint(progress),tangent=p.curve.getTangent(progress);dummy.position.copy(point);dummy.position.y+=.012;dummy.rotation.set(0,Math.atan2(tangent.x,tangent.z),0);dummy.scale.setScalar(p.scale*trip.scale);dummy.updateMatrix();meshes[p.kind].setMatrixAt(counts[p.kind]++,dummy.matrix);}
  for(const mesh of Object.values(meshes))mesh.instanceMatrix.needsUpdate=true;
 }
 function rebuild(next,time=0){
  paths=next;records=[];
  for(const p of next){const length=p.curve.getLength();const layout=p.monitoring?observedVehicleLayout(length,p.monitoring,p):vehicleLayout(length,p.share,p);for(const v of layout)records.push({...v,curve:p.curve,length,route:p.route,context:!!p.context,closed:!!p.closed,scale:Math.min(.62,length/.40)});}
  for(const kind of ['car','moto']){if(meshes[kind]){parent.remove(meshes[kind]);meshes[kind].dispose();}const count=records.filter(p=>p.kind===kind).length;const mesh=new THREE.InstancedMesh(geometries[kind],material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.castShadow=false;meshes[kind]=mesh;parent.add(mesh);}
  update(time);
 }
 return {rebuild,update,inspect(){const samples={};for(const [kind,mesh] of Object.entries(meshes)){if(mesh.count){const matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);samples[kind]=matrix.elements.slice(12,15);}}return {samples,cars:records.filter(p=>p.kind==='car').length,motorcycles:records.filter(p=>p.kind==='moto').length,paths:paths.map(p=>({route:p.route,observationId:p.observationId||null,monitoring:!!p.monitoring,names:p.names,sources:p.sources,bridge:p.bridge,closed:!!p.closed,context:!!p.context,share:p.share,length:p.curve.getLength(),start:p.curve.getPoint(0).toArray(),end:p.curve.getPoint(1).toArray(),vehicles:records.filter(v=>v.curve===p.curve).map(v=>({kind:v.kind,phase:v.phase,speed:v.speed}))}))};}};
}

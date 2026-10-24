import * as THREE from 'three';
import {CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
import {nearestOnReference,bearingNames} from './vd-location-model.js';

export function createDeviceLayer(parent,project,onSelect,wake,focus){
 const group=new THREE.Group();group.visible=false;parent.add(group);
 const geometry=new THREE.SphereGeometry(.105,10,8),material=new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false});
 const relation=new THREE.Group();group.add(relation);let mesh=null,devices=[],label=null,selected=null,key='';
 const dummy=new THREE.Object3D();let relationInfo=null;
 function clearRelation(){for(const child of [...relation.children]){relation.remove(child);child.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}if(label){group.remove(label);label.element.remove();label=null;}}
 function draw(all,id,link){
  selected=id;const visible=all.filter(d=>d.inMap),nextKey=JSON.stringify(visible.map(d=>[d.id,d.position]));
  if(nextKey!==key){key=nextKey;devices=visible;if(mesh){group.remove(mesh);mesh.dispose();}
   mesh=new THREE.InstancedMesh(geometry,material,devices.length);mesh.frustumCulled=false;mesh.renderOrder=20;
   devices.forEach((d,i)=>{dummy.position.copy(project(d.position.lon,d.position.lat,1.1));dummy.scale.setScalar(1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});group.add(mesh);
  }
  devices.forEach((d,i)=>mesh.setColorAt(i,new THREE.Color(d.id===id?0xe66e3e:0x237e9b)));if(mesh)mesh.instanceColor.needsUpdate=true;
  clearRelation();relationInfo={linkId:link?.linkId||null,bearing:link?.bearing||null,hasReference:!!link?.reference};const device=devices.find(d=>d.id===id);
  if(device){
   const p=project(device.position.lon,device.position.lat,1.1);
   const el=document.createElement('div');el.className='map-label vd-label';el.textContent=`VD ${id} · ${bearingNames[link?.bearing]||link?.bearing||''}`;
   label=new CSS2DObject(el);label.position.copy(p).add(new THREE.Vector3(0,.7,0));group.add(label);
   const angles={N:0,NE:45,E:90,SE:135,S:180,SW:225,W:270,NW:315};
   if(angles[link?.bearing]!==undefined){const rad=angles[link.bearing]*Math.PI/180,arrow=new THREE.ArrowHelper(new THREE.Vector3(Math.sin(rad),0,-Math.cos(rad)),p,.8,0xe66e3e,.22,.14);arrow.line.material.depthTest=false;arrow.cone.material.depthTest=false;arrow.line.renderOrder=22;arrow.cone.renderOrder=22;relation.add(arrow);}
   const shape=link?.reference?.geometry?.shape,nearest=nearestOnReference(device.position,shape);
   if(shape?.length>1){const points=shape.map(c=>project(c[0],c[1],1.08));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:0x237e9b,depthTest:false}));line.renderOrder=19;relation.add(line);}
   if(nearest){const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([p,project(...nearest.point,1.08)]),new THREE.LineDashedMaterial({color:0xe66e3e,dashSize:.07,gapSize:.05,depthTest:false}));line.computeLineDistances();line.renderOrder=21;relation.add(line);}
  }
  wake();
 }
 return {draw,setActive(value){group.visible=value;if(label)label.visible=value;wake();},pick(ray){if(!group.visible||!mesh)return false;const hit=ray.intersectObject(mesh,false)[0];if(!hit)return false;onSelect({device:devices[hit.instanceId].id});return true;},focus(id){const d=devices.find(d=>d.id===id);if(d)focus(project(d.position.lon,d.position.lat,1.1),new THREE.Vector3(5,8,10));},inspect(){return {visible:group.visible,count:devices.length,selected,relation:relationInfo,positions:devices.map(d=>({id:d.id,...d.position,world:project(d.position.lon,d.position.lat,1.1).toArray()}))};}};
}

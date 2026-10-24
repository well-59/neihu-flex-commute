import * as THREE from 'three';
import {slotTime} from './period-comparison.js';

// Hit areas follow each directed source segment, including its elevation.
// Invisible materials keep this inspection layer out of rendering/draw-call counts.
export function createRoadInspector(parent,host,bindings){
 const objects=[],records=new Map(),material=new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide});
 const rectangle=(a,b,width,raise=0)=>{const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz)||1,x=-dz/length*width/2,z=dx/length*width/2;return [a[0]+x,a[1]+raise,a[2]+z,a[0]-x,a[1]+raise,a[2]-z,b[0]+x,b[1]+raise,b[2]+z,b[0]-x,b[1]+raise,b[2]-z];};
 for(const path of bindings){const positions=[],indices=[],ids=[];
  path.segments.forEach((s,i)=>{const id=path.id+':'+i,n=positions.length/3;positions.push(...rectangle(s.a,s.b,.10));indices.push(n,n+1,n+2,n+1,n+3,n+2);ids.push(id);records.set(id,{id,name:path.segmentNames[i],route:s.route,a:s.a,b:s.b,sources:path.sources,both:path.both});});
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.userData.inspectionIds=ids;parent.add(mesh);objects.push(mesh);
 }
 const outline=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({color:0xfff7d2,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));outline.visible=false;parent.add(outline);
 const tooltip=document.createElement('div');tooltip.className='road-hover';tooltip.hidden=true;host.append(tooltip);
 let context=null,index=0,enabled=true,chosen=null;
 const pick=ray=>{const hit=ray.intersectObjects(objects,false)[0];return hit?records.get(hit.object.userData.inspectionIds[Math.floor(hit.faceIndex/2)])||null:null;};
 const describe=record=>{const p=context?.heat.find(r=>r.direction.id===record.route)?.periods[index];return {record,share:p?.share??null,time:`${slotTime(index)}–${slotTime(index+1)}`,classified:p?.classified??0};};
 function select(id){chosen=records.get(id)||null;outline.visible=enabled&&!!chosen;if(chosen){outline.geometry.dispose();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(rectangle(chosen.a,chosen.b,.12,.012),3));g.setIndex([0,1,2,1,3,2]);outline.geometry=g;}}
 return {pick,select,records,objects,
  setContext(summary,period){context=summary;index=period;tooltip.hidden=true;},
  setActive(active){enabled=active;tooltip.hidden=true;outline.visible=active&&!!chosen;},
  hide(){tooltip.hidden=true;},
  hover(ray,x,y){if(!enabled)return;const record=pick(ray);if(!record){tooltip.hidden=true;return;}const {share,time}=describe(record);tooltip.textContent=`${record.name} · ${time}\n${record.route?(share==null?'此時段缺少有效分級':`低速時間 ${(share*100).toFixed(1)}%`):'底圖道路 · 尚無對應觀測'}\n點選查看位置、方向與分時色帶`;tooltip.hidden=false;tooltip.style.left=Math.max(8,Math.min(host.clientWidth-tooltip.offsetWidth-8,x+16))+'px';tooltip.style.top=Math.max(8,Math.min(host.clientHeight-tooltip.offsetHeight-8,y+16))+'px';},
  inspect(){return {segments:records.size,matchedSegments:[...records.values()].filter(r=>r.route).length,records:[...records.values()],selected:chosen?.id||null};}
 };
}

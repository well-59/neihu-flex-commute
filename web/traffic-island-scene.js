import {createRoadInspector} from './road-inspector.js';
import {periodColor} from './traffic-palette.js';
import {representativeDirections} from './vendor/route-clarity/ranking.js';
import {createDeviceLayer} from './vd-location-layer.js';
import * as THREE from 'three';
import {createVehicleFleet} from './traffic-vehicles.js';
import {buildDisplayNetwork,matchObservations} from './traffic-network.js';
import {monitoredPaths} from './traffic-monitor-model.js';
import {fitIslandFrame} from './island-map-layout.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {CSS2DRenderer,CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

const C={cream:0xf0e7d3,edge:0xc8bca2,water:0x8dbfc0,road:0xb1b5a6,bridge:0xe2d6b9,green:0x75966c,coral:0xc87357};
export const shareColor=periodColor;
function seeded(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function clipSegment(a,b,box){let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1],ps=[-dx,dx,-dy,dy],qs=[a[0]-box[0],box[2]-a[0],a[1]-box[1],box[3]-a[1]];for(let i=0;i<4;i++){if(ps[i]===0){if(qs[i]<0)return null;}else{const t=qs[i]/ps[i];if(ps[i]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;}}return [[a[0]+dx*lo,a[1]+dy*lo],[a[0]+dx*hi,a[1]+dy*hi]];}
function clipPolygon(points,bounds){let out=points;for(const [axis,edge,sign] of [[0,bounds[0],1],[0,bounds[2],-1],[1,bounds[1],1],[1,bounds[3],-1]]){const input=out;out=[];if(!input.length)break;for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],ia=(a[axis]-edge)*sign>=0,ib=(b[axis]-edge)*sign>=0;const intersection=()=>{const t=(edge-a[axis])/(b[axis]-a[axis]);return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];};if(ia)out.push(a);if(ia!==ib)out.push(intersection());}}return out;}
function lineDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz;const t=l?clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/l,0,1):0;return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function ribbon(points,width){const positions=[],uv=[],indices=[];let distance=0;for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1;const x=-dz/len*width/2,z=dx/len*width/2;if(i)distance+=points[i].distanceTo(points[i-1]);positions.push(points[i].x+x,points[i].y,points[i].z+z,points[i].x-x,points[i].y,points[i].z-z);uv.push(distance,0,distance,1);if(i){const k=i*2;indices.push(k-2,k-1,k,k-1,k+1,k);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;}
function insidePolygon(x,z,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}

export function createCity(host,DATA,onSelect,onError){
 const rng=seeded(DATA.presentation.seed),scene=new THREE.Scene();scene.fog=new THREE.Fog(0xeff0e3,240,500);
 const camera=new THREE.PerspectiveCamera(32,1,.3,500),renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
 renderer.setPixelRatio(Math.min(devicePixelRatio,innerWidth<=800?1.4:1.75));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.setClearColor(0x000000,0);host.append(renderer.domElement);
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();onError(new Error('WebGL 繪圖連線中斷，請重新載入或使用 2D 備援。'));});
 const labels=new CSS2DRenderer();Object.assign(labels.domElement.style,{position:'absolute',inset:'0',pointerEvents:'none'});host.append(labels.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.enablePan=true;controls.screenSpacePanning=false;controls.zoomToCursor=true;controls.mouseButtons={LEFT:THREE.MOUSE.PAN,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.ROTATE};controls.touches={ONE:THREE.TOUCH.PAN,TWO:THREE.TOUCH.DOLLY_PAN};controls.minPolarAngle=25*Math.PI/180;controls.maxPolarAngle=70*Math.PI/180;controls.minDistance=7;controls.maxDistance=260;
 const hemi=new THREE.HemisphereLight(0xf1f4ed,0xa3977c,1.5);scene.add(hemi);
 const sun=new THREE.DirectionalLight(0xffedcf,2.8);sun.position.set(-16,30,22);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-27,right:27,top:25,bottom:-25,near:1,far:100});sun.shadow.bias=-.0006;sun.shadow.normalBias=.045;sun.shadow.radius=3;scene.add(sun);scene.add(new THREE.DirectionalLight(0xc2d9eb,.7));
 const city=new THREE.Group(),sandbox=new THREE.Group();scene.add(city,sandbox);sandbox.visible=false;
 const ground=new THREE.Mesh(new THREE.CircleGeometry(130,64),new THREE.MeshStandardMaterial({color:0xe5e7d8,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.4;ground.receiveShadow=true;scene.add(ground);
 const footprint=fitIslandFrame(DATA.geography.roads.bbox);
 const pedestal=new THREE.Mesh(new THREE.CylinderGeometry(footprint.radius,footprint.radius+.5,1,6),new THREE.MeshStandardMaterial({color:C.edge,roughness:.95}));pedestal.rotation.y=Math.PI/6;pedestal.position.y=-.1;pedestal.receiveShadow=true;pedestal.castShadow=true;city.add(pedestal);
 const top=new THREE.Mesh(new THREE.CylinderGeometry(footprint.radius-.05,footprint.radius-.05,.18,6),new THREE.MeshStandardMaterial({color:C.cream,roughness:.94}));top.rotation.y=Math.PI/6;top.position.y=.48;top.receiveShadow=true;city.add(top);
 const bounds=DATA.geography.roads.bbox,cx=(bounds[0]+bounds[2])/2,cy=(bounds[1]+bounds[3])/2;
 const project=(lon,lat,y=.61)=>new THREE.Vector3((lon-cx)*111320*Math.cos(cy*Math.PI/180)*.005,y,(cy-lat)*111320*.005);
 let companyPicking=false,companyPosition=null;
 const companyMarker=new THREE.Group();companyMarker.visible=false;city.add(companyMarker);
 const companyDot=new THREE.Mesh(new THREE.SphereGeometry(.24,12,8),new THREE.MeshBasicMaterial({color:0x953f63,depthTest:false}));companyDot.renderOrder=30;companyMarker.add(companyDot);
 const companyElement=document.createElement('span');companyElement.className='map-label company-map-label';companyElement.textContent='公司位置（自選）';const companyLabel=new CSS2DObject(companyElement);companyLabel.position.y=.65;companyMarker.add(companyLabel);
 function setCompanyPosition(p){companyPosition=p?{lat:p.lat,lon:p.lon}:null;companyMarker.visible=!!p;if(p)companyMarker.position.copy(project(p.lon,p.lat,1.2));wake();}
 function setCompanyPick(value){companyPicking=value;host.style.cursor=value?'crosshair':'';roadInspector.hide();}
 const riverPolygons=[],waterSegments=[],roadSegments=[],batches=new Map(),staticLabels=[],routeLabels=[],liveLabels=[],scenarioLabels=[],pickables=[],routeMeshes=new Map();
 const addBatch=(key,g)=>{if(!batches.has(key))batches.set(key,[]);batches.get(key).push(g);};
 const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.87,side:THREE.DoubleSide,...extra});
 const roads=DATA.geography.roads.features,network=buildDisplayNetwork(DATA.geography.roads);
 for(const f of roads.filter(f=>f.properties.kind==='water'&&f.geometry.type==='Polygon')){
  const ring=clipPolygon(f.geometry.coordinates[0],bounds);if(ring.length<3)continue;const pts=ring.map(p=>project(...p,.59));riverPolygons.push(pts);
  const shape=new THREE.Shape();pts.forEach((p,i)=>i?shape.lineTo(p.x,-p.z):shape.moveTo(p.x,-p.z));shape.closePath();
  const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),material(C.water));mesh.rotation.x=-Math.PI/2;mesh.position.y=.6;city.add(mesh);
 }
 // The extract includes river centerlines; a fixed illustrative width keeps the river legible.
 const waterRuns=[];
 for(const f of roads.filter(f=>f.properties.kind==='river'&&f.geometry.type==='LineString')){
  let run=[];for(let i=1;i<f.geometry.coordinates.length;i++){const pair=clipSegment(f.geometry.coordinates[i-1],f.geometry.coordinates[i],bounds);if(!pair){if(run.length>1)waterRuns.push(run);run=[];continue;}const a=project(...pair[0],.605),b=project(...pair[1],.605);if(run.length&&run.at(-1).distanceTo(a)>.002){waterRuns.push(run);run=[];}if(!run.length)run.push(a);run.push(b);waterSegments.push([a,b]);}if(run.length>1)waterRuns.push(run);
 }
 if(waterRuns.length){const geometry=mergeGeometries(waterRuns.map(pts=>ribbon(pts,.92)));const river=new THREE.Mesh(geometry,material(0x75b8bb));river.receiveShadow=true;city.add(river);}
 const waterMat=material(0x9bcaca,{transparent:true,opacity:.42});
 // Sparse reflections follow the real river outline; no invented transport connections.
 for(const ring of riverPolygons){for(let i=0;i<ring.length;i+=5){const p=ring[i];const glint=new THREE.Mesh(new THREE.PlaneGeometry(.25+rng()*.5,.025),waterMat);glint.rotation.x=-Math.PI/2;glint.position.set(p.x,.615,p.z);city.add(glint);}}
 const bridgeNames=new Map(),roadNames=new Map();
 for(const f of roads.filter(f=>f.geometry.type==='LineString'&&!['water','river'].includes(f.properties.kind))){
  const p=f.properties,layer=Number(p.layer)||0,y=.65+Math.max(0,layer)*.42,width=p.highway==='motorway'?.24:p.focus?.15:.095;
  const runs=[];let run=[];
  for(let i=1;i<f.geometry.coordinates.length;i++){const part=clipSegment(f.geometry.coordinates[i-1],f.geometry.coordinates[i],bounds);if(!part){if(run.length>1)runs.push(run);run=[];continue;}const a=project(...part[0],y),b=project(...part[1],y);if(run.length&&run.at(-1).distanceTo(a)>.002){runs.push(run);run=[];}if(!run.length)run.push(a);run.push(b);roadSegments.push([a,b]);}if(run.length>1)runs.push(run);
  for(const pts of runs){
   let length=0;for(let i=1;i<pts.length;i++)length+=pts[i].distanceTo(pts[i-1]);if(p.name&&(p.focus||p.bridge)&&length>.8){const entry={name:p.name,point:pts[Math.floor(pts.length/2)].clone(),length};const map=p.bridge&&p.name.includes('橋')?bridgeNames:roadNames;if(!map.has(p.name)||map.get(p.name).length<length)map.set(p.name,entry);}
  }
 }
 // The single physical road surface comes from OSM; observations only tint its lanes.
 const paved=new Set();for(const path of network.paths)for(let i=1;i<path.center.length;i++){
  const a=path.center[i-1],b=path.center[i],key=[a.join(','),b.join(',')].sort().join('|');if(paved.has(key))continue;paved.add(key);
  const points=[new THREE.Vector3(...a),new THREE.Vector3(...b)],width=path.both?.23:.14;
  addBatch(path.bridge?'bridge':'road',ribbon(points,width));
 }
 for(const [key,geometries] of batches){const merged=mergeGeometries(geometries);const mesh=new THREE.Mesh(merged,material(key==='road'?C.road:key==='bridge'?C.bridge:0x9eaa9e));mesh.receiveShadow=true;city.add(mesh);geometries.forEach(g=>g.dispose());}
 function addLabel(text,pos,{className='context',route=null,gate=null,parent=city}={}){
  const el=document.createElement(route||gate?'button':'div');el.className=`map-label ${className}`;el.textContent=text;
  if(route||gate){el.addEventListener('pointerdown',e=>e.stopPropagation());el.addEventListener('click',e=>{e.stopPropagation();onSelect(route?{route}:{gate});});}
  const object=new CSS2DObject(el);object.position.copy(pos);parent.add(object);const record={object,el,route,gate,className};if(parent===sandbox){object.visible=false;scenarioLabels.push(record);}return record;
 }
 for(const entry of bridgeNames.values()){entry.point.y+=.35;staticLabels.push(addLabel(entry.name,entry.point,{className:'context major'}));}
 const named=['瑞光路','港墘路','洲子街','瑞湖街','內湖路一段','陽光街'];for(const name of named){const entry=roadNames.get(name);if(entry){entry.point.y=.95;staticLabels.push(addLabel(name,entry.point));}}
 const kit={box:[],roof:[],window:[],trunk:[],leaf:[]},baseGeometry=new RoundedBoxGeometry(1,1,1,2,.09),dummy=new THREE.Object3D();
 function part(kind,x,y,z,sx,sy,sz,color,rotation=0){kit[kind].push({x,y,z,sx,sy,sz,color,rotation});}
 // Buildings are decorative blocks, seeded and kept off surveyed roads and river polygons.
 for(let i=0;i<1150;i++){
  const x=(rng()-.5)*footprint.spanX,z=(rng()-.5)*footprint.spanZ,p=new THREE.Vector3(x,.6,z);
  if(riverPolygons.some(r=>insidePolygon(x,z,r))||waterSegments.some(([a,b])=>lineDistance(p,a,b)<.6))continue;
  let nearest=Infinity;for(const [a,b] of roadSegments)nearest=Math.min(nearest,lineDistance(p,a,b));if(nearest<.42||nearest>1.8)continue;
  const tree=rng()<.50;if(tree){const h=.28+rng()*.35;part('trunk',x,.6+h/2,z,.055,h,.055,0x9d8263);part('leaf',x,.7+h,z,.28,.42,.28,[0x91ad7d,0xb8c99c,0x7f9d6e][Math.floor(rng()*3)]);continue;}
  if(kit.box.length>145)continue;
  const h=.35+rng()*1.25,w=.20+rng()*.23,d=.22+rng()*.27,color=[0xe8ddc6,0xf2e9d5,0xd8d7bd,0xe4c9b2][Math.floor(rng()*4)];
  part('box',x,.59+h/2,z,w,h,d,color);part('roof',x,.6+h,z,w+.035,.045,d+.035,[0xc49d7c,0x94aba0,0xd1b196][Math.floor(rng()*3)]);
  for(let level=.17;level<h-.05;level+=.17)part('window',x,.6+level,z+d/2+.005,w*.68,.045,.014,0x7e9b94);
 }
 for(const [kind,instances] of Object.entries(kit)){
  const geo=kind==='leaf'?new THREE.IcosahedronGeometry(.65,1):kind==='trunk'?new THREE.CylinderGeometry(.5,.6,1,7):baseGeometry;
  const mesh=new THREE.InstancedMesh(geo,material(0xffffff),instances.length);mesh.castShadow=['box','roof','leaf'].includes(kind);mesh.receiveShadow=true;
  instances.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.rotation,0);dummy.scale.set(p.sx,p.sy,p.sz);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(p.color));});city.add(mesh);
 }
 const beacons=new Map(),beaconGeo=new THREE.CylinderGeometry(.14,.2,.15,16);
 for(const l of DATA.geography.locations.records){const pos=project(l.lon,l.lat,.78),mesh=new THREE.Mesh(beaconGeo,material(0x386b5a));mesh.position.copy(pos);mesh.userData.gate=l.gate;city.add(mesh);pickables.push(mesh);beacons.set(l.gate,mesh);if(DATA.presentation.corridors.some(c=>c.gate===l.gate)){const info=DATA.presentation.corridors.find(c=>c.gate===l.gate);staticLabels.push(addLabel(info.short, pos.clone().add(new THREE.Vector3(0,.5,0)),{className:'major',gate:l.gate}));}}
 const directionalGroup=new THREE.Group();city.add(directionalGroup);const fleet=createVehicleFleet(directionalGroup);
 let reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,motionPaused=false,active=true,dirty=true,flight=null,held=null,popup=null,raf=0,last=0,elapsed=0,mode='monitor',selectedId=null,frameCount=0,topView=false,inFrame=false;
 const roadInspector=createRoadInspector(city,host,matchObservations(network,representativeDirections(DATA.observations.directions,{includeExcluded:true})));
 const deviceLayer=createDeviceLayer(city,project,onSelect,wake,flyTo);
 function clearRoutes(){for(const entry of routeMeshes.values()){city.remove(entry.group);entry.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}routeMeshes.clear();for(const l of [...routeLabels,...liveLabels]){city.remove(l.object);l.el.remove();}routeLabels.length=0;liveLabels.length=0;}
 let bindings=[];
 const makeCurve=points=>{const c=new THREE.CurvePath();for(let i=1;i<points.length;i++){const a=new THREE.Vector3(...points[i-1]),b=new THREE.Vector3(...points[i]);if(a.distanceTo(b)>.0001)c.add(new THREE.LineCurve3(a,b));}return c;};
 function routeFocusPoint(entry){const location=entry.direction.position,target=location?project(location.lon,location.lat):null;let chosen=null,best=Infinity;for(const curve of entry.curves){const p=curve.getPointAt(.5),score=target?Math.hypot(p.x-target.x,p.z-target.z):0;if(score<best){chosen=p;best=score;}}return chosen;}
 function drawRoutes(summary,index,selected,monitoring=null){
  selectedId=selected;const ids=(monitoring?'live:':'history:')+summary.representatives.map(d=>d.id).join('|');
  if(ids!==drawRoutes.key){clearRoutes();drawRoutes.key=ids;bindings=matchObservations(network,summary.representatives);
   for(const d of summary.representatives){routeMeshes.set(d.id,{group:new THREE.Group(),lines:[],outlines:[],hits:[],curves:[],direction:d});}
   const lanePieces=new Map();
   const addPiece=(id,segment)=>{const entry=routeMeshes.get(id);if(!entry)return;const points=[segment.a,segment.b].map(a=>new THREE.Vector3(a[0],a[1]+.004,a[2]));if(!lanePieces.has(id))lanePieces.set(id,[]);lanePieces.get(id).push(points);entry.curves.push(makeCurve([segment.a,segment.b]));};
   for(const path of bindings)for(const segment of path.segments){const candidates=monitoring?(segment.routes||[segment.route]):[segment.route];for(const id of candidates.filter(Boolean))addPiece(id,segment);}
   for(const [id,entry] of routeMeshes){const pieces=lanePieces.get(id);if(!pieces?.length){routeMeshes.delete(id);continue;}
    const geometries=pieces.map(p=>ribbon(p,.065)),geo=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:0x649880,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));mesh.userData.route=id;entry.group.add(mesh);entry.lines.push(mesh);
    if(monitoring){const hitGeo=mergeGeometries(pieces.map(p=>ribbon(p,.20))),hit=new THREE.Mesh(hitGeo,new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));hit.userData.route=id;entry.group.add(hit);entry.hits.push(hit);}
    const outlineGeos=pieces.map(p=>ribbon(p.map(v=>v.clone().add(new THREE.Vector3(0,-.001,0))),.10)),outlineGeo=mergeGeometries(outlineGeos);outlineGeos.forEach(g=>g.dispose());const outline=new THREE.Mesh(outlineGeo,material(0xfff9d9,{polygonOffset:true,polygonOffsetFactor:-.5}));entry.group.add(outline);entry.outlines.push(outline);city.add(entry.group);
   }
  }
  for(let i=pickables.length-1;i>=0;i--)if(pickables[i].userData.route)pickables.splice(i,1);
  const shares=new Map((summary.heat||[]).map(r=>[r.direction.id,r.periods[index]?.share??null]));
  const readings=new Map((monitoring||[]).map(r=>[r.id,r]));
  for(const [id,entry] of routeMeshes){const share=shares.get(id)??null;entry.lines.forEach(m=>{m.material.color.set(monitoring?(readings.get(id)?.color||'#9fa8a5'):shareColor(share));m.renderOrder=id===selected?4:2;pickables.push(m);});pickables.push(...entry.hits);entry.outlines.forEach(m=>{m.visible=id===selected;m.renderOrder=1;});}
  const paths=[];
  if(monitoring)for(const path of monitoredPaths(bindings,monitoring))paths.push({...path,curve:makeCurve(path.points)});
  else if(summary.dates.length&&summary.totals.classified>0)for(const path of bindings){let sum=0,length=0;for(const s of path.segments){const share=shares.get(s.route);if(share==null)continue;const l=new THREE.Vector3(...s.a).distanceTo(new THREE.Vector3(...s.b));sum+=share*l;length+=l;}
   paths.push({curve:makeCurve(path.points),route:path.id,names:path.names,sources:path.sources,bridge:path.bridge,context:!length,share:length?sum/length:null,motorcycles:path.motorcycles,cars:path.cars,expressway:path.expressway,directionUnknown:path.directionUnknown,highway:path.highway,closed:path.closed});}
  fleet.rebuild(paths,elapsed);
  for(const l of routeLabels){city.remove(l.object);l.el.remove();}routeLabels.length=0;
  const chosen=routeMeshes.get(selected);if(chosen){const p=routeFocusPoint(chosen);if(p){p.y+=.45;routeLabels.push(addLabel(chosen.direction.roadName,p,{className:'selected',route:selected}));}}
  if(monitoring){if(!liveLabels.length){const roads=new Map();for(const [id,entry] of routeMeshes){const name=entry.direction.roadName;if(!roads.has(name))roads.set(name,{id,entry});}for(const [name,{id,entry}] of roads){const p=routeFocusPoint(entry);if(p){p.y+=.35;const l=addLabel(name,p,{className:'live-road',route:id});l.roadName=name;liveLabels.push(l);}}}
   for(const l of liveLabels){const r=readings.get(l.route);l.el.style.borderBottom='3px solid '+(r?.color||'#9fa8a5');l.el.title=l.roadName+' · '+(r?.trafficStatus?.label||'無有效觀測')+'，點選查看方向與資料時間';l.object.visible=mode==='live';}
  }
  sun.color.set(index<3?0xffdfb8:0xfff0d8);sun.intensity=2.8+index*.04;dirty=true;wake();
 }
 function focusRoute(id,fly=true){const entry=routeMeshes.get(id);if(!entry)return;const p=routeFocusPoint(entry);if(p&&fly)flyTo(p,new THREE.Vector3(6,10,12));}
 function flyTo(target,offset){topView=false;controls.minPolarAngle=25*Math.PI/180;controls.maxPolarAngle=70*Math.PI/180;const desired=target.clone();if(innerWidth>800&&!['scenario','live'].includes(mode))desired.x+=1.3;const pos=desired.clone().add(offset);if(reduced){camera.position.copy(pos);controls.target.copy(desired);controls.update();dirty=true;wake();return;}flight={start:performance.now(),from:camera.position.clone(),to:pos,fromTarget:controls.target.clone(),target:desired};wake();}
 function frame(){return fitIslandFrame(bounds,{width:host.clientWidth,height:host.clientHeight});}
 function home(){topView=false;controls.minPolarAngle=25*Math.PI/180;controls.maxPolarAngle=70*Math.PI/180;const mobile=host.clientWidth<800;if(mode==='scenario'){const distance=mobile?70:host.clientWidth<1150?67:49;flyTo(new THREE.Vector3(0,0,0),new THREE.Vector3(.06,.65,.76).normalize().multiplyScalar(distance));return;}flyTo(new THREE.Vector3(0,0,0),new THREE.Vector3(.20,.77,.83).normalize().multiplyScalar(frame().distance));}
 function bird(){flight=null;topView=!topView;controls.maxPolarAngle=topView?Math.PI/2:70*Math.PI/180;controls.minPolarAngle=topView?.01:25*Math.PI/180;if(topView){camera.position.set(0,frame().distance,1);controls.target.set(0,0,0);}else home();dirty=true;wake();return topView;}
 const timeSlots=[],barGeo=new THREE.BoxGeometry(.47,1,.6),bars={car:[],moto:[]},beforeBars={car:[],moto:[]},tokens=[];let scenarioMotion=[];
 const stage=new THREE.Mesh(new THREE.BoxGeometry(24,.45,9.6),material(0xe6dec8));stage.position.y=.1;stage.receiveShadow=true;stage.castShadow=true;sandbox.add(stage);
 for(let i=0;i<14;i++){const x=(i-6.5)*1.55;timeSlots.push(x);const tile=new THREE.Mesh(new THREE.BoxGeometry(1.4,.06,8.8),material(i%2?0xf1ead7:0xece5d0));tile.position.set(x,.37,0);sandbox.add(tile);const label=addLabel(DATA.synthetic.slots[i],new THREE.Vector3(x,.55,4.5),{parent:sandbox});label.el.className='time-label';
  for(const [m,z,col] of [['car',-1.7,0x4e8d79],['moto',.1,0x8195b2]]){
   const before=new THREE.Mesh(barGeo,material(0xcfcbbd));before.position.set(x-.30,.5,z);sandbox.add(before);beforeBars[m].push(before);
   const after=new THREE.Mesh(barGeo,material(col));after.position.set(x+.25,.5,z);sandbox.add(after);bars[m].push(after);
  }
 }
 const modeLabels=[['汽車需求',-1.7],['機車需求',.1],['群體需求去向',2.3]];for(const [text,z] of modeLabels){const l=addLabel(text,new THREE.Vector3(-12.6,.65,z),{parent:sandbox});l.el.className='time-label';}
 for(let i=0;i<4;i++){const token=new THREE.Mesh(new RoundedBoxGeometry(.9,.42,.55,2,.08),material([0xc77d5e,0xb6a468,0x7c9c87,0x8496b2][i]));token.position.set(timeSlots[DATA.synthetic.groups[i].slot],.75,2.2+i*.5);token.castShadow=true;sandbox.add(token);const l=addLabel(DATA.synthetic.groups[i].label,token.position.clone().add(new THREE.Vector3(0,.55,0)),{parent:sandbox});l.el.className='time-label group';tokens.push({mesh:token,label:l});}
 function setScenario(plan,configuration){
  const max=Math.max(...configuration.background.car,...configuration.background.moto,1),maxHeight=3.4;
  for(const m of ['car','moto'])for(let i=0;i<14;i++){const a=configuration.background[m][i]/max*maxHeight,b=plan.after[m][i]/max*maxHeight;beforeBars[m][i].scale.y=Math.max(.008,a);beforeBars[m][i].position.y=.45+a/2;bars[m][i].scale.y=Math.max(.008,b);bars[m][i].position.y=.45+b/2;}
  scenarioMotion=plan.groups.map((g,i)=>{const target=timeSlots[configuration.slots.indexOf(g.to)],from=tokens[i].mesh.position.x;tokens[i].label.el.textContent=g.counts.car+g.counts.moto?`${g.label} 移轉 汽${g.counts.car}／機${g.counts.moto}`:`${g.label} 未移轉`;if(reduced||motionPaused)tokens[i].mesh.position.x=target;return {from,target,start:performance.now()};});dirty=true;wake();
 }
 function setMode(next){mode=next;if(next!=='live')hidePopup();roadInspector.setActive(next==='monitor');deviceLayer.setActive(next==='devices');directionalGroup.visible=next!=='devices';for(const mesh of beacons.values())mesh.visible=next!=='devices';if(next==='devices'){clearRoutes();drawRoutes.key='';}
city.visible=next!=='scenario';sandbox.visible=next==='scenario';[...staticLabels,...routeLabels].forEach(l=>l.object.visible=next!=='scenario'&&(next!=='devices'||!l.gate)&&(next!=='live'||l.className.includes('major')&&!l.gate));liveLabels.forEach(l=>l.object.visible=next==='live');scenarioLabels.forEach(l=>l.object.visible=next==='scenario');home();dirty=true;wake();}
 function resolveLabelCollisions(){const occupied=mode==='devices'?[...document.querySelectorAll('.vd-label')].map(el=>el.getBoundingClientRect()):[];if(popup&&popup.el.style.display!=='none'&&popup.el.style.visibility!=='hidden')occupied.push(popup.el.getBoundingClientRect());const panelRects=[...document.querySelectorAll('.detail-card:not([hidden]),.scenario-card:not([hidden]),.scenario-results:not([hidden]),.scene-heading,#live-road-panel:not([hidden]),#scene-legend:not([hidden])')].filter(el=>el.getClientRects().length).map(el=>el.getBoundingClientRect());
  const all=mode==='scenario'?[...scenarioLabels.filter(l=>l.el.classList.contains('group')),...scenarioLabels.filter(l=>!l.el.classList.contains('group'))]:[...routeLabels,...(mode==='live'?liveLabels:[]),...staticLabels.filter(l=>l.gate),...staticLabels.filter(l=>!l.gate)];for(const l of all){if(!l.object.visible)continue;l.el.style.visibility='visible';const r=l.el.getBoundingClientRect();const hit=[...occupied,...panelRects].some(b=>r.left<b.right+5&&r.right>b.left-5&&r.top<b.bottom+5&&r.bottom>b.top-5);if(hit)l.el.style.visibility='hidden';else occupied.push(r);}
 }
 function animate(now){raf=0;if(!active||document.hidden)return;inFrame=true;const dt=Math.min(.08,(now-(last||now))/1000);last=now;if(!reduced&&!motionPaused)elapsed+=dt;
  if(flight){const t=clamp((now-flight.start)/(flight.duration||800),0,1),ease=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;camera.position.lerpVectors(flight.from,flight.to,ease);controls.target.lerpVectors(flight.fromTarget,flight.target,ease);if(t===1)flight=null;dirty=true;}
  if(held){const {forward,right}=groundAxes(),speed=camera.position.distanceTo(controls.target)*.8*dt,move=right.multiplyScalar(held.x*speed).addScaledVector(forward,held.z*speed);camera.position.add(move);controls.target.add(move);dirty=true;}
  const changed=controls.update();if(clampTarget()||changed)dirty=true;
  if(!reduced&&!motionPaused&&mode!=='scenario'&&mode!=='devices'){fleet.update(elapsed);dirty=true;}
  if(mode==='scenario')for(let i=0;i<scenarioMotion.length;i++){const m=scenarioMotion[i],t=reduced||motionPaused?1:clamp((now-m.start)/950,0,1);tokens[i].mesh.position.x=THREE.MathUtils.lerp(m.from,m.target,t*t*(3-2*t));tokens[i].label.object.position.copy(tokens[i].mesh.position).add(new THREE.Vector3(0,.55,0));if(t<1)dirty=true;}
  if(dirty){renderer.render(scene,camera);labels.render(scene,camera);if(popup)placePopup();const compass=document.querySelector('.compass');if(compass){const a=controls.target.clone().project(camera),b=controls.target.clone().add(new THREE.Vector3(0,0,-1)).project(camera);compass.style.display='inline-block';compass.style.transform=`rotate(${Math.atan2(b.x-a.x,b.y-a.y)*180/Math.PI}deg)`;}resolveLabelCollisions();dirty=false;frameCount++;}
  const moving=!reduced&&!motionPaused&&(mode!=='devices'&&(mode!=='scenario'||scenarioMotion.some(m=>now-m.start<950)));inFrame=false;if(!raf&&(moving||flight||changed||held))raf=requestAnimationFrame(animate);
 }
 function wake(){dirty=true;if(!inFrame&&!raf&&active&&!document.hidden)raf=requestAnimationFrame(animate);}
 controls.addEventListener('change',()=>{roadInspector.hide();wake();});controls.addEventListener('start',()=>{flight=null;roadInspector.hide();});
 // Drag and one-finger moves pan the map; keep the target over the island so the map cannot be lost.
 const panLimit={x:Math.abs(project(bounds[2],cy).x),z:Math.abs(project(cx,bounds[1]).z)};
 function clampTarget(){const t=controls.target,x=clamp(t.x,-panLimit.x,panLimit.x),z=clamp(t.z,-panLimit.z,panLimit.z);if(x===t.x&&z===t.z)return false;camera.position.x+=x-t.x;camera.position.z+=z-t.z;t.x=x;t.z=z;return true;}
 function groundAxes(){const forward=controls.target.clone().sub(camera.position).setY(0);if(forward.lengthSq()<1e-6)forward.set(0,0,-1);forward.normalize();return {forward,right:new THREE.Vector3(-forward.z,0,forward.x)};}
 // Toolbar and keyboard nudges glide from where any running nudge will end, so repeated presses accumulate.
 function glide(target,position,duration=260){if(reduced){camera.position.copy(position);controls.target.copy(target);controls.update();wake();return;}flight={start:performance.now(),duration,from:camera.position.clone(),to:position,fromTarget:controls.target.clone(),target};wake();}
 function panStep(x,z){const target=(flight?flight.target:controls.target).clone(),position=(flight?flight.to:camera.position).clone(),{forward,right}=groundAxes(),d=position.distanceTo(target),to=target.clone().addScaledVector(right,x*d).addScaledVector(forward,z*d);to.x=clamp(to.x,-panLimit.x,panLimit.x);to.z=clamp(to.z,-panLimit.z,panLimit.z);glide(to,position.add(to.clone().sub(target)));}
 function zoomStep(factor){const target=(flight?flight.target:controls.target).clone(),offset=(flight?flight.to:camera.position).clone().sub(target);offset.setLength(clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));glide(target,target.clone().add(offset));}
 function panHold(x,z){held=x||z?{x,z}:null;if(held)flight=null;wake();}
 function placePopup(){const el=popup.el;if(el.style.display==='none')return;const v=popup.object.getWorldPosition(new THREE.Vector3()).project(camera),w=host.clientWidth,h=host.clientHeight,x=(v.x+1)/2*w,y=(1-v.y)/2*h;el.style.visibility=x<0||x>w||y<0||y>h?'hidden':'visible';const cw=el.offsetWidth,ch=el.offsetHeight,gap=22,margin=8,above=y-ch-gap>=margin,below=!above&&y+gap+ch<=h-margin,dx=clamp(x,margin+cw/2,Math.max(margin+cw/2,w-margin-cw/2))-x;
  if(!above&&!below&&!popup.moved){popup.moved=true;const ray=new THREE.Raycaster(),hit=new THREE.Vector3(),anchor=popup.object.getWorldPosition(new THREE.Vector3());ray.setFromCamera(new THREE.Vector2(x/w*2-1,-(Math.min(h-margin,margin+ch+gap+16)/h*2-1)),camera);if(ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-anchor.y),hit)){const shift=anchor.sub(hit).setY(0),target=(flight?flight.target:controls.target).clone().add(shift);glide(target,(flight?flight.to:camera.position).clone().add(shift),420);}}
  const top=above?y-ch-gap:below?y+gap:clamp(y-ch-gap,margin,Math.max(margin,h-margin-ch));el.style.translate=`${dx}px ${top+ch-y}px`;el.classList.toggle('below',below);el.classList.toggle('detached',!above&&!below);el.style.setProperty('--arrow-x',`${cw/2-dx}px`);}
 function showPopup(id,el){if(popup?.route===id&&popup.el===el){wake();return true;}hidePopup();const entry=routeMeshes.get(id),p=entry&&routeFocusPoint(entry);if(!p||!el)return false;p.y+=.45;const object=new CSS2DObject(el);object.center.set(.5,1);object.renderOrder=10;object.position.copy(p);city.add(object);popup={object,el,route:id};wake();return true;}
 function hidePopup(){if(!popup)return;city.remove(popup.object);popup.el.remove();popup=null;wake();}
 let down=null;renderer.domElement.addEventListener('pointerdown',e=>{flight=null;roadInspector.hide();down=e.button===0?{x:e.clientX,y:e.clientY}:null;});renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down.x,e.clientY-down.y)>6||mode==='scenario'){down=null;return;}down=null;const r=renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);const ray=new THREE.Raycaster();ray.setFromCamera(mouse,camera);if(companyPicking){const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.61),new THREE.Vector3());if(point){const lon=cx+point.x/(111320*Math.cos(cy*Math.PI/180)*.005),lat=cy-point.z/(111320*.005);if(lon>=bounds[0]&&lon<=bounds[2]&&lat>=bounds[1]&&lat<=bounds[3]){setCompanyPick(false);onSelect({companyPosition:{lat,lon}});}}return;}if(mode==='devices'){deviceLayer.pick(ray);return;}if(deviceLayer.pick(ray))return;const hit=ray.intersectObjects(pickables,false)[0];if(mode==='monitor'){const road=roadInspector.pick(ray);if(road&&!hit?.object.userData.gate){onSelect({road});return;}}onSelect(!hit?{miss:true}:hit.object.userData.route?{route:hit.object.userData.route}:{gate:hit.object.userData.gate});});
 renderer.domElement.addEventListener('pointermove',e=>{if(companyPicking||mode!=='monitor'||e.buttons||down){roadInspector.hide();return;}const r=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);roadInspector.hover(ray,e.clientX-r.left,e.clientY-r.top);});renderer.domElement.addEventListener('pointerleave',()=>roadInspector.hide());
 // Arrow keys pan like the drag gesture; Shift+arrows rotate; +/- zoom.
 host.addEventListener('keydown',e=>{if(e.target!==host)return;if(['+','=','-','_'].includes(e.key)){e.preventDefault();zoomStep(['+','='].includes(e.key)?.75:1/.75);return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
  if(!e.shiftKey){panStep(e.key==='ArrowLeft'?-.12:e.key==='ArrowRight'?.12:0,e.key==='ArrowUp'?.12:e.key==='ArrowDown'?-.12:0);return;}
  flight=null;const offset=camera.position.clone().sub(controls.target),s=new THREE.Spherical().setFromVector3(offset);if(e.key==='ArrowLeft')s.theta-=.13;if(e.key==='ArrowRight')s.theta+=.13;if(e.key==='ArrowUp')s.phi-=.08;if(e.key==='ArrowDown')s.phi+=.08;s.phi=clamp(s.phi,controls.minPolarAngle,controls.maxPolarAngle);camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(s));wake();});
 let lastWidth=0,lastHeight=0;
 function resize(){const width=host.clientWidth,height=host.clientHeight;if(width<=0||height<=0)return;const changed=lastWidth&&Math.abs(width-lastWidth)+Math.abs(height-lastHeight)>4;lastWidth=width;lastHeight=height;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);labels.setSize(width,height);if(changed)home();wake();}
 const observer=new ResizeObserver(resize);observer.observe(host);document.addEventListener('visibilitychange',()=>{last=0;wake();});
 resize();camera.position.set(12,42,47);controls.target.set(0,0,0);home();
 return {setCompanyPick,setCompanyPosition,companyState(){return {picking:companyPicking,position:companyPosition};},drawRoutes,setRoadContext:roadInspector.setContext,selectRoad(id){roadInspector.select(id);wake();},roadState:roadInspector.inspect,focusRoad(id){const r=roadInspector.records.get(id);if(r)flyTo(new THREE.Vector3(...r.a).lerp(new THREE.Vector3(...r.b),.5),new THREE.Vector3(6,10,12));},drawDevices:deviceLayer.draw,setDevicesVisible:deviceLayer.setActive,focusDevice:deviceLayer.focus,deviceState:deviceLayer.inspect,focusRoute,home,bird,panStep,panHold,zoomStep,showPopup,hidePopup,setScenario,setMode,project,renderer,camera,controls,hasRoute(id){return !!routeMeshes.get(id)?.lines.length;},vehicleState(){return {...fleet.inspect(),network:{paths:network.paths.length,sourceCount:network.sourceCount,edgeCount:network.edgeCount}};},
  setReduced(value){reduced=value;if(value&&flight){camera.position.copy(flight.to);controls.target.copy(flight.target);flight=null;}wake();},
  setPaused(value){motionPaused=value;wake();},setActive(value){active=value;if(!value)roadInspector.hide();last=0;if(!value&&raf){cancelAnimationFrame(raf);raf=0;}else wake();},
  stats(){return {drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,frameCount,routeCount:routeMeshes.size,mode,reduced,motionPaused,active,seed:DATA.presentation.seed};},
  dispose(){active=false;cancelAnimationFrame(raf);observer.disconnect();controls.dispose();scene.traverse(o=>{if(o.isMesh){o.geometry?.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material?.dispose();}});renderer.dispose();host.querySelector('.road-hover')?.remove();labels.domElement.remove();renderer.domElement.remove();}
 };
}

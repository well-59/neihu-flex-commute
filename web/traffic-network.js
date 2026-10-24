// Geometry-based display network. It does not certify legal turns or estimate traffic demand.
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const coordinateKey=p=>`${p[0].toFixed(6)},${p[2].toFixed(6)}`;
export function clipRoadSegment(a,b,box){let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1],ps=[-dx,dx,-dy,dy],qs=[a[0]-box[0],box[2]-a[0],a[1]-box[1],box[3]-a[1]];for(let i=0;i<4;i++){if(!ps[i]){if(qs[i]<0)return null;}else{const t=qs[i]/ps[i];if(ps[i]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;}}return [[a[0]+dx*lo,a[1]+dy*lo],[a[0]+dx*hi,a[1]+dy*hi]];}
export function roadProjection(bbox){const cx=(bbox[0]+bbox[2])/2,cy=(bbox[1]+bbox[3])/2;return (p,y=.65)=>[(p[0]-cx)*111320*Math.cos(cy*Math.PI/180)*.005,y,(cy-p[1])*111320*.005];}
const dir=(a,b)=>{const l=Math.hypot(b[0]-a[0],b[2]-a[2])||1;return [(b[0]-a[0])/l,(b[2]-a[2])/l];};
const expressway=p=>['motorway','motorway_link','trunk','trunk_link'].includes(p.highway);
const tag=(p,name)=>p[name]??p.tags?.[name];
const truthy=value=>value===true||['yes','true','1'].includes(String(value).toLowerCase());
const levelOf=p=>Number(tag(p,'layer'))||0;
const gradeOf=p=>`${levelOf(p)}:${truthy(tag(p,'bridge'))?'bridge':truthy(tag(p,'tunnel'))?'tunnel':'surface'}`;
const permission=(p,mode,direction)=>{
 let allowed=!['footway','path','cycleway','pedestrian','steps','bridleway','construction','proposed'].includes(p.highway)&&!(mode==='motorcycle'&&expressway(p));
 for(const key of ['access','vehicle','motor_vehicle',mode]){
  const value=tag(p,`${key}:${direction}`)??tag(p,key);
  if(value!=null)allowed=['yes','designated','permissive','official'].includes(String(value).toLowerCase());
  // Time-dependent access needs a rule evaluator; do not animate it as unrestricted.
  if(tag(p,`${key}:conditional`)||tag(p,`${key}:${direction}:conditional`))allowed=false;
 }
 if(mode==='motorcycle'&&expressway(p)&&tag(p,`motorcycle:${direction}`)==null&&tag(p,'motorcycle')==null)return false;
 return allowed;
};
function oneWay(p,mode){
 let value=tag(p,`oneway:${mode}`)??tag(p,'oneway:motor_vehicle')??tag(p,'oneway');
 if(value==null)value=tag(p,'junction')==='roundabout'?'yes':'no';
 if(tag(p,'oneway:conditional')||tag(p,`oneway:${mode}:conditional`)||tag(p,'oneway:motor_vehicle:conditional'))return 'unknown';
 value=String(value).toLowerCase();
 return ['yes','true','1'].includes(value)?'forward':['-1','reverse'].includes(value)?'backward':['no','false','0'].includes(value)?'both':'unknown';
}
export function buildDisplayNetwork(geo){
 const project=roadProjection(geo.bbox),edges=[],nodes=new Map(),seen=new Set(),references=new Map();
 const roads=geo.features.filter(f=>f.geometry.type==='LineString'&&f.properties.highway&&!['water','river'].includes(f.properties.kind));
 // A shared OSM endpoint is evidence of an approach. Coincident coordinates alone
 // cannot bridge levels, and distinct OSM nodes never become an intersection.
 for(const f of roads){const refs=f.properties.nodeRefs||[];for(let i=0;i<refs.length;i++){
  const ref=String(refs[i]);if(!references.has(ref))references.set(ref,[]);
  references.get(ref).push({grade:gradeOf(f.properties),level:levelOf(f.properties),endpoint:i===0||i===refs.length-1});
 }}
 const transitionRefs=new Set([...references].filter(([,items])=>items.length>1&&items.every(i=>i.endpoint)&&Math.max(...items.map(i=>i.level))-Math.min(...items.map(i=>i.level))<=1).map(([ref])=>ref));
 for(const f of roads){const p=f.properties,level=levelOf(p),y=.65+level*.42,grade=gradeOf(p),refs=p.nodeRefs||[];
  const carWay=oneWay(p,'motorcar'),motoWay=oneWay(p,'motorcycle');
  const modes=direction=>({cars:permission(p,'motorcar',direction)&&(carWay==='both'||carWay===direction),motorcycles:permission(p,'motorcycle',direction)&&(motoWay==='both'||motoWay===direction)});
  const forward=modes('forward'),backward=modes('backward'),unknown=carWay==='unknown'||motoWay==='unknown',both=unknown||(forward.cars||forward.motorcycles)&&(backward.cars||backward.motorcycles);
  const key=(point,index,original)=>{
   const ref=refs[index];
   // Clipped edges get their own same-grade boundary nodes, never an out-of-bounds OSM identity.
   if(ref!=null&&Math.abs(original[0]-point[0])<1e-10&&Math.abs(original[1]-point[1])<1e-10)return `node:${ref}${transitionRefs.has(String(ref))?'':`@${grade}`}`;
   return `coord:${coordinateKey(project(point,y))}@${grade}`;
  };
  for(let i=1;i<f.geometry.coordinates.length;i++){const originals=[f.geometry.coordinates[i-1],f.geometry.coordinates[i]],pair=clipRoadSegment(...originals,geo.bbox);if(!pair)continue;const a=project(pair[0],y),b=project(pair[1],y);if(distance(a,b)<.0001)continue;
   const ak=key(pair[0],i-1,originals[0]),bk=key(pair[1],i,originals[1]),physical=`${p.osmId||f.id}:${i}:${ak}|${bk}`;
   if(seen.has(physical))continue;seen.add(physical);
   for(const [k,v,ref] of [[ak,a,refs[i-1]],[bk,b,refs[i]]]){if(!nodes.has(k))nodes.set(k,{heights:[],point:v,out:[],in:[],sourceRef:k.startsWith('node:')?String(ref):null});nodes.get(k).heights.push(y);}
   const add=(from,to,allowed)=>{const e={id:edges.length,from,to,name:p.name||'未命名道路',highway:p.highway,bridge:truthy(tag(p,'bridge')),layer:level,source:p.osmId||f.id,both,...allowed,expressway:expressway(p),directionUnknown:carWay==='unknown'||motoWay==='unknown',restrictionIds:[]};edges.push(e);nodes.get(from).out.push(e);nodes.get(to).in.push(e);};
   if(forward.cars||forward.motorcycles)add(ak,bk,forward);
   if(backward.cars||backward.motorcycles)add(bk,ak,backward);
   if(!forward.cars&&!forward.motorcycles&&!backward.cars&&!backward.motorcycles){
    add(carWay==='backward'?bk:ak,carWay==='backward'?ak:bk,{cars:false,motorcycles:false});
    if(unknown)add(bk,ak,{cars:false,motorcycles:false});
   }
  }
 }
 for(const n of nodes.values())n.point[1]=n.heights.reduce((a,b)=>a+b,0)/n.heights.length;
 const restrictions=geo.restrictions||[];
 const applicableRestrictions=e=>restrictions.filter(r=>{
  const from=(r.members||[]).find(m=>m.role==='from'&&m.type==='way'),via=(r.members||[]).filter(m=>m.role==='via');
  return String(from?.ref)===String(e.source)&&via.length&&(via.some(m=>m.type!=='node')||via.some(m=>String(m.ref)===nodes.get(e.to).sourceRef));
 });
 for(const e of edges)e.restrictionIds=applicableRestrictions(e).map(r=>r.osmId||r.id).filter(id=>id!=null);
 function restricted(e,next){
  let prohibited=false;
  for(const r of applicableRestrictions(e)){const to=(r.members||[]).find(m=>m.role==='to'&&m.type==='way'),via=(r.members||[]).filter(m=>m.role==='via');
   const values=['restriction','restriction:motorcar','restriction:motor_vehicle','restriction:motorcycle'].map(k=>r.tags?.[k]).filter(Boolean);
   // Via-way and conditional restrictions need route/time context. End this display trip.
   if(via.some(m=>m.type!=='node')||r.tags?.['restriction:conditional']){prohibited=true;continue;}
   if(values.some(value=>value.startsWith('no_')&&String(to?.ref)===String(next.source)||value.startsWith('only_')&&String(to?.ref)!==String(next.source)))prohibited=true;
  }
  return prohibited;
 }
 const successor=e=>{const n=nodes.get(e.to),v=dir(nodes.get(e.from).point,n.point);
  // Count all outgoing branches before access/angle filtering. A lone plausible
  // branch is not evidence that an unknown junction permits the turn.
  const branches=n.out.filter(o=>o.to!==e.from);if(branches.length!==1)return null;
  const candidate=branches[0],w=dir(n.point,nodes.get(candidate.to).point);
  if(candidate.cars!==e.cars||candidate.motorcycles!==e.motorcycles||candidate.expressway!==e.expressway||v[0]*w[0]+v[1]*w[1]<=-.35||restricted(e,candidate))return null;
  return candidate;
 };
 const next=new Map(edges.map(e=>[e.id,successor(e)])),incoming=new Map();for(const e of edges){const n=next.get(e.id);if(n)incoming.set(n.id,(incoming.get(n.id)||0)+1);}
 const used=new Set(),paths=[];
 const emit=start=>{const list=[];let e=start;while(e&&!used.has(e.id)){used.add(e.id);list.push(e);const n=next.get(e.id);e=n&&incoming.get(n.id)===1?n:null;}
  const points=[nodes.get(list[0].from).point,...list.map(v=>nodes.get(v.to).point)].map(p=>p.slice());
  const shifted=points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],v=dir(a,b),both=list[Math.min(i,list.length-1)].both,offset=both?.052:0;return [p[0]-v[1]*offset,p[1]+.008,p[2]+v[0]*offset];});
  const length=shifted.slice(1).reduce((s,p,i)=>s+distance(p,shifted[i]),0);
  paths.push({id:'osm:'+start.id,points:shifted,center:points,edges:list.map(e=>e.id),names:[...new Set(list.map(e=>e.name))],sources:[...new Set(list.map(e=>e.source))],segmentNames:list.map(e=>e.name),bridge:list.some(e=>e.bridge),cars:list.every(e=>e.cars),motorcycles:list.every(e=>e.motorcycles),expressway:list[0].expressway,directionUnknown:list.some(e=>e.directionUnknown),restrictionIds:[...new Set(list.flatMap(e=>e.restrictionIds))],length,both:list[0].both,highway:list[0].highway,closed:distance(points[0],points.at(-1))<.001});
 };
 for(const e of edges)if(incoming.get(e.id)!==1&&!used.has(e.id))emit(e);for(const e of edges)if(!used.has(e.id))emit(e);
 return {paths,edgeCount:edges.length,sourceCount:new Set(edges.map(e=>e.source)).size,project,restrictions};
}
function pointSegment(p,a,b){const dx=b[0]-a[0],dz=b[2]-a[2],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[2]-a[2]-t*dz);}
// One primary reading per OSM segment. The selectable candidates retain overlapping
// devices with the same legitimate geometry without adding or summing their volumes.
export function matchObservations(network,directions){
 const normalized=name=>name.replace(/[一二三四五六七八九十0-9]+段/g,'').replace(/\s/g,'');
 const sameRoad=(a,b)=>a===b||((!a.endsWith('段')||!b.endsWith('段'))&&normalized(a)===normalized(b));
 const observed=[];for(const d of directions){const shape=d.geometry?.shape;if(!shape)continue;for(let i=1;i<shape.length;i++){const a=network.project(shape[i-1]),b=network.project(shape[i]);if(distance(a,b)<.001)continue;observed.push({id:d.id,name:d.roadName,a,b,v:dir(a,b),expressway:d.scope?.category==='expressway',osmWayIds:d.geometry.osmWayIds||[]});}}
 return network.paths.map(path=>{const segments=[];for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],mid=a.map((n,k)=>(n+b[k])/2),v=dir(a,b),candidates=new Map();let best=null,score=.22;
   for(const o of observed){const reviewed=o.osmWayIds.length>0;if(o.expressway!==path.expressway||(reviewed?!path.sources.some(id=>o.osmWayIds.includes(String(id))):!sameRoad(path.segmentNames[i-1],o.name)))continue;const alignment=v[0]*o.v[0]+v[1]*o.v[1];if(alignment<.65)continue;const dist=pointSegment(mid,o.a,o.b);if(dist>.16)continue;const same=reviewed||path.names.includes(o.name),candidate=dist+(same?0:.09);if(candidate<.22&&(!candidates.has(o.id)||candidate<candidates.get(o.id)))candidates.set(o.id,candidate);if(candidate<score){score=candidate;best=o.id;}}
   const routes=[...candidates].sort((a,b)=>a[1]-b[1]).map(([id])=>id);
   segments.push({a,b,route:best,routes});}
  return {...path,segments};});
}

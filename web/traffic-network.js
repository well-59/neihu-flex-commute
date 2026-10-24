// Geometry-based display network. It does not certify legal turns or estimate traffic demand.
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const key=p=>`${p[0].toFixed(6)},${p[2].toFixed(6)}`;
export function clipRoadSegment(a,b,box){let lo=0,hi=1;const dx=b[0]-a[0],dy=b[1]-a[1],ps=[-dx,dx,-dy,dy],qs=[a[0]-box[0],box[2]-a[0],a[1]-box[1],box[3]-a[1]];for(let i=0;i<4;i++){if(!ps[i]){if(qs[i]<0)return null;}else{const t=qs[i]/ps[i];if(ps[i]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;}}return [[a[0]+dx*lo,a[1]+dy*lo],[a[0]+dx*hi,a[1]+dy*hi]];}
export function roadProjection(bbox){const cx=(bbox[0]+bbox[2])/2,cy=(bbox[1]+bbox[3])/2;return (p,y=.65)=>[(p[0]-cx)*111320*Math.cos(cy*Math.PI/180)*.005,y,(cy-p[1])*111320*.005];}
const dir=(a,b)=>{const l=Math.hypot(b[0]-a[0],b[2]-a[2])||1;return [(b[0]-a[0])/l,(b[2]-a[2])/l];};
export function buildDisplayNetwork(geo){
 const project=roadProjection(geo.bbox),edges=[],nodes=new Map(),seen=new Set();
 for(const f of geo.features){const p=f.properties;if(f.geometry.type!=='LineString'||!p.highway||['water','river'].includes(p.kind))continue;
  const level=Number(p.layer)||0,y=.65+Math.max(0,level)*.42;
  for(let i=1;i<f.geometry.coordinates.length;i++){const pair=clipRoadSegment(f.geometry.coordinates[i-1],f.geometry.coordinates[i],geo.bbox);if(!pair)continue;let a=project(pair[0],y),b=project(pair[1],y);if(distance(a,b)<.0001)continue;
   const forward=p.oneway!=='-1',both=!['yes','1','-1'].includes(p.oneway),ak=key(a),bk=key(b),physical=[ak,bk].sort().join('|')+'@'+level;
   if(seen.has(physical))continue;seen.add(physical);
   for(const [k,v] of [[ak,a],[bk,b]]){if(!nodes.has(k))nodes.set(k,{heights:[],point:v,out:[],in:[]});nodes.get(k).heights.push(y);}
   const add=(from,to)=>{const e={id:edges.length,from,to,name:p.name||'未命名道路',highway:p.highway,bridge:!!p.bridge,layer:level,source:p.osmId||f.id,both,motorcycles:!['motorway','motorway_link','trunk','trunk_link'].includes(p.highway)};edges.push(e);nodes.get(from).out.push(e);nodes.get(to).in.push(e);};
   add(forward?ak:bk,forward?bk:ak);if(both)add(bk,ak);
  }
 }
 // Shared source vertices join approaches to bridges. Crossing lines without a shared vertex do not join.
 for(const n of nodes.values())n.point[1]=n.heights.reduce((a,b)=>a+b,0)/n.heights.length;
 const successor=e=>{const n=nodes.get(e.to),v=dir(nodes.get(e.from).point,n.point);const candidates=n.out.filter(o=>o.to!==e.from&&o.motorcycles===e.motorcycles&&(()=>{const w=dir(n.point,nodes.get(o.to).point);return v[0]*w[0]+v[1]*w[1]>-.35;})());return candidates.length===1?candidates[0]:null;};
 const next=new Map(edges.map(e=>[e.id,successor(e)])),incoming=new Map();for(const e of edges){const n=next.get(e.id);if(n)incoming.set(n.id,(incoming.get(n.id)||0)+1);}
 const used=new Set(),paths=[];
 const emit=start=>{const list=[];let e=start;while(e&&!used.has(e.id)){used.add(e.id);list.push(e);const n=next.get(e.id);e=n&&incoming.get(n.id)===1?n:null;}
  const points=[nodes.get(list[0].from).point,...list.map(v=>nodes.get(v.to).point)].map(p=>p.slice());
  const shifted=points.map((p,i)=>{const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],v=dir(a,b),both=list[Math.min(i,list.length-1)].both,offset=both?.052:0;return [p[0]-v[1]*offset,p[1]+.008,p[2]+v[0]*offset];});
  const length=shifted.slice(1).reduce((s,p,i)=>s+distance(p,shifted[i]),0);
  paths.push({id:'osm:'+start.id,points:shifted,center:points,edges:list.map(e=>e.id),names:[...new Set(list.map(e=>e.name))],sources:[...new Set(list.map(e=>e.source))],segmentNames:list.map(e=>e.name),bridge:list.some(e=>e.bridge),motorcycles:list.every(e=>e.motorcycles),length,both:list[0].both,highway:list[0].highway,closed:distance(points[0],points.at(-1))<.001});
 };
 for(const e of edges)if(incoming.get(e.id)!==1&&!used.has(e.id))emit(e);for(const e of edges)if(!used.has(e.id))emit(e);
 return {paths,edgeCount:edges.length,sourceCount:new Set(edges.map(e=>e.source)).size,project};
}
function pointSegment(p,a,b){const dx=b[0]-a[0],dz=b[2]-a[2],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[2]-a[2]-t*dz);}
// Each OSM segment receives at most one matching observation direction. No second TDX road is drawn.
export function matchObservations(network,directions){
 const normalized=name=>name.replace(/[一二三四五六七八九十0-9]+段/g,'').replace(/\s/g,'');
 const sameRoad=(a,b)=>a===b||((!a.endsWith('段')||!b.endsWith('段'))&&normalized(a)===normalized(b));
 const observed=[];for(const d of directions){const shape=d.geometry?.shape;if(!shape)continue;for(let i=1;i<shape.length;i++){const a=network.project(shape[i-1]),b=network.project(shape[i]);if(distance(a,b)<.001)continue;observed.push({id:d.id,name:d.roadName,a,b,v:dir(a,b),expressway:d.scope?.category==='expressway'});}}
 return network.paths.map(path=>{const segments=[];for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],mid=a.map((n,k)=>(n+b[k])/2),v=dir(a,b);let best=null,score=.22;
   for(const o of observed){if(o.expressway===path.motorcycles||!sameRoad(path.segmentNames[i-1],o.name))continue;const alignment=v[0]*o.v[0]+v[1]*o.v[1];if(alignment<.65)continue;const dist=pointSegment(mid,o.a,o.b);if(dist>.16)continue;const same=path.names.includes(o.name);const candidate=dist+(same?0:.09);if(candidate<score){score=candidate;best=o.id;}}
   segments.push({a,b,route:best});}
  return {...path,segments};});
}

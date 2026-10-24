import {NEIHU_REGION} from './data/neihu-region.js';

// Even-odd polygon test. Coordinates are the saved official VD coordinates;
// a district decision is not a claim about the legal jurisdiction of a device.
function inRing([x,y], ring) {
 let inside = false;
 for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
  const [ax,ay]=ring[i],[bx,by]=ring[j];
  if ((ay>y)!==(by>y) && x<(bx-ax)*(y-ay)/(by-ay)+ax) inside=!inside;
 }
 return inside;
}
function inDistrict(position) {
 if (!Number.isFinite(position?.lon)||!Number.isFinite(position?.lat)) return false;
 const p=[position.lon,position.lat],g=NEIHU_REGION.geometry;
 const polygons=g.type==='MultiPolygon'?g.coordinates:[g.coordinates];
 return polygons.some(rings=>inRing(p,rings[0])&&!rings.slice(1).some(ring=>inRing(p,ring)));
}
const key=d=>JSON.stringify([d.linkId,d.bearing,d.roadName]);
const validShape=d=>Array.isArray(d?.geometry?.shape)&&d.geometry.shape.length>=2&&d.geometry.shape.every(p=>Array.isArray(p)&&p.length>=2&&p.slice(0,2).every(Number.isFinite));
// Reviewed name exception: this official westbound expressway link follows the
// layer-3 堤頂大道出口匝道, not the adjacent ground-level 南京東路六段.
// Explicit source-way identity still requires the normal geometry/direction test.
const reviewedWays={'V6121A0:2000700100400A':['51813000']};

// Keep every device/direction. Historical ranking representatives deliberately
// omit roads/detectors, so they cannot serve as current monitoring coverage.
export function buildMonitoredSummary(inventory, history) {
 const references=history?.directions||[],byId=new Map(),byLink=new Map();
 for (const d of references) {
  if (!validShape(d)) continue;
  byId.set(d.id,[...(byId.get(d.id)||[]),d]);
  byLink.set(key(d),[...(byLink.get(key(d))||[]),d]);
 }
 const rows=(inventory?.rows||[]).filter(d=>inDistrict(d.position)).map(row=>{
  const direct=(byId.get(row.id)||[]).find(d=>key(d)===key(row));
  const candidates=byLink.get(key(row))||[];
  // Reuse a LinkID only when all supplied official references agree on shape.
  const uniqueShapes=new Set(candidates.map(d=>JSON.stringify(d.geometry.shape)));
  const reference=direct||(uniqueShapes.size===1?candidates[0]:null);
  const geometry=reference?structuredClone(reference.geometry):null;
  if(geometry&&reviewedWays[row.id])geometry.osmWayIds=reviewedWays[row.id].slice();
  const geometryProvenance=reference?{
   method:direct?'exact-current-direction':'exact-link-direction',
   sourceId:reference.id,linkId:row.linkId,bearing:row.bearing,roadName:row.roadName,
   source:'saved-official-tdx-link-geometry',
   note:direct?'現行 VD、LinkID、方向與路名逐筆相符':'相同 LinkID、方向與路名的官方線形；非鄰近道路推測'
  }:null;
  return {...reference,...row,geometry,geometryProvenance,geometryState:geometry?'mapped':'unmapped',
   scope:{...reference?.scope,included:true,status:'district',category:reference?.scope?.category||'monitoring',district:'neihu',reason:'官方內湖區界與現行 VD 座標分類；非歷史入園代表方向篩選'},
   isRepresentative:true,representativeId:row.id,
   days:reference?.days||[]};
 });
 const roadNames=[...new Set(rows.map(d=>d.roadName))].sort((a,b)=>a.localeCompare(b,'zh-TW'));
 const points=rows.flatMap(d=>[...(d.geometry?.shape||[]),[d.position.lon,d.position.lat]]);
 const bbox=points.length?[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]:null;
 return {rows,representatives:rows,coverage:{directions:rows.length,devices:new Set(rows.map(d=>d.vdId)).size,
  roadNames,roads:roadNames.length,mapped:rows.filter(d=>d.geometry).length,unmapped:rows.filter(d=>!d.geometry).length,
  bbox,scope:'內湖區 VD 座標分類',boundary:NEIHU_REGION.provenance}};
}

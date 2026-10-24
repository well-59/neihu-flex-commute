export const bearingNames={N:'北向',S:'南向',E:'東向',W:'西向',NE:'東北向',NW:'西北向',SE:'東南向',SW:'西南向'};
export function insideBounds(position,bbox){
 return Number.isFinite(position?.lon)&&Number.isFinite(position?.lat)&&position.lon>=bbox[0]&&position.lon<=bbox[2]&&position.lat>=bbox[1]&&position.lat<=bbox[3];
}
export function deviceInventory(snapshot,history,bbox){
 const devices=new Map(),references=new Map(history.directions.map(d=>[d.id,d]));
 for(const row of snapshot?.rows||[]){
  if(!devices.has(row.vdId))devices.set(row.vdId,{id:row.vdId,roadName:row.roadName,position:row.position,inMap:insideBounds(row.position,bbox),links:[]});
  const device=devices.get(row.vdId),d=references.get(row.id);
  const matches=!!(d&&d.linkId===row.linkId&&d.bearing===row.bearing&&d.roadName===row.roadName);
  device.links.push({...row,reference:matches?d:null});
 }
 return [...devices.values()].sort((a,b)=>a.roadName.localeCompare(b.roadName,'zh-TW')||a.id.localeCompare(b.id));
}
// Only associate an exact-ID/direction reference. No nearest-road identification or snapping.
export function nearestOnReference(position,shape){
 if(!Number.isFinite(position?.lon)||!Number.isFinite(position?.lat)||!Array.isArray(shape)||shape.length<2)return null;
 const mx=111320*Math.cos(position.lat*Math.PI/180),my=111320;let best=null;
 for(let i=1;i<shape.length;i++){
  const a=shape[i-1],b=shape[i];if(![...a,...b].every(Number.isFinite))continue;
  const ax=(a[0]-position.lon)*mx,ay=(a[1]-position.lat)*my,dx=(b[0]-a[0])*mx,dy=(b[1]-a[1])*my;
  const length=dx*dx+dy*dy,t=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)):0;
  const distance=Math.hypot(ax+t*dx,ay+t*dy);
  if(!best||distance<best.distance)best={distance,point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]};
 }
 return best;
}

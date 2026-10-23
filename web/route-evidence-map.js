const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const trafficColor=share=>share===null?'#66757e':['#70cfb4','#d7c279','#efa771','#ea775c','#db4d64'][Math.min(4,Math.floor(share*4))];
const pathFor=points=>points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
// Keep surveyed endpoints fixed; taper direction separation near junctions.
export function directedGeometry(points,offset=3){
 const clean=points.filter((p,i)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>.001);
 if(clean.length<2)return {center:clean,shifted:clean,arrow:[]};
 const lengths=[0];for(let i=1;i<clean.length;i++)lengths.push(lengths[i-1]+Math.hypot(clean[i][0]-clean[i-1][0],clean[i][1]-clean[i-1][1]));
 const total=lengths.at(-1),samples=[];
 // Resampling also gives two-point segments a visible offset without moving their endpoints.
 for(let i=1;i<clean.length;i++){
  const distance=lengths[i]-lengths[i-1],steps=Math.ceil(distance/6);
  for(let j=0;j<steps;j++){const t=j/steps;samples.push({point:[clean[i-1][0]+(clean[i][0]-clean[i-1][0])*t,clean[i-1][1]+(clean[i][1]-clean[i-1][1])*t],distance:lengths[i-1]+distance*t});}
 }
 samples.push({point:clean.at(-1),distance:total});
 const shifted=samples.map(({point:p,distance},i)=>{
  const a=samples[Math.max(0,i-1)].point,b=samples[Math.min(samples.length-1,i+1)].point,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
  const taper=Math.min(1,distance/14,(total-distance)/14),shift=offset*Math.max(0,taper);
  return [p[0]-dy/len*shift,p[1]+dx/len*shift];
 });
 const at=fraction=>{
  const target=total*fraction;let i=1;while(i<samples.length-1&&samples[i].distance<target)i++;
  const t=(target-samples[i-1].distance)/(samples[i].distance-samples[i-1].distance);
  return shifted[i-1].map((v,k)=>v+(shifted[i][k]-v)*t);
 };
 return {center:clean,shifted,arrow:total>=18?[at(.55),at(.7)]:[]};
}
export function renderEvidenceMap(data,summary,index,selected,base,scene,locations={records:[]}) {
 if(!base||!scene)return '<p>道路底圖尚未載入。</p>';
 const {point}=scene.projection(base.bbox),features=new Map();
 // The neutral road bed uses the source geometry, including roads absent from the OSM extract.
 for(const d of summary.representatives){if(d.geometry?.shape?.length>1&&!features.has(d.linkId))features.set(d.linkId,d);}
 let svg='<defs><marker id="route-map-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#edf4ef"/></marker></defs><g class="route-road-beds" pointer-events="none">';
 for(const d of features.values())svg+=`<path data-tdx-road="${esc(d.linkId)}" aria-label="${esc(d.roadName)} · TDX 道路線形，非路況" d="${pathFor(d.geometry.shape.map(p=>point(...p)))}" fill="none" stroke="#344c58" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
 svg+='</g><g class="route-observation-layer">';
 for(const d of [...summary.representatives].sort((a,b)=>Number(a.id===selected)-Number(b.id===selected))){
  if(!d.geometry?.shape?.length)continue;
  const geometry=directedGeometry(d.geometry.shape.map(p=>point(...p))),path=pathFor(geometry.shifted);
  const p=summary.heat.find(r=>r.direction.id===d.id)?.periods[index],share=p?.share??null;
  const title=`${d.roadName} ${d.bearing} · ${d.vdId} · ${share===null?'此時段無有效分級':`低速時間占比 ${(share*100).toFixed(1)}%，${p.congested}/${p.classified} 分鐘`}`;
  svg+=`<g data-map-route="${esc(d.id)}" role="button" tabindex="0" aria-label="${esc(title)}" class="route-map-link ${selected===d.id?'selected':''}" data-share="${share??''}"><title>${esc(title)}</title>${selected===d.id?`<path d="${path}" fill="none" class="route-selection-outline" stroke="#ffffff" stroke-width="9" opacity=".9"/>`:''}<path class="route-flow-line" d="${path}" fill="none" stroke="${trafficColor(share)}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" ${share===null?'stroke-dasharray="5 4"':''}/>${geometry.arrow.length?`<path class="route-direction-arrow" d="${pathFor(geometry.arrow)}" fill="none" stroke="${trafficColor(share)}" stroke-width="2" marker-end="url(#route-map-arrow)" pointer-events="none"/>`:''}<path d="${path}" fill="none" stroke="transparent" stroke-width="12"/></g>`;
 }
 svg+='</g>';
 const labelFeatures=summary.representatives.filter(d=>d.geometry?.shape?.length>1).map(d=>({id:d.linkId,properties:{name:d.roadName,routeId:d.id},geometry:{type:'LineString',coordinates:d.geometry.shape}}));
 return scene.render(base,locations,{overlay:svg,labelFeatures,selectedRoute:selected})
  .replace('線條不代表流量、車速或可通行路徑。','彩色線為歷史低速時間占比；白框為目前查看。')
  .replace('主要路網摘錄；道路寬度為繪圖樣式。','道路補線：TDX；線寬與方向偏移為顯示樣式。');
}

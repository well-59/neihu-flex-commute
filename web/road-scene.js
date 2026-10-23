/* Geometry is a static OSM extract; only official VD points carry traffic observations. */
(function(root){
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function projection(bbox) {
    const cos=Math.cos((bbox[1]+bbox[3])/2*Math.PI/180),w=(bbox[2]-bbox[0])*111320*cos,h=(bbox[3]-bbox[1])*111320;
    const scale=Math.min(820/w,560/h),left=(920-w*scale)/2,top=(640-h*scale)/2;
    return {point:(lon,lat)=>[left+(lon-bbox[0])*111320*cos*scale,top+(bbox[3]-lat)*111320*scale],scale};
  }
  function pathData(feature,project){
    const lines=feature.geometry.type==='Polygon'?feature.geometry.coordinates:[feature.geometry.coordinates];
    return lines.map(line=>line.map((p,i)=>{const [x,y]=project(...p);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join(' ')+(feature.geometry.type==='Polygon'?'Z':'')).join(' ');
  }
  function render(data,locations,options={}){
    const {point,scale}=projection(data.bbox);
    const offset={G1:[-240,-55],G2:[-280,-65],G3:[-140,32],G4:[-118,-50],G5:[30,-42],G6:[-132,30]};
    const boxes=locations.records.map(l=>{const [x,y]=point(l.lon,l.lat),[dx,dy]=offset[l.gate];return {x:Math.max(15,Math.min(752,x+dx)),y:Math.max(15,Math.min(565,y+dy)),w:150,h:43};});
    let svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 680" role="group" aria-label="內湖道路與橋梁地理位置圖，北方朝上"><defs><clipPath id="road-clip"><rect x="8" y="8" width="904" height="620" rx="12"/></clipPath><pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#21343d" stroke-width=".6"/></pattern></defs><rect x="8" y="8" width="904" height="620" rx="12" fill="#0d1c25"/><rect x="8" y="8" width="904" height="620" rx="12" fill="url(#map-grid)"/><g clip-path="url(#road-clip)">';
    const geometry=data.features.slice().sort((a,b)=>{
      const order=f=>['water','river'].includes(f.properties.kind)?-10:Number(f.properties.layer)||0;
      return order(a)-order(b);
    });
    geometry.filter(f=>['water','river'].includes(f.properties.kind)).forEach(f=>{
      svg+=`<path d="${pathData(f,point)}" class="map-water ${f.properties.kind}"/>`;
    });
    const roads=geometry.filter(f=>!['water','river'].includes(f.properties.kind));
    // Complete each elevation's casings before its surfaces so shared OSM nodes stay joined.
    const layers=new Map();
    for(const f of roads){const layer=Number(f.properties.layer)||0;if(!layers.has(layer))layers.set(layer,[]);layers.get(layer).push(f);}
    for(const [layer,features] of layers){
      svg+=`<g data-road-layer="${layer}"><g class="road-casings" pointer-events="none">`;
      for(const f of features)svg+=`<g class="road-feature ${f.properties.bridge?'bridge':'road'} ${f.properties.focus?'focus':''}"><path d="${pathData(f,point)}" class="road-casing"/></g>`;
      svg+='</g><g class="road-surfaces">';
      for(const f of features){const p=f.properties,d=pathData(f,point),title=p.name||'未命名道路';
        svg+=`<g data-road-id="${f.id}" class="road-feature ${p.bridge?'bridge':'road'} ${p.focus?'focus':''}" role="button" tabindex="0" aria-label="${escape(title)}，${p.bridge?'橋梁或高架段':'道路段'}"><title>${escape(title)} · ${p.bridge?'橋梁／高架':'道路'} · OSM ${f.id}</title><path d="${d}" class="road-surface"/><path d="${d}" class="road-hit"/></g>`;
      }
      svg+='</g></g>';
    }
    svg+=options.overlay||'';
    svg+='</g>';
    // Label the longest visible segment for each named focus road. All other segments remain inspectable.
    const labels=new Map();
    for(const f of [...roads.filter(f=>f.properties.focus||f.properties.highway==='motorway'),...(options.labelFeatures||[])]){
      const pts=f.geometry.coordinates.map(p=>point(...p));let best=null;
      for(let i=1;i<pts.length;i++){
        const a=pts[i-1],b=pts[i],x=(a[0]+b[0])/2,y=(a[1]+b[1])/2;
        if(x<60||x>850||y<50||y>590)continue;
        const len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!best||len>best.len)best={x,y,len,id:f.id,name:f.properties.name,bridge:f.properties.bridge,routeId:f.properties.routeId};
      }
      if(best){
        const prior=labels.get(best.name),preferred=best.routeId&&(!prior?.routeId||best.routeId===options.selectedRoute);
        if(!prior||preferred||(Boolean(best.routeId)===Boolean(prior.routeId)&&prior.routeId!==options.selectedRoute&&best.len>prior.len))labels.set(best.name,best);
      }
    }
    const offsets={'民權大橋':[0,-16],'成美橋':[-12,-18],'成功橋':[28,10],'麥帥一橋':[-36,14],'麥帥二橋':[-22,-10],'堤頂大道一段':[-38,0],'堤頂大道二段':[-20,-12],'環東大道':[6,20],'民權東路六段':[15,-13],'成功路二段':[28,-10],'新明路':[8,18],'內湖路一段':[5,-16]};
    const occupied=boxes.concat(locations.records.map(l=>{const [x,y]=point(l.lon,l.lat);return {x:x-16,y:y-16,w:32,h:32};})),overlap=(a,b)=>a.x<b.x+b.w+5&&a.x+a.w+5>b.x&&a.y<b.y+b.h+5&&a.y+a.h+5>b.y;
    const ordered=[...labels.values()].sort((a,b)=>Number(b.routeId===options.selectedRoute)-Number(a.routeId===options.selectedRoute)||Number(b.name.includes('橋'))-Number(a.name.includes('橋')));
    for(const l of ordered){
      const candidates=[offsets[l.name]||[0,-8],[0,-25],[0,25],[-45,-22],[45,-22],[-55,26],[55,26],[0,-45],[0,45],[-90,0],[90,0]];
      let chosen=null;
      for(const [dx,dy] of candidates){const x=l.x+dx,y=l.y+dy,box={x:x-l.name.length*6,y:y-12,w:l.name.length*12,h:16};if(box.x>12&&box.x+box.w<900&&box.y>24&&box.y<590&&!occupied.some(b=>overlap(box,b))){chosen={x,y,box};break;}}
      // A segment still exposes its name on focus/click when the overview has no label space.
      if(!chosen)continue;
      const {x,y,box}=chosen;occupied.push(box);
      svg+=`<g class="map-road-label ${l.bridge?'bridge':''}" ${l.routeId?`data-map-label="${escape(l.routeId)}"`:`data-road-id="${escape(l.id)}"`} role="button" tabindex="0" aria-label="查看${escape(l.name)}路段">${Math.hypot(x-l.x,y-l.y)>18?`<path d="M${l.x},${l.y}L${x},${y-5}" class="label-leader"/>`:''}<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle">${escape(l.name)}</text></g>`;
    }
    const name={G1:'民權東路六段',G2:'堤頂大道',G3:'環東大道',G4:'內湖路一段',G5:'成功路二段',G6:'新明路・代理點'};
    for(const l of locations.records){
      const [x,y]=point(l.lon,l.lat),[dx,dy]=offset[l.gate],bx=Math.max(15,Math.min(752,x+dx)),by=Math.max(15,Math.min(565,y+dy));
      svg+=`<g id="city-${l.gate}" class="city-gate map-gate" role="button" tabindex="0" aria-label="${name[l.gate]} VD觀測點"><path d="M${x},${y} L${bx+70},${by+22}" class="point-leader"/><circle cx="${x}" cy="${y}" r="13" class="vd-ring"/><circle class="gate-beacon" cx="${x}" cy="${y}" r="7" fill="#79ddbf"/><rect x="${bx}" y="${by}" width="150" height="43" rx="7"/><text x="${bx+9}" y="${by+15}" class="vd-name">${l.gate} ${name[l.gate]}</text><text x="${bx+9}" y="${by+33}" class="vd-point-caption">VD 點位</text><text x="${bx+140}" y="${by+34}" text-anchor="end" class="gate-value">—</text></g>`;
    }
    svg+=`<g class="north-arrow" transform="translate(868 45)"><text y="-13" text-anchor="middle">N</text><path d="M0-3L-7 18L0 13L7 18Z"/></g><g transform="translate(32 605)" class="map-scale"><path d="M0-5V0H${1000*scale}V-5"/><text x="${500*scale}" y="-8" text-anchor="middle">1 km</text></g><text x="32" y="653" class="map-attribution">道路／河流：© OpenStreetMap contributors · ODbL　設備位置：臺北市 VD</text><text x="32" y="671" class="map-attribution">主要路網摘錄；道路寬度為繪圖樣式。線條不代表流量、車速或可通行路徑。</text></svg>`;
    return svg;
  }
  const api={projection,pathData,render};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NeihuRoadScene=api;
})(typeof window!=='undefined'?window:globalThis);

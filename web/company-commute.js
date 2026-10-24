import {periodEvidence} from './route-evidence-model.js';
import {insideBounds,bearingNames} from './vd-location-model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:1}):'—';
const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export const sectorNames={N:'北方',E:'東方',S:'南方',W:'西方',C:'公司位置附近'};
export function arrivalWindow(time){
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('請輸入有效上班時間');
 const [h,m]=time.split(':').map(Number),end=h*60+m;
 if(end<15)throw Error('目前不支援跨日前 15 分鐘的比較');
 return {start:end-15,end,label:`${clock(end-15)}–${clock(end)}`};
}
export function relativePosition(company,point){
 const valid=p=>Number.isFinite(p?.lat)&&Number.isFinite(p?.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
 if(!valid(company)||!valid(point))throw Error('位置座標無效');
 const r=Math.PI/180,a=company.lat*r,b=point.lat*r,dl=(point.lon-company.lon)*r,dp=b-a;
 const h=Math.sin(dp/2)**2+Math.cos(a)*Math.cos(b)*Math.sin(dl/2)**2;
 const distance=6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
 const bearing=(Math.atan2(Math.sin(dl)*Math.cos(b),Math.cos(a)*Math.sin(b)-Math.sin(a)*Math.cos(b)*Math.cos(dl))/r+360)%360;
 return {distance,azimuth:bearing,sector:distance<1?'C':['N','E','S','W'][Math.floor((bearing+45)/90)%4]};
}
export function companyEvidence(summary,company,bbox){
 const window=arrivalWindow(company.time);
 if(!['half','any'].includes(company.rule))throw Error('未知低速門檻');
 if(company.radius!=='map'&&(!Number.isFinite(company.radius)||company.radius<=0||company.radius>10000))throw Error('半徑須大於 0 且不超過 10 公里');
 if(!insideBounds(company,bbox))throw Error('請選擇目前內湖底圖範圍內的公司位置');
 const knownMinutes=Math.max(0,Math.min(window.end,570)-Math.max(window.start,420));
 const sectors=Object.fromEntries(Object.keys(sectorNames).map(k=>[k,[]]));let excludedPositions=0,outside=0;const seen=new Set();
 for(const d of summary.rows){
  if(seen.has(d.id))continue;seen.add(d.id);
  if(!insideBounds(d.position,bbox)){excludedPositions++;continue;}
  const location=relativePosition(company,d.position);
  if(company.radius!=='map'&&location.distance>company.radius){outside++;continue;}
  const periods=Array.from({length:10},(_,i)=>{const p=periodEvidence(d,summary.dates,i,summary.requested),start=420+i*15,end=start+15;
   const overlap=Math.max(0,Math.min(window.end,end)-Math.max(window.start,start));
   return {...p,index:i,start,end,label:`${clock(start)}–${clock(end)}`,overlap,hot:p.share!==null&&(company.rule==='any'?p.congested>0:p.share>=.5)};
  });
  sectors[location.sector].push({id:d.id,vdId:d.vdId,roadName:d.roadName,bearing:d.bearing,position:d.position,...location,periods,hot:periods.filter(p=>p.hot),hits:periods.filter(p=>p.hot&&p.overlap>0)});
 }
 const rows=Object.values(sectors).flat();for(const group of Object.values(sectors))group.sort((a,b)=>Number(!!b.hits.length)-Number(!!a.hits.length)||a.distance-b.distance||a.id.localeCompare(b.id));
 const hits=rows.filter(r=>r.hits.length),readable=rows.filter(r=>r.periods.some(p=>p.overlap>0&&p.classified>0));
 return {source:'HISTORICAL',company:{...company},window,sectors,rows:rows.length,excludedPositions,outside,hits:hits.length,readable:readable.length,knownMinutes,partialSlots:window.start%15!==0,status:hits.length?'DISCUSS_FLEX':(!readable.length||knownMinutes<15?'INSUFFICIENT_DATA':'NO_TRIGGER'),policyEffect:null};
}
export function renderCompanyCommute(summary,company,bbox,sourceTime){
 let result=null,error='';
 if(company.lat!==null&&company.lon!==null){try{result=companyEvidence(summary,company,bbox);}catch(e){error=e.message;}}
 const radio=(value,label)=>`<option value="${value}" ${company.rule===value?'selected':''}>${label}</option>`;
 const form=`<section class="company-commute"><p class="eyebrow">COMPANY / 上班前 15 分鐘</p><h2>公司哪一側，與上班時間撞上低速時段？</h2><p>先選公司位置與上班時間，查看周邊東、南、西、北方的歷史路況。</p><form id="company-form"><div class="company-location"><label for="company-query">公司名稱或地址</label><div class="company-search-row"><input id="company-query" type="search" maxlength="160" value="${esc(company.locationQuery||'')}" placeholder="例如：公司名稱、臺北市內湖區瑞光路…" autocomplete="off"><button type="button" id="company-search">搜尋位置</button></div><p class="company-search-note">搜尋目前內湖底圖範圍；按搜尋才將文字傳送至 Photon。圖資 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>。</p><p id="company-search-status" role="status"></p><div id="company-search-results" aria-label="地點搜尋結果"></div><p id="company-selected-location">${Number.isFinite(company.lat)&&Number.isFinite(company.lon)?'已選位置：'+esc(company.locationLabel||'地圖選定位置')+' · '+esc(company.locationNote||'可在地圖調整位置。'):'尚未選定位置；搜尋後請點選符合的結果。'}</p></div><input name="lat" id="company-lat" type="hidden" value="${Number.isFinite(company.lat)?company.lat:''}"><input name="lon" id="company-lon" type="hidden" value="${Number.isFinite(company.lon)?company.lon:''}"><label>上班時間<input name="time" id="company-time" type="time" required value="${esc(company.time)}"></label><label>觀察範圍<select name="radius" id="company-radius">${[1000,2000,3000,5000,'map'].map(v=>`<option value="${v}" ${company.radius===v?'selected':''}>${v==='map'?'目前底圖全部':v/1000+' 公里'}</option>`).join('')}</select></label><label>觸發門檻<select name="rule" id="company-rule">${radio('half','低速時間占比 ≥ 50%')}${radio('any','有低速紀錄即列入')}</select></label><button type="submit">分析上班前路況</button><button type="button" id="company-pick">在城市地圖選位置 ↗</button></form><p id="company-error" role="alert">${esc(error)}</p>`;
 if(!result)return {result,html:form+`<p class="company-empty">${error?'請調整位置或時間後重新分析。':'請輸入公司名稱或地址搜尋，也可以直接在地圖上點選。'}</p></section>`};
 const headline=result.status==='DISCUSS_FLEX'?`建議討論彈性工時 · ${result.hits} 個路段測點方向符合重疊規則`:result.status==='INSUFFICIENT_DATA'?'資料不足，尚不能判斷是否需要彈性工時':'目前沒有符合重疊規則的路段；不代表一定順暢';
 const rowHtml=r=>`<article class="company-road ${r.hits.length?'has-overlap':''}"><h4>${esc(r.roadName)} · ${esc(bearingNames[r.bearing]||r.bearing)}</h4><small>${esc(r.vdId)} · 距公司約 ${fmt(r.distance)} 公尺（直線）</small><p>${r.hits.length?`與上班前視窗重疊：${r.hits.map(p=>`<b>${p.label}</b>（色格重疊 ${p.overlap} 分鐘）`).join('、')}`:'上班前視窗未觸發；以下列出其他歷史低速時段。'}</p><div class="company-hot-slots">${r.hot.map(p=>`<button type="button" data-company-route="${esc(r.id)}" data-company-period="${p.index}" class="${p.overlap?'overlap':''}" title="低速 ${p.congested}／可判讀 ${p.classified} 分鐘；完整度 ${p.expected?fmt(p.classified/p.expected*100)+'%':'—'}"><span>${p.label}</span><b>${fmt(p.share*100)}%</b></button>`).join('')}</div>${r.hits.map(p=>`<small>${p.label}：低速 ${p.congested}／可判讀 ${p.classified} 分鐘 · 完整度 ${p.expected?fmt(p.classified/p.expected*100)+'%':'—'} · ${p.highDays}／${p.observedDays} 個可判讀日至少半數時間低速</small>`).join('')}</article>`;
 const sectors=Object.entries(sectorNames).filter(([key])=>key!=='C'||result.sectors.C.length).map(([key,name])=>{const rows=result.sectors[key],hot=rows.filter(r=>r.hot.length),hit=rows.filter(r=>r.hits.length);return `<section class="company-sector" data-company-sector="${key}"><header><h3>${name}</h3><span>${hit.length} 個重疊方向／${rows.length} 個可定位方向</span></header>${hot.filter(r=>r.hits.length).map(rowHtml).join('')}${hot.some(r=>!r.hits.length)?`<details><summary>其他低速路段與時段（${hot.filter(r=>!r.hits.length).length}）</summary>${hot.filter(r=>!r.hits.length).map(rowHtml).join('')}</details>`:''}${!hit.length?'<p class="muted">此方位目前沒有符合上班前重疊規則的路段。</p>':''}<small>${rows.filter(r=>!r.periods.some(p=>p.overlap&&p.classified)).length} 個方向在上班前視窗缺少可判讀資料；缺資料不算順暢。</small></section>`;}).join('');
 return {result,html:form+`<div class="company-recommendation" role="status" data-status="${result.status}"><strong>${headline}</strong><p>${esc(company.time)} 上班 → 檢查 ${result.window.label}。${result.status==='DISCUSS_FLEX'?'可優先與可能經過這些路段的員工討論自願彈性到班，再以試辦資料驗證。':'請確認資料涵蓋與員工實際路線後再討論。'}</p><p>${company.rule==='half'?'以所選日期同一時段低速時間占比至少 50% 為門檻':'只要同一時段有低速紀錄即觸發'}；這是可調整的討論規則，非官方壅塞標準。${result.knownMinutes<15?'上班前視窗部分或全部超出 07:00–09:30，多日資料不足。':''}${result.partialSlots?'時間未對齊 15 分鐘格：只確認色格重疊，無法確定低速分鐘是否落在重疊片段。':''}</p></div><div class="company-sectors">${sectors}</div><p class="company-basis">方位依歷史 VD 測點相對公司位置分成四個 90° 扇區，與車輛行駛方向不同；不是員工來向或已驗證的到公司路線。公司位置由使用者選定，僅保留在此頁工作狀態。使用上方日期／假日篩選，查全部代表方向再套用距離範圍，不受單一路段下拉選擇限制。</p><p class="company-basis">快照 ${esc(sourceTime)} · ${summary.requested.length} 個所選日 · ${result.rows} 個範圍內方向／${result.readable} 個在視窗內有可判讀資料；另有 ${result.excludedPositions} 個方向缺座標或在底圖外。低速＝專案定義 E／F 級；歷史色格並非現在路況，也未估計省時或改善幅度。點時段可進入原路段 A／B 比較。</p></section>`};
}

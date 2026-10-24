import {deviceInventory,nearestOnReference,bearingNames} from './vd-location-model.js';
import {freshness} from './traffic-monitor-model.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=value=>Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-TW',{hour12:false,timeZone:'Asia/Taipei'}):'未提供';
const stateNames={fresh:'時間在 3 分鐘內',stale:'樣本已過期',future:'時間異常',missing:'沒有觀測時間'};
const coord=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lon)?`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`:'未提供';

export function createDeviceView({DATA,getCity}){
 let snapshot=DATA.geography.inventory,devices=deviceInventory(snapshot,DATA.observations,DATA.geography.roads.bbox),active=false;
 let selected=devices.find(d=>d.id==='VQBUL20')?.id||devices[0]?.id,linkId=null,loading=false,error='',request=null,updated=false;
 const card=document.createElement('aside');card.id='vd-detail';card.className='detail-card';card.hidden=true;
 card.innerHTML='<p class="eyebrow">VD / 設備位置與偵測方向</p><h2 id="vd-road-name"></h2><p id="vd-device-id" class="vd-device-id"></p><div id="vd-directions" class="vd-directions"></div><p id="vd-lanes"></p><p id="vd-location" class="muted"></p><a id="vd-external" target="_blank" rel="noopener noreferrer">在 OpenStreetMap 查看座標 ↗</a><div class="vd-chain"><span>設備 VD</span><strong id="vd-chain-device"></strong><span>↓ 偵測此方向的路段 LinkID</span><strong id="vd-link-id"></strong><span id="vd-chain-reference"></span></div><p id="vd-map-note" class="boundary"></p><details open><summary>觀測時間與資料狀態</summary><dl id="vd-times" class="vd-times"></dl><p class="muted">更新週期不等於實際連續運作時間。設備啟用日、每天開始／結束監控時間：來源未提供。</p></details><details><summary>TDX 與這份資料的關係</summary><p id="vd-tdx"></p><p class="muted">VD 是設備；TDX 是資料流通平台。相同 ID 對照不是兩份獨立量測。彩色線是既有 TDX 路段線形，不是感測範圍。</p><a target="_blank" rel="noopener noreferrer" href="https://tdx.transportdata.tw/api-service/swagger/basic/7f07d940-91a4-495d-9465-1c9df89d709c">TDX 路況 API 文件 ↗</a></details>';
 $('scene-workspace').append(card);
 const controls=document.createElement('section');controls.id='vd-controls';controls.className='timeline';controls.hidden=true;
 controls.innerHTML='<div class="filters"><label>搜尋設備／道路<input id="vd-search" type="search" placeholder="例如：瑞光路、VQBUL20"></label><label class="route-picker">VD 設備<select id="vd-device-select"></select></label><button id="vd-refresh">更新設備與觀測</button><span id="vd-status" role="status"></span></div><p id="vd-summary" class="muted"></p><details id="vd-list"><summary>設備、方向與對應路段清單</summary><div class="table-scroll"><table id="vd-table"></table></div></details><details><summary>實際來源位置與更新時間</summary><div class="table-scroll"><table id="vd-sources"></table></div><p class="muted">位置與車道取自 VD.xml；最近觀測時間取自 VDLive.xml；本機接收時間另外記錄。這個頁面手動更新，未啟用背景輪詢。</p></details>';
 $('timeline').after(controls);
 const savedLegend=$('scene-legend').innerHTML;
 function rebuild(){devices=deviceInventory(snapshot,DATA.observations,DATA.geography.roads.bbox);if(!devices.some(d=>d.id===selected))selected=devices[0]?.id;}
 function render(){
  if(!active)return;
  const device=devices.find(d=>d.id===selected),link=device?.links.find(l=>l.linkId===linkId)||device?.links[0];linkId=link?.linkId||null;
  getCity()?.drawDevices(devices,selected,link);
  const filtered=devices.filter(d=>[d.id,d.roadName,...d.links.flatMap(l=>[l.linkId,l.bearing,bearingNames[l.bearing]])].join(' ').toLowerCase().includes($('vd-search').value.trim().toLowerCase()));
  $('vd-device-select').innerHTML=devices.map(d=>`<option value="${esc(d.id)}">${esc(d.roadName)} · ${esc(d.id)}${d.inMap?'':'（圖外）'}</option>`).join('');$('vd-device-select').value=selected||'';
  $('vd-road-name').textContent=device?.roadName||'尚無設備資料';$('vd-device-id').textContent=device?.id||'—';
  $('vd-directions').innerHTML=(device?.links||[]).map(l=>`<button data-vd-link="${esc(l.linkId)}" aria-pressed="${l.linkId===linkId}">道路${esc(bearingNames[l.roadDirection]||l.roadDirection||'未提供')}</button>`).join('');
  $('vd-lanes').textContent=link?`道路${bearingNames[link.roadDirection]||link.roadDirection||'未提供'}；路段方位${bearingNames[link.bearing]||link.bearing} · 偵測 ${link.laneCount??'未知'} 車道 / 實際 ${link.actualLaneCount??'未知'} 車道`:'沒有方向資料';
  $('vd-location').textContent='官方座標（緯度、經度）：'+coord(device?.position);
  const p=device?.position,located=Number.isFinite(p?.lon)&&Number.isFinite(p?.lat);$('vd-external').hidden=!located;
  if(located)$('vd-external').href=`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=19/${p.lat}/${p.lon}`;
  $('vd-chain-device').textContent=selected||'—';$('vd-link-id').textContent=linkId||'未提供';
  const reference=link?.reference,section=reference?.geometry?.sectionId,nearest=nearestOnReference(p,reference?.geometry?.shape);
  $('vd-chain-reference').textContent=reference?`↓ 已對應既有 TDX 線形${section?'；歷史 SectionID：'+section:''}`:'↓ 尚無相同 ID／方向的 TDX 線形對照';
  $('vd-map-note').textContent=!device?'未提供位置':!device.inMap?'此設備超出目前 3D 底圖範圍；請使用上方座標連結定位。':reference?`藍線＝此 LinkID 的既有 TDX 線形；橘色箭頭＝公布路段方位。${nearest?'測點與該線形最近距離約 '+Math.round(nearest.distance)+' 公尺。':''}點位不吸附道路，虛線僅表示對照關係；不代表偵測範圍或精確車道位置。`:'點位已依官方座標標示；箭頭是公布路段方位。缺少可核對線形，不用鄰近道路代替。';
  const vdSource=snapshot?.sources?.VD,liveSource=snapshot?.sources?.VDLive;
  const rows=[['設備清單更新',clock(vdSource?.updateTime)],['最近觀測',clock(link?.dataCollectTime)],['分鐘資料發布',clock(liveSource?.updateTime)],['本機接收這批資料',clock(liveSource?.fetchedAt||snapshot?.fetchedAt)],['名目發布週期',liveSource?.updateInterval?`${liveSource.updateInterval} 秒`:'未提供'],['觀測時間狀態',stateNames[freshness(link?.dataCollectTime)]],['設備狀態碼',link?.status??'未提供'],['基本檢查',link?.basicValid?'通過；不含逐車道錯誤旗標':link?.reasons?.join('、')||'未取得']];
  $('vd-times').innerHTML=rows.map(([k,v])=>`<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('');
  $('vd-tdx').textContent=reference?`此 VDID＋LinkID＋方向與專案 TDX 歷史快照一致。歷史觀測範圍 ${DATA.observations.meta.requestedStart}–${DATA.observations.meta.requestedEnd}，${DATA.observations.meta.timeStart}–${DATA.observations.meta.timeEnd}；快照建立 ${clock(DATA.observations.provenance.generatedAt)}。目前此頁的設備與分鐘資料來自臺北市公開 XML，未即時呼叫 TDX。`:'既有 TDX 歷史快照沒有相同設備／路段／方向的對照。目前使用臺北市公開 XML；不能據此判定 TDX 完全沒有此設備，尚需另查。';
  $('vd-summary').textContent=`本批 ${devices.length} 個 VD／${snapshot?.rows?.length||0} 個設備方向；${devices.filter(d=>d.inMap).length} 個設備位於 3D 底圖內，${devices.filter(d=>!d.inMap).length} 個在圖外。搜尋符合 ${filtered.length} 個設備。座標是官方公布位置，未作現場測量。`;
  $('vd-table').innerHTML='<thead><tr><th>VD 設備／道路</th><th>道路方向／路段方位</th><th>LinkID</th><th>偵測／實際車道</th><th>地圖／TDX 對照</th><th>最近觀測</th></tr></thead><tbody>'+filtered.flatMap(d=>d.links.map(l=>`<tr class="${d.id===selected&&l.linkId===linkId?'selected':''}"><th><button data-vd-id="${esc(d.id)}" data-vd-link="${esc(l.linkId)}">${esc(d.id)} · ${esc(d.roadName)}</button></th><td>${esc(bearingNames[l.roadDirection]||l.roadDirection||'未提供')}／${esc(bearingNames[l.bearing]||l.bearing)}</td><td>${esc(l.linkId)}</td><td>${l.laneCount??'—'} / ${l.actualLaneCount??'—'}</td><td>${d.inMap?'圖內':'圖外'}／${l.reference?'有線形對照':'待補線形'}</td><td>${esc(clock(l.dataCollectTime))}</td></tr>`)).join('')+'</tbody>';
  $('vd-sources').innerHTML='<thead><tr><th>來源</th><th>官方 URL</th><th>來源更新時間</th></tr></thead><tbody>'+Object.entries(snapshot?.sources||{}).map(([name,s])=>`<tr><th>${esc(name)}</th><td><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.url)}</a></td><td>${esc(clock(s.updateTime))}</td></tr>`).join('')+'</tbody>';
  $('vd-status').textContent=loading?'正在取得官方清單…':error||(updated?'已手動更新；不自動輪詢':'顯示已保存盤點；不代表現在路況');$('vd-refresh').disabled=loading||!!window.ISLAND_DATA;
  $('mode-tag').textContent='設備位置 · '+(updated?'本次手動取得資料':'已保存的來源盤點');
  for(const [id,label,value] of [['stat-days','盤點 VD 設備',devices.length],['stat-roads','地圖內 / 全部',`${devices.filter(d=>d.inMap).length} / ${devices.length}`],['stat-coverage','設備方向',snapshot?.rows?.length||0]]){$(id).previousElementSibling.textContent=label;$(id).textContent=value;}
  $('runtime-status').textContent='VD 位置與路段對照 · 本頁不播放車流';
  if(window.trafficIslandState)Object.assign(window.trafficIslandState,{view:'devices',source:'DEVICE_INVENTORY'});
  window.vdLocationState={selected,linkId,count:devices.length,inMap:devices.filter(d=>d.inMap).length,active,referenceMatched:!!reference,snapshotTime:snapshot?.fetchedAt,device};
 }
 function select(id,nextLink=null,fly=true){if(!devices.some(d=>d.id===id))return;selected=id;linkId=nextLink;render();if(fly)getCity()?.focusDevice(id);}
 card.onclick=e=>{const b=e.target.closest('[data-vd-link]');if(b)select(selected,b.dataset.vdLink,false);};
 $('vd-table').onclick=e=>{const b=e.target.closest('[data-vd-id]');if(b)select(b.dataset.vdId,b.dataset.vdLink);};
 $('vd-device-select').onchange=()=>select($('vd-device-select').value);
 $('vd-search').oninput=()=>{$('vd-list').open=true;render();};
 $('vd-refresh').onclick=async()=>{if(loading||window.ISLAND_DATA)return;loading=true;error='';request=new AbortController();const timeout=setTimeout(()=>request?.abort(),50000);render();try{const response=await fetch('/api/monitoring',{cache:'no-store',signal:request.signal});if(!response.ok)throw Error('請確認本機預覽服務與網路。');const next=await response.json();if(next.schemaVersion!==1||!next.rows?.length||next.sources?.VD?.status!=='PARSED')throw Error('設備清單未取得；保留原本盤點與時間。');snapshot=next;updated=true;rebuild();if(next.sources.VDLive?.status!=='PARSED')error='設備已更新，但分鐘觀測未取得。';}catch(e){error=e.name==='AbortError'?'更新已中止或逾時；保留原本盤點。':e.message;}finally{clearTimeout(timeout);request=null;loading=false;render();}};
 function setActive(value){active=value;card.hidden=!value;controls.hidden=!value;
  if(value){$('scene-title').innerHTML='這個數字，<br><em>在哪裡量到？</em>';$('scene-subtitle').textContent='點 VD，沿著設備、方向與路段追溯來源。';$('scene-legend').innerHTML='<span><i style="background:#237e9b"></i>VD 官方座標</span><span><i style="background:#e66e3e"></i>已選 VD／偵測方向</span><span>藍線＝TDX 對應線形 · 虛線＝位置對照，非感測範圍</span>';render();}
  else{request?.abort();$('scene-legend').innerHTML=savedLegend;if(window.vdLocationState)window.vdLocationState.active=false;}
 }
 return {setActive,render,select};
}

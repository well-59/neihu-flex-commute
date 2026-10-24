import {monitoringRows,freshness,congestionHistory,TRAFFIC_STATES} from './traffic-monitor-model.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':Number(n).toLocaleString('zh-TW',{maximumFractionDigits:1});
const clock=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-TW',{hour12:false,timeZone:'Asia/Taipei'}):'無觀測時間';
const age=value=>{const n=(Date.now()-Date.parse(value))/1000;return !Number.isFinite(n)?'時間未知':n< -90?'來源時間超前':n<60?'1 分鐘內':`${Math.max(1,Math.floor(n/60))} 分鐘前`;};
const states={fresh:'有新近觀測',stale:'觀測已過期',future:'來源時間異常',invalid:'資料未通過檢查',missing:'尚無觀測'};
const bearings={N:'北向',S:'南向',E:'東向',W:'西向',NE:'東北向',NW:'西北向',SE:'東南向',SW:'西南向'};
const directionLabel=d=>bearings[d?.bearing]||d?.bearing||'方向待確認';
const slot=i=>`${String(7+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`,slotRange=i=>`${slot(i)}–${slot(i+1)}`;
const shareColor=v=>v===null?'#c9cec6':['#548f78','#b9b36a','#ddab64','#d58257','#c65f50'][Math.min(4,Math.floor(v*4))];
const pct=v=>`${Math.round(v*100)}%`;

export function createMonitor({summary,getCity,onState,history}){
 let active=false,snapshot=null,selected=summary.rows[0]?.id,timer=null,busy=false,lastAttempt=0,error='',request=null,lastSceneKey='',query='',popupOpen=false,popupKey='',armed=null;
 // Weekday mornings of the saved snapshot; holidays follow the replay default and are excluded.
 const holidays=new Set(history?.holidays?.dates?.map(d=>d.date)||[]),historyDates=(history?.coverage?.availableDates||[]).filter(d=>!holidays.has(d)),historyLevels=history?.meta?.congestionLevels||[];
 const historyRange=historyDates.length?`${historyDates[0]}–${historyDates.at(-1).slice(5)} · ${historyDates.length} 個平日 07:00–09:30`:'無歷史快照';
 const workspace=$('scene-workspace'),roadNames=[...new Set(summary.rows.map(d=>d.roadName))].sort((a,b)=>a.localeCompare(b,'zh-TW'));
 const detail=document.createElement('aside');detail.id='live-detail';detail.className='detail-card';detail.hidden=true;detail.setAttribute('aria-label','所選監控方向資訊');
 detail.innerHTML='<div class="live-detail-heading"><p class="eyebrow">SELECTED ROAD / 道路觀測</p><button id="live-detail-toggle" aria-expanded="true" aria-controls="live-detail-content" title="收合路段資訊">−</button></div><h2 id="live-name">等待來源</h2><p id="live-direction" class="muted"></p><div id="live-detail-content"><div id="live-status" class="live-status" role="status"></div><div class="detail-value"><strong id="live-speed">—</strong><span id="live-speed-basis">km/h · 尚無速度</span></div><p id="live-grade-basis" class="live-grade-basis"></p><div class="live-numbers"><div><span>汽車類 S＋L＋T</span><strong id="live-cars">—</strong><small>車次／觀測分鐘</small></div><div><span>機車 M</span><strong id="live-motos">—</strong><small>車次／觀測分鐘</small></div></div><section class="live-history" aria-labelledby="live-history-title"><h3 id="live-history-title">近一個月易塞時段</h3><p class="live-history-range">'+esc(historyRange)+'（歷史，非即時）</p><ol id="live-history-hot"></ol><div id="live-history-bars" class="live-history-bars" aria-hidden="true"></div><div class="live-history-axis" aria-hidden="true"><span>07:00</span><span>08:15</span><span>09:30</span></div><p id="live-history-speed" class="live-history-speed"></p></section><p id="live-reading"></p><dl class="live-metadata"><dt>觀測時間</dt><dd id="live-time"></dd><dt>偵測車道</dt><dd id="live-lanes"></dd><dt>資料來源</dt><dd>臺北市開放交通資料 · VD／路段旅行速度</dd><dt>對照識別</dt><dd id="live-source"></dd></dl><p id="live-geometry" class="boundary"></p><p class="live-animation-note">移動車輛為分鐘流量分級示意，以共同 4 倍時間播放；不是逐車 GPS、排隊長度或導航建議。</p></div>';
 workspace.append(detail);
 const panel=document.createElement('aside');panel.id='live-road-panel';panel.className='live-road-panel';panel.hidden=true;panel.setAttribute('aria-label','全部有 VD 監控的道路');
 panel.innerHTML=`<button id="live-list-toggle" class="live-list-toggle" aria-expanded="true" aria-controls="live-road-content"><span>監控道路 <b>${roadNames.length}</b></span><span class="live-collapse-icon">−</span></button><div id="live-road-content"><label class="live-search-label" for="live-road-search">搜尋道路、方向或 VD</label><div class="live-search"><input id="live-road-search" type="search" placeholder="例如：文德路" autocomplete="off"><button id="live-search-clear" aria-label="清除道路搜尋" hidden>×</button></div><p id="live-road-count" class="muted" role="status"></p><div id="live-road-list">${roadNames.map(name=>`<details class="live-road-group" data-road="${esc(name)}" ${name===summary.rows[0]?.roadName?'open':''}><summary><span>${esc(name)}</span><small>${summary.rows.filter(d=>d.roadName===name).length} 方向</small></summary><div>${summary.rows.filter(d=>d.roadName===name).map(d=>`<button class="live-road-option" data-live-route="${esc(d.id)}" aria-pressed="false"><span class="live-route-dot"></span><span class="live-route-copy"><strong>${esc(directionLabel(d))}</strong><small>${esc(d.vdId)}</small></span><span class="live-route-reading">—</span></button>`).join('')}</div></details>`).join('')}</div><p id="live-search-empty" class="muted" hidden>沒有符合的監控道路。試試道路名稱或 VD 編號。</p><p class="live-list-note">清單只列有 VD 的方向；道路色帶表示對應路段觀測，其他路段不推估。</p></div>`;
 workspace.append(panel);
 // Phones keep the map in view: a second tap on the selected road opens this card beside it.
 const popup=document.createElement('div');popup.className='map-popover';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','所選路段小卡');
 popup.addEventListener('pointerdown',e=>e.stopPropagation());
 popup.addEventListener('click',e=>{const action=e.target.closest('[data-popover]')?.dataset.popover;if(action==='close')setPopup(false);if(action==='detail'){setPopup(false);setDetailOpen(true);detail.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}});
 const bar=document.createElement('section');bar.id='live-controls';bar.className='timeline live-source-strip';bar.hidden=true;
 bar.innerHTML='<div class="live-connection-row"><div><span class="live-source-dot"></span><span id="live-connection" role="status"></span></div><button id="live-refresh">更新觀測 ↻</button><details class="live-source-details"><summary>來源與判讀依據</summary><p id="live-inventory"></p><p>每 60 秒查詢；以來源觀測時間判定，超過 3 分鐘停用。官方路段級別須有適用組別及精確對照；依既有組別試算與本地速度色帶會分別標示，不當作官方發布等級。</p><div class="table-scroll"><table id="live-source-table"></table></div><h3>這次來源包含的道路</h3><div class="table-scroll"><table id="live-roads-table"></table></div><p>公開來源無逐車道錯誤旗標，僅通過設備狀態、車道數、車種與數值檢查。機車欄位為零不證明完整偵測所有機車。轉向、偵測範圍及道路通行規則仍待逐路核對；此頁不提供導航。</p></details></div>';
 $('timeline').after(bar);
 const savedLegend=$('scene-legend').innerHTML;
 const helpParts=[...$('help').querySelectorAll('h2,ol,p')],savedHelp=helpParts.map(e=>e.innerHTML);
 $('live-refresh').onclick=()=>refresh();
 $('live-list-toggle').onclick=()=>{const open=$('live-road-content').hidden;$('live-road-content').hidden=!open;$('live-list-toggle').setAttribute('aria-expanded',String(open));$('live-list-toggle').querySelector('.live-collapse-icon').textContent=open?'−':'＋';workspace.classList.toggle('monitor-list-collapsed',!open);};
 $('live-detail-toggle').onclick=()=>{const open=$('live-detail-content').hidden;setDetailOpen(open);};
 $('live-road-search').oninput=()=>{query=$('live-road-search').value.trim().toLocaleLowerCase('zh-TW');filterList();};
 $('live-search-clear').onclick=()=>{$('live-road-search').value='';query='';filterList();$('live-road-search').focus();};
 panel.addEventListener('click',event=>{const b=event.target.closest('[data-live-route]');if(b)select(b.dataset.liveRoute);});
 const compact=()=>matchMedia('(max-width:800px)').matches;
 function renderPopup(r){const d=r?.direction;if(!d)return;const cars=r.volumes?fmt(r.volumes.S+r.volumes.L+r.volumes.T):'—',h=congestionHistory(d,historyDates,historyLevels),key=JSON.stringify([d.id,r.state,r.color,r.speed,cars,r.volumes?.M,r.trafficStatus.label,r.vd?.dataCollectTime]);if(key===popupKey)return;popupKey=key;
  popup.innerHTML=`<button class="map-popover-close" data-popover="close" aria-label="關閉小卡">×</button><strong>${esc(d.roadName)}</strong><p class="map-popover-meta"><span class="map-popover-status" style="--status-color:${r.color||'#9fa8a5'}">${esc(r.trafficStatus.label||'無有效路況')}${r.trafficStatus.grade?` ${esc(r.trafficStatus.grade)} 級`:''}</span>${esc(directionLabel(d))} · ${esc(r.state==='fresh'?age(r.vd?.dataCollectTime||r.speedTime):states[r.state]||'尚無觀測')}</p><p class="map-popover-values"><b style="color:${r.color||'#9fa8a5'}">${fmt(r.speed)}</b> km/h<span>汽 ${cars} · 機 ${fmt(r.volumes?.M)} 車次／分</span></p><div class="map-popover-history"><b>近一個月易塞 · 平日早上</b>${historyLines(h,2)}</div><button class="map-popover-more" data-popover="detail">完整資料 ↓</button>`;}
 function historyLines(h,limit){
  if(!h.days)return '<p>此方向沒有近一個月歷史快照。</p>';
  const hot=h.hot.slice(0,limit).map(p=>`<li><strong>${slotRange(p.index)}</strong><span>低速 ${pct(p.share)} · ${p.jamDays}/${h.days} 天</span></li>`).join('');
  const speed=`早上均速 ${fmt(h.averageSpeed)} km/h${h.jamBelow?` · 壅塞時 <${h.jamBelow} km/h`:''}`;
  return (hot?`<ol>${hot}</ol>`:'<p>各時段低速皆 <10%，少見壅塞。</p>')+`<p>${speed}</p>`;
 }
 function renderHistory(d){
  const h=congestionHistory(d,historyDates,historyLevels);
  $('live-history-hot').innerHTML=!h.days?'<li class="muted">此方向沒有近一個月歷史快照（新設備或未能對應）。</li>':h.hot.length?h.hot.map(p=>`<li><strong>${slotRange(p.index)}</strong><span>低速時間 ${pct(p.share)}</span><small>${h.days} 天中 ${p.jamDays} 天出現壅塞</small></li>`).join(''):'<li class="muted">各時段低速占比皆低於 10%，近一個月平日早上少見壅塞。</li>';
  $('live-history-bars').innerHTML=h.periods.map(p=>`<i title="${slotRange(p.index)} 低速 ${p.share===null?'無資料':pct(p.share)}" style="height:${p.share===null?3:Math.max(4,p.share*44)}px;background:${shareColor(p.share)}"></i>`).join('');
  $('live-history-speed').textContent=!h.days?'':`車速：早上 07:00–09:30 整段平均 ${fmt(h.averageSpeed)} km/h。${h.jamBelow?`易塞時段計入的壅塞分鐘（E、F 級）車速皆低於 ${h.jamBelow} km/h。`:''}快照未分時段保存車速，無法算出各時段平均。`;
 }
 function setPopup(open){const city=getCity();if(!open||!city){popupOpen=false;city?.hidePopup();return;}const r=monitoringRows(snapshot,summary.rows).find(r=>r.id===selected);popupKey='';renderPopup(r);popupOpen=city.showPopup(selected,popup);}
 function setDetailOpen(open){$('live-detail-content').hidden=!open;$('live-detail-toggle').setAttribute('aria-expanded',String(open));$('live-detail-toggle').textContent=open?'−':'＋';}
 function filterList(){
  let count=0,names=0;
  for(const group of panel.querySelectorAll('.live-road-group')){
   let visible=0;
   for(const button of group.querySelectorAll('[data-live-route]')){const d=summary.rows.find(d=>d.id===button.dataset.liveRoute),match=!query||`${d.roadName} ${d.vdId} ${d.linkId} ${directionLabel(d)}`.toLocaleLowerCase('zh-TW').includes(query);button.hidden=!match;if(match){visible++;count++;}}
   group.hidden=!visible;if(visible){names++;if(query)group.open=true;}
  }
  $('live-road-count').textContent=`${names} 條道路 · ${count} 個監控方向`;$('live-search-empty').hidden=!!count;$('live-search-clear').hidden=!query;
 }
 function renderList(rows){
  const readings=new Map(rows.map(r=>[r.id,r]));
  for(const b of panel.querySelectorAll('[data-live-route]')){const r=readings.get(b.dataset.liveRoute);b.setAttribute('aria-pressed',String(r.id===selected));b.querySelector('.live-route-dot').style.background=r.color;b.querySelector('.live-route-reading').textContent=r.speed==null?states[r.state]:`${fmt(r.speed)} km/h`;b.setAttribute('aria-label',`${r.direction.roadName} ${directionLabel(r.direction)} ${r.direction.vdId}，${r.trafficStatus.label}，${r.speed==null?states[r.state]:fmt(r.speed)+' 公里每小時'}`);b.title=r.trafficStatus.label;}
 }
 function render(){
  if(!active)return;
  // The denominator is the full current inventory, including unobserved directions.
  const rows=monitoringRows(snapshot,summary.rows),r=rows.find(r=>r.id===selected),d=r?.direction;
  const fresh=rows.filter(r=>r.state==='fresh'),flow=rows.filter(r=>r.flowValid),colored=rows.filter(r=>r.trafficStatus.level!=='unknown'),city=getCity();
  const key=JSON.stringify([snapshot?.fetchedAt,selected,rows.map(r=>[r.id,r.state,r.flowValid,r.speed,r.color]),!!city]);
  if(key!==lastSceneKey){city?.drawRoutes(summary,4,selected,rows);lastSceneKey=key;}
  renderList(rows);
  if(popupOpen){renderPopup(r);getCity()?.showPopup(selected,popup);}
  $('live-name').textContent=d?.roadName||'無路段';$('live-direction').textContent=`${directionLabel(d)} · ${states[r?.state]||'尚無觀測'}`;
  $('live-status').textContent=(r?.trafficStatus.label||'無有效路況')+(r?.trafficStatus.grade?` · ${r.trafficStatus.grade} 級`:'');$('live-status').style.setProperty('--status-color',r?.color||'#9fa8a5');
  $('live-speed').textContent=fmt(r?.speed);$('live-speed').style.color=r?.color||'#9fa8a5';$('live-speed-basis').textContent='km/h · '+(r?.speedSource||'尚無有效速度');$('live-grade-basis').textContent=r?.trafficStatus.basis||'';
  renderHistory(d);
  $('live-cars').textContent=r?.volumes?fmt(r.volumes.S+r.volumes.L+r.volumes.T):'—';$('live-motos').textContent=fmt(r?.volumes?.M);
  $('live-reading').textContent=r?.flowValid?`同方向 VD 的單筆分鐘車次。${r.travelTime!=null?'官方路段通過時間 '+fmt(r.travelTime)+' 秒。':''}${r.speed==null?'此筆無可用速度，不能判定順暢。':''}`:`流量未採用：${r?.vdState==='stale'?'觀測超過 3 分鐘':r?.vdState==='future'?'來源時間超前':r?.vd?.reasons?.join('、')||'缺少相同 VD、LinkID 與方向的有效觀測'}。`;
  const lanes=r?.vd?.laneCount??d?.laneCount,actual=r?.vd?.actualLaneCount??d?.actualLaneCount;
  $('live-lanes').textContent=`偵測 ${fmt(lanes)}／實際 ${fmt(actual)} 車道${lanes==null||actual==null?' · 車道資訊不完整':lanes!==actual?' · 車道不符，流量停用':' · 車道數相符'}。無逐車道錯誤旗標。`;
  $('live-source').textContent=`VD ${d?.vdId||'—'} / LinkID ${d?.linkId||'—'}${r?.sectionValid?' / Section '+r.section.sectionId:''}`;
  $('live-geometry').textContent=d&&city&&!city.hasRoute(d.id)?'此方向尚無可繪線形，保留可查資料。':d?.geometry?.basis||d?.geometry?.sourceNote||'道路線形與測點對照；色帶不代表整條道路或橋梁都在偵測範圍內。';
  $('live-time').textContent=`VD ${clock(r?.vd?.dataCollectTime)}（${age(r?.vd?.dataCollectTime)}）；速度 ${clock(r?.speedTime)}（${age(r?.speedTime)}）。`;
  const setStat=(id,label,value)=>{$(id).previousElementSibling.textContent=label;$(id).textContent=value;};
  setStat('stat-days','有新近觀測 / 全部方向',`${fresh.length} / ${rows.length}`);setStat('stat-roads','監控道路',roadNames.length);setStat('stat-coverage','可判讀路況',`${colored.length} / ${rows.length}`);
  $('mode-tag').textContent=`${roadNames.length} 條道路 · ${rows.length} 個 VD 方向 · ${fresh.length?'依來源時間更新':'等待有效觀測'}`;
  $('runtime-status').textContent=`監控 ${rows.length} 個方向；${colored.length} 個可判讀路況 · 車輛為觀測分級示意`;
  $('live-connection').textContent=busy?'正在取得官方觀測…':error||`最近接收 ${clock(snapshot?.fetchedAt)} · 每 60 秒更新`;
  $('live-refresh').disabled=busy||!!window.ISLAND_DATA;
  $('live-inventory').textContent=snapshot?`模型內湖盤點：${roadNames.length} 條道路、${new Set(summary.rows.map(r=>r.vdId)).size} 個 VD、${rows.length} 個監控方向。本次來源矩形共 ${new Set(snapshot.rows.map(r=>r.vdId)).size} 個 VD、${snapshot.rows.length} 個設備方向；另有 ${snapshot.sections.length} 個官方發布路段。只以完全相同 ID／路名／方向配對，不向附近道路套用讀值。`:'尚未取得來源。道路形狀仍顯示，灰色代表無有效路況。';
  $('live-source-table').innerHTML='<thead><tr><th>來源</th><th>狀態</th><th>來源更新時間</th><th>全市筆數</th></tr></thead><tbody>'+Object.entries(snapshot?.sources||{}).map(([name,s])=>`<tr><th>${esc(name)}</th><td>${s.status==='PARSED'?'取得並解析':'取得失敗'}</td><td>${esc(clock(s.updateTime))}</td><td>${fmt(s.count)}</td></tr>`).join('')+'</tbody>';
  const names=[...new Set((snapshot?.rows||[]).map(r=>r.roadName))].sort((a,b)=>a.localeCompare(b,'zh-TW'));
  $('live-roads-table').innerHTML='<thead><tr><th>道路名稱</th><th>VD 設備</th><th>設備方向</th><th>LinkID</th><th>新近且通過基本檢查</th></tr></thead><tbody>'+names.map(name=>{const items=snapshot.rows.filter(r=>r.roadName===name);return `<tr><th>${esc(name)}</th><td>${new Set(items.map(r=>r.vdId)).size}</td><td>${items.length}</td><td>${new Set(items.map(r=>r.linkId)).size}</td><td>${items.filter(r=>r.basicValid&&freshness(r.dataCollectTime)==='fresh').length}</td></tr>`;}).join('')+'</tbody>';
  window.trafficMonitoringState={source:'TAIPEI_OPEN_DATA',fetchedAt:snapshot?.fetchedAt||null,selected,rows,fresh:fresh.length,flow:flow.length,error,active};onState?.(window.trafficMonitoringState,snapshot);
 }
 async function refresh(){
  if(!active||busy||document.hidden)return;
  if(window.ISLAND_DATA){error='單檔展示保留盤點與歷史回放；即時監控請開啟原專案本機服務。';render();return;}
  busy=true;lastAttempt=Date.now();error='';const controller=new AbortController();request=controller;render();
  const timeout=setTimeout(()=>controller.abort(),50000);
  try{const response=await fetch('/api/monitoring',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('即時來源無法連線，請確認使用本機預覽服務。');const data=await response.json();if(data.schemaVersion!==1||!Array.isArray(data.rows)||!Array.isArray(data.sections))throw Error('監控資料格式不符');if(!active||controller.signal.aborted)return;snapshot=data;const failures=Object.entries(data.sources||{}).filter(([,s])=>s.status!=='PARSED').map(([name])=>name);if(failures.length)error='部分來源未取得：'+failures.join('、');}
  catch(e){if(active&&request===controller)error=e.name==='AbortError'?'連線已中斷或逾時；保留來源時間，過期即停用。':e.message;}
  finally{clearTimeout(timeout);if(request===controller){busy=false;request=null;render();}}
 }
 // On phones a map tap only selects and focuses; tapping the same road again toggles the floating card.
 function select(id,fly=true,source='list'){if(id!==null&&!summary.rows.some(d=>d.id===id))return;
  if(compact()&&source==='map'&&id!==null&&id===armed&&id===selected){setPopup(!popupOpen);return;}
  selected=id;armed=source==='map'?id:null;setDetailOpen(true);const button=[...panel.querySelectorAll('[data-live-route]')].find(b=>b.dataset.liveRoute===id);if(button)button.closest('details').open=true;setPopup(false);render();getCity()?.focusRoute(id,fly);
  if(id===null||!compact()||source!=='list')return;
  const behavior=matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth';setPopup(true);if(popupOpen){armed=id;$('canvas-host').scrollIntoView({block:'center',behavior});}else detail.scrollIntoView({block:'nearest',behavior});}
 function setActive(value){
  active=value;workspace.classList.toggle('monitor-list-collapsed',value&&$('live-road-content').hidden);detail.hidden=!value;bar.hidden=!value;panel.hidden=!value;workspace.classList.toggle('live-active',value);document.body.classList.toggle('live-active',value);clearInterval(timer);
  if(value){helpParts[0].textContent='從模型島看懂監控道路';helpParts[1].innerHTML='<li>拖曳旋轉城市、滾輪／雙指縮放；右鍵或 Shift＋拖曳平移。左下 ＋／－ 與方向按鈕也能縮放、移動，⌂ 全景看完整內湖。</li><li>點有色／灰色監控路段，或搜尋道路後選擇方向；手機再點一次同一路段，路旁會顯示小卡。</li><li>查看路況等級、速度、分鐘汽機車量及來源時間。</li>';helpParts[2].textContent='道路色帶依官方適用分級、既有路段門檻試算，或本地速度色帶顯示，細節會寫明判讀依據。灰色不代表順暢。道路未觀測的部分不推估。移動車輛依有效分鐘流量分級，以共同 4 倍時間播放；不是實車 GPS、完整轉向規則或排隊長度。';$('map-caption').innerHTML='<span class="compass">N ↑</span> 拖曳旋轉 · 滾輪縮放 · 右鍵／Shift＋拖曳平移 · 點道路看詳情<br><small>© OpenStreetMap contributors / ODbL · TDX 路段與臺北市 VD · 建物及道路高度為示意</small>';$('scene-title').textContent='內湖道路監控';$('scene-subtitle').textContent='找一條路，先看顏色，再看觀測依據。';$('scene-legend').innerHTML=`<div class="live-legend-colors">${TRAFFIC_STATES.map(s=>`<span><i style="background:${s.color}"></i>${s.label}</span>`).join('')}</div><p>色帶＝該監控方向的路況；等級依據見路段資訊。灰色不代表順暢。<span>無適用分級時：≥40／25–&lt;40／15–&lt;25／&lt;15 km/h。</span></p>`;filterList();render();refresh();timer=setInterval(()=>{if(document.hidden)return;render();if(Date.now()-lastAttempt>=60000)refresh();},15000);}
  else{setPopup(false);armed=null;helpParts.forEach((e,i)=>e.innerHTML=savedHelp[i]);request?.abort();request=null;busy=false;lastSceneKey='';$('scene-legend').innerHTML=savedLegend;$('scene-subtitle').textContent='轉動城市，回放晨峰，找到值得討論的時間。';if(window.trafficMonitoringState)window.trafficMonitoringState.active=false;}
 }
 document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden){render();if(Date.now()-lastAttempt>=60000)refresh();}});
 return {setActive,render,select,dismissPopup:()=>setPopup(false),get active(){return active;}};
}

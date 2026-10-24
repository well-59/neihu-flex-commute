import {monitoringRows,freshness} from './traffic-monitor-model.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n==null?'—':Number(n).toLocaleString('zh-TW',{maximumFractionDigits:1});
const clock=value=>value?new Date(value).toLocaleString('zh-TW',{hour12:false,timeZone:'Asia/Taipei'}):'無觀測時間';
const states={fresh:'有新近觀測',stale:'觀測已過期',future:'來源時間異常',invalid:'資料未通過檢查',missing:'尚無觀測'};
const bearings={N:'北向',S:'南向',E:'東向',W:'西向',NE:'東北向',NW:'西北向',SE:'東南向',SW:'西南向'};

export function createMonitor({summary,getCity,onState}){
 let active=false,snapshot=null,selected=summary.rows[0]?.id,timer=null,busy=false,lastAttempt=0,error='',request=null,lastSceneKey='';
 const detail=document.createElement('aside');detail.id='live-detail';detail.className='detail-card';detail.hidden=true;
 detail.innerHTML='<p class="eyebrow">LIVE / 最新道路觀測</p><h2 id="live-name">等待來源</h2><p id="live-direction" class="muted"></p><div class="detail-value"><strong id="live-speed">—</strong><span id="live-speed-basis">km/h · 尚無速度</span></div><div class="live-numbers"><div><span>汽車類 S/L/T</span><strong id="live-cars">—</strong></div><div><span>機車 M</span><strong id="live-motos">—</strong></div></div><p id="live-reading"></p><p id="live-source" class="boundary"></p><p id="live-time" class="muted"></p><p class="muted">數量＝VD 該筆分鐘車次。動畫依流量分級、速度以 4 倍時間播放；不是逐車定位或排隊長度。</p>';
 $('scene-workspace').append(detail);
 const bar=document.createElement('section');bar.id='live-controls';bar.className='timeline';bar.hidden=true;
 bar.innerHTML='<div class="filters"><label class="route-picker">監控路段<select id="live-route"></select></label><button id="live-refresh">更新觀測</button><span id="live-connection" role="status"></span></div><p class="muted">每 60 秒查詢；超過 3 分鐘未更新的觀測停用。灰路不代表順暢。未取得有效流量與速度的路段不播放車輛。</p><details><summary>這次取得哪些監控來源？</summary><p id="live-inventory"></p><div class="table-scroll"><table id="live-source-table"></table></div><h3>本次收集的道路</h3><div class="table-scroll"><table id="live-roads-table"></table></div><p class="muted">此公開來源無逐車道錯誤旗標，僅通過設備狀態、車道數、車種與數值檢查。機車欄位為零不證明設備完整偵測所有機車。動畫沿既有圖資方向行進，轉向與測點代表範圍仍待校準。</p></details>';
 $('timeline').after(bar);
 $('live-route').innerHTML=summary.rows.map(d=>`<option value="${esc(d.id)}">${esc(d.roadName)}・${esc(bearings[d.bearing]||d.bearing)}</option>`).join('');
 $('live-route').onchange=()=>select($('live-route').value);
 $('live-refresh').onclick=()=>refresh();
 const savedLegend=$('scene-legend').innerHTML;
 const helpParts=[...$('help').querySelectorAll('h2,ol,p')],savedHelp=helpParts.map(e=>e.innerHTML);
 function render(){
  if(!active)return;
  const rows=monitoringRows(snapshot,summary.representatives),r=rows.find(r=>r.id===selected),d=r?.direction;
  const fresh=rows.filter(r=>r.state==='fresh'),flow=rows.filter(r=>r.flowValid),city=getCity();
  const key=JSON.stringify([snapshot?.fetchedAt,selected,rows.map(r=>[r.id,r.state,r.flowValid,r.speed]),!!city]);
  if(key!==lastSceneKey){city?.drawRoutes(summary,4,selected,rows);lastSceneKey=key;}
  $('live-name').textContent=d?.roadName||'無路段';$('live-direction').textContent=`${bearings[d?.bearing]||d?.bearing||''} · ${states[r?.state]||'尚無觀測'}`;
  $('live-speed').textContent=fmt(r?.speed);$('live-speed').style.color=r?.color||'#9fa8a5';$('live-speed-basis').textContent='km/h · '+(r?.speedSource||'尚無有效速度');
  $('live-cars').textContent=r?.volumes?fmt(r.volumes.S+r.volumes.L+r.volumes.T):'—';$('live-motos').textContent=fmt(r?.volumes?.M);
  $('live-reading').textContent=r?.flowValid?`同方向 VD 分鐘觀測；${r.vd.laneCount} 個偵測車道。${r.travelTime!=null?'官方路段通過時間 '+fmt(r.travelTime)+' 秒。':''}`:`流量未採用：${r?.vdState==='stale'?'觀測超過 3 分鐘':r?.vd?.reasons?.join('、')||'缺少相同設備、路段與方向的有效觀測'}。不以歷史比例補值。`;
  $('live-source').textContent=`${d?.vdId||'—'} / ${d?.linkId||'—'}${r?.sectionValid?' · '+r.section.sectionId:''}。${d&&city&&!city.hasRoute(d.id)?'此方向沒有對應的 3D 道路，保留數據。':'測點對照既有道路線形；不代表整座橋。'}`;
  $('live-time').textContent=`VD：${clock(r?.vd?.dataCollectTime)}；速度：${clock(r?.speedTime)}。接收：${clock(snapshot?.fetchedAt)}。`;
  const setStat=(id,label,value)=>{$(id).previousElementSibling.textContent=label;$(id).textContent=value;};
  setStat('stat-days','有觀測 / 盤點方向',`${fresh.length} / ${rows.length}`);
  setStat('stat-roads','圖中有新近觀測',fresh.filter(r=>city?.hasRoute(r.id)).length);
  setStat('stat-coverage','通過流量基本檢查',`${flow.length} / ${rows.length}`);
  $('mode-tag').textContent=fresh.length?'即時監控 · 依來源時間更新':'即時監控 · 等待有效觀測';
  $('runtime-status').textContent=`監控 ${fresh.length} 個既有方向；動畫為數據分級示意`;
  $('live-connection').textContent=busy?'正在取得官方觀測…':error||`最近接收 ${clock(snapshot?.fetchedAt)}`;
  $('live-refresh').disabled=busy||!!window.ISLAND_DATA;
  $('live-inventory').textContent=snapshot?`本次矩形盤點：${new Set(snapshot.rows.map(r=>r.vdId)).size} 個 VD、${snapshot.rows.length} 個設備方向、${new Set(snapshot.rows.map(r=>r.linkId)).size} 個 LinkID、${new Set(snapshot.rows.map(r=>r.roadName)).size} 個道路名稱；另有 ${snapshot.sections.length} 個官方發布路段。${snapshot.rows.filter(r=>!r.historicalMatch).length} 個設備方向尚未在既有歷史快照；不自動套到附近道路。圖中分母為既有 ${rows.length} 個代表方向，與這裡的設備方向不同。`:'尚未取得來源。';
  $('live-source-table').innerHTML='<thead><tr><th>來源</th><th>狀態</th><th>來源更新時間</th><th>全市筆數</th></tr></thead><tbody>'+Object.entries(snapshot?.sources||{}).map(([name,s])=>`<tr><th>${esc(name)}</th><td>${s.status==='PARSED'?'取得並解析':'取得失敗'}</td><td>${esc(clock(s.updateTime))}</td><td>${fmt(s.count)}</td></tr>`).join('')+'</tbody>';
  const names=[...new Set((snapshot?.rows||[]).map(r=>r.roadName))].sort((a,b)=>a.localeCompare(b,'zh-TW'));
  $('live-roads-table').innerHTML='<thead><tr><th>道路名稱</th><th>VD 設備</th><th>設備方向</th><th>LinkID</th><th>新近且通過基本檢查</th></tr></thead><tbody>'+names.map(name=>{const items=snapshot.rows.filter(r=>r.roadName===name);return `<tr><th>${esc(name)}</th><td>${new Set(items.map(r=>r.vdId)).size}</td><td>${items.length}</td><td>${new Set(items.map(r=>r.linkId)).size}</td><td>${items.filter(r=>r.basicValid&&freshness(r.dataCollectTime)==='fresh').length}</td></tr>`;}).join('')+'</tbody>';
  window.trafficMonitoringState={source:'TAIPEI_OPEN_DATA',fetchedAt:snapshot?.fetchedAt||null,selected,rows,fresh: fresh.length,flow:flow.length,error,active};onState?.(window.trafficMonitoringState,snapshot);
 }
 async function refresh(){
  if(!active||busy||document.hidden)return;
  if(window.ISLAND_DATA){error='單檔展示保留歷史回放；即時監控請開啟原專案本機服務。';render();return;}
  busy=true;lastAttempt=Date.now();error='';request=new AbortController();render();
  const timeout=setTimeout(()=>request?.abort(),50000);
  try{const response=await fetch('/api/monitoring',{cache:'no-store',signal:request.signal});if(!response.ok)throw Error('即時來源無法連線，請確認使用本機預覽服務。');const data=await response.json();if(data.schemaVersion!==1||!Array.isArray(data.rows)||!Array.isArray(data.sections))throw Error('監控資料格式不符');snapshot=data;const failures=Object.entries(data.sources).filter(([,s])=>s.status!=='PARSED').map(([name])=>name);if(failures.length)error='部分來源未取得：'+failures.join('、');}
  catch(e){error=e.name==='AbortError'?'連線已中斷或逾時；保留原時間，過期即停用。':e.message;}
  finally{clearTimeout(timeout);busy=false;request=null;render();}
 }
 function select(id,fly=true){if(id!==null&&!summary.rows.some(d=>d.id===id))return;selected=id;$('live-route').value=id||'';render();getCity()?.focusRoute(id,fly);}
 function setActive(value){
  active=value;detail.hidden=!value;bar.hidden=!value;clearInterval(timer);
  if(value){helpParts[0].textContent='看懂現在的道路觀測';helpParts[1].innerHTML='<li>選擇路段與方向，查看觀測時間。</li><li>比較汽車類、機車的分鐘流量與採用速度。</li><li>展開來源清單，核對設備與缺資料範圍。</li>';helpParts[2].textContent='只在流量與速度有效的對應路段播放車輛。顏色是固定速度色帶，不是官方服務水準。模型疏密依分鐘車次分級，動畫速度使用統一 4 倍時間；不代表逐車軌跡、機車專屬速度或排隊長度。無觀測與過期路段不補造車流。';$('map-caption').innerHTML='<span class="compass">N ↑</span> 道路位置有依據 · 建物與高度示意<br><small>© OpenStreetMap contributors / ODbL · 臺北市即時觀測 / 既有 TDX 線形</small>';$('scene-title').innerHTML='現在的路況，<br><em>看得見依據。</em>';$('scene-subtitle').textContent='從官方觀測，追蹤每個方向的變化。';$('scene-legend').innerHTML='<span><i class="high"></i>≤15 km/h</span><span><i style="background:#ddab64"></i>15–30</span><span><i class="low"></i>>30</span><span><i class="unknown"></i>無有效速度</span><span>固定速度色帶，非官方壅塞等級；車輛疏密＝分車種分鐘流量分級</span>';render();refresh();timer=setInterval(()=>{if(document.hidden)return;render();if(Date.now()-lastAttempt>=60000)refresh();},15000);}
  else{helpParts.forEach((e,i)=>e.innerHTML=savedHelp[i]);request?.abort();lastSceneKey='';$('scene-legend').innerHTML=savedLegend;$('scene-subtitle').textContent='轉動城市，回放晨峰，找到值得討論的時間。';if(window.trafficMonitoringState)window.trafficMonitoringState.active=false;}
 }
 document.addEventListener('visibilitychange',()=>{if(active&&!document.hidden){render();if(Date.now()-lastAttempt>=60000)refresh();}});
 return {setActive,render,select,get active(){return active;}};
}

import {renderCompanyCommute} from './company-commute.js';
import {renderCommuteComparison} from './commute-comparison.js';
import {createVDOverlay} from './vd-overlay.js';
import {periodColor} from './traffic-palette.js';
import {renderPeriodComparison,slotTime} from './period-comparison.js';
import {createDeviceView} from './vd-locations.js';
import {createMonitor} from './traffic-monitor.js';
import {buildMonitoredSummary} from './monitored-roads.js';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bearing={E:'東向',W:'西向',N:'北向',S:'南向',NE:'東北向',NW:'西北向',SE:'東南向',SW:'西南向'};
const label=d=>`${d.roadName}・${bearing[d.bearing]||d.bearing}`,fmt=n=>n==null?'—':n.toLocaleString('zh-TW',{maximumFractionDigits:1}),pct=n=>n==null?'缺資料':`${(n*100).toFixed(1)}%`;
const time=i=>`${String(7+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`;
const color=periodColor;
export async function start(){
 let analysisDetailOpen=false,allSummary,selectedRoad=null,selectedVD=null,vdOverlay;
 let city=null,summary,selected,index=4,view='monitor',playing=false,timer=null,motionPaused=false,monitor,deviceView,compareA=4,compareB=6;
 const company={lat:null,lon:null,time:"09:00",radius:3000,rule:"half"};
 const media=matchMedia('(prefers-reduced-motion: reduce)');let reduced=media.matches;
 const fail=error=>{$('loading').hidden=true;$('fallback').hidden=false;$('fallback-message').textContent=error.message;$('fallback-title').textContent=summary?'3D 暫時無法顯示':'資料尚未載入';$('fallback-options').textContent=summary?'仍可查看路段分析與資料品質，或開啟原本的 2D 儀表板。':'觀測資料或程式載入失敗，資料頁尚不可用。請重新載入或開啟 2D 儀表板。';if(!summary)document.querySelectorAll('[data-view]').forEach(b=>b.disabled=true);$('runtime-status').textContent=summary?'3D 未就緒 · 可使用資料頁或 2D 備援':'資料未就緒 · 請重試或使用 2D 入口';city?.setActive(false);document.body.dataset.renderStatus='fallback';};
 $('retry').onclick=()=>location.reload();
 try{
  const [{validateSnapshot,summarize,periodEvidence,qualityRows},snapshot]=await Promise.all([import('./route-evidence-model.js'),window.ISLAND_DATA?Promise.resolve(window.ISLAND_DATA.observations):fetch('data/route-clarity.json').then(r=>{if(!r.ok)throw Error('觀測資料載入失敗');return r.json();})]);
  const DATA=window.ISLAND_DATA||{geography:{roads:window.NEIHU_ROADS,locations:window.VD_LOCATIONS,inventory:window.VD_INVENTORY},observations:snapshot,synthetic:window.NeihuPlanning.demo(),presentation:{seed:20261024,corridors:[{gate:'G1',short:'民權大橋走廊',vd:'VQBUL20',bearing:'E',note:'民權東路六段東向測點；非橋上實測。'},{gate:'G6',short:'成美橋走廊',vd:'VMSV820',bearing:'NE',note:'新明路東北向代理點；代表性待確認，非橋上實測。'},{gate:'G2',short:'堤頂大道',vd:'VRHT600',bearing:'N',note:'堤頂大道北向測點；不代表整條走廊。'}]}};
  validateSnapshot(DATA.observations);
  const requested=DATA.observations.coverage.requestedDates,available=DATA.observations.coverage.availableDates,holidays=DATA.observations.holidays.dates.map(d=>d.date);
  $('island-date').innerHTML='<option value="">整段期間</option>'+requested.map(d=>`<option value="${d}">${d}${holidays.includes(d)?'（假日）':''}${available.includes(d)?'':'（缺資料）'}</option>`).join('');
  function stop(){playing=false;if(window.trafficIslandState)window.trafficIslandState.playing=false;clearInterval(timer);timer=null;$('play').textContent='▶ 播放';$('play').setAttribute('aria-pressed','false');}
  function recompute(){allSummary=summarize(DATA.observations,{date:$('island-date').value||null,scope:'all',skipHolidays:$('island-holidays').checked});summary=summarize(DATA.observations,{date:$('island-date').value||null,scope:$('island-scope').value,skipHolidays:$('island-holidays').checked});if(selectedRoad?.route&&!summary.rows.some(d=>d.id===selectedRoad.route)){selectedRoad=null;city?.selectRoad(null);}if(!summary.rows.some(d=>d.id===selected))selected=selectedRoad&&!selectedRoad.route?null:summary.rows[0]?.id;
   $('island-route').innerHTML=summary.rows.map(d=>`<option value="${esc(d.id)}">${esc(label(d))}</option>`).join('');$('island-route').value=selected||'';render();}
  function render(){
   if(view==='live'){monitor?.render();return;}if(view==='devices'){deviceView?.render();return;}
   $('stat-days').previousElementSibling.textContent='觀測日 / 目標日';$('stat-coverage').previousElementSibling.textContent='有效車流完整度';
   const d=DATA.observations.directions.find(d=>d.id===selected),p=d?periodEvidence(d,summary.dates,index,summary.requested):null;
   $('panel-subtitle').textContent=`目前查看 ${d?label(d):'無路段'} · ${time(index)}–${time(index+1)} · ${summary.dates.length} 個資料日`;
   $('stat-days').textContent=`${summary.dates.length} / ${summary.requested.length}`;$('stat-roads').textContent=summary.representativeCount;$('stat-coverage').textContent=pct(summary.totals.completeness);
   $('detail-name').textContent=d?d.roadName:'沒有可用路段';$('detail-direction').textContent=d?`${bearing[d.bearing]||d.bearing} · ${time(index)}–${time(index+1)}`:'請調整範圍';
   $('detail-share').textContent=pct(p?.share??null);$('detail-share').style.color=p?.share==null?'#626b5e':'#355f50';
   $('detail-reading').textContent=p?`所選日期這個時段，${fmt(p.classified)} 分鐘可判讀，其中 ${fmt(p.congested)} 分鐘低速。目標 ${fmt(p.expected)} 分鐘，包含缺日。`:'沒有足夠資料，不推測順暢。';
   const corridor=DATA.presentation.corridors.find(c=>c.vd===d?.vdId&&c.bearing===d?.bearing);
   $('detail-boundary').textContent=(corridor?corridor.note:'測點分級映射路段，不是整段旅行速度。')+(index===9?' 09:30 後多日資料尚缺。':'');
   $('detail-scope').textContent=d?`${d.vdId} · ${summary.dates.length} 個資料日。低速時間占比不是車輛占比。`:'';
   $('detail-periods').innerHTML=d?summary.heat.find(r=>r.direction.id===d.id).periods.map((p,i)=>`<button data-period="${i}" aria-pressed="${i===index}" style="height:${p.share===null?3:Math.max(5,p.share*40)}px;background:${color(p.share)}" aria-label="${time(i)} 低速時間占比 ${pct(p.share)}" title="${time(i)} ${pct(p.share)}"></button>`).join(''):'';
   $('time-buttons').innerHTML=summary.periods.map(p=>`<button data-period="${p.index}" aria-pressed="${index===p.index}"><span>${time(p.index)}</span><strong>${pct(p.share)}</strong></button>`).join('');
   $('time-caption').textContent=`${time(index)}–${time(index+1)} · ${summary.dates.length===1?summary.dates[0]:'所選日期的相同時段合計'}；${!summary.requested.length?'篩選後無目標日':summary.missing.length?'缺日 '+summary.missing.join('、'):'所選目標日有快照'}。時間軸百分比＝所選範圍整體低速時間占比，分母為可判讀分鐘。`;
   $('play').disabled=reduced||summary.dates.length===0;
   if(!summary.dates.length)stop();
   renderAnalysis();renderQuality(d);if(view==='commute')renderCommute();city?.drawRoutes(summary,index,selected);city?.setRoadContext(allSummary,index);if(city){renderFleet();const visible=summary.rows.filter(r=>city.hasRoute(r.id)).length;$('stat-roads').textContent=visible===summary.representativeCount?visible:`${visible} / ${summary.representativeCount}`;$('stat-roads').previousElementSibling.textContent=visible===summary.representativeCount?'代表方向':'圖中 / 代表方向';if(d&&!city.hasRoute(d.id))$('detail-boundary').textContent+=' 此方向超出模型範圍或未能對應底圖道路；保留統計，無法在此模型定位。';}
   renderMapStrip(d);vdOverlay?.render();if(vdOverlay?.opened)$('detail-card').hidden=true;
   window.trafficIslandState={selectedRoad:selectedRoad?.id||null,view,index,selected,dates:summary.dates,requested:summary.requested,scope:summary.scope,totals:summary.totals,official:summary.official,period:p,playing,reduced,policyEffect:null,source:'historical'};
  }
  function renderMapStrip(d){
   if(selectedVD)d=selectedVD.link?.reference;
   $('island-road-strip').hidden=view!=='monitor';
   if(selectedVD&&!d){$('island-road-strip').innerHTML=`<h2>${esc(selectedVD.device.roadName)} · ${esc(selectedVD.device.id)}</h2><p>這個設備方向尚無可核對的歷史線形與分時快照；已保留官方測點，不套用鄰路數值。</p>`;}else if(selectedRoad&&!selectedRoad.route){
    $('detail-name').textContent=selectedRoad.name;$('detail-direction').textContent=`${time(index)}–${time(index+1)} · 底圖道路`;$('detail-share').textContent='缺資料';$('detail-share').style.color='#626b5e';
    $('detail-reading').textContent='已定位到這個道路圖段，尚無可對照的歷史觀測。';$('detail-boundary').textContent='不以鄰近道路或動畫車數補造數值。';$('detail-scope').textContent='方向、流量與速度需補觀測來源。';$('detail-periods').innerHTML='';
    $('island-road-strip').innerHTML=`<h2>${esc(selectedRoad.name)} · 尚無對應觀測</h2><p>此圖段可定位與點選；07:00–09:30 的分時數值尚缺。請選其他道路，或開啟「VD 測點」查看設備位置。</p>`;
   }else{
    $('island-road-strip').innerHTML=d?renderPeriodComparison({...summary,rows:[d]},window.NEIHU_PERIOD_FLOW,index,{selectedId:d.id,compact:true}):'<p>點選地圖道路，查看這個路段的分時色帶。</p>';
    if(selectedRoad){$('detail-name').textContent=selectedRoad.name;$('detail-boundary').textContent+=` 觀測來源路名：${d?.roadName||'—'}。依路名、方向與線形幾何對照，尚非道路全段精度驗證。`;}
   }
   if(city){const r=city.roadState();$('road-coverage').textContent=`目前底圖 ${city.vehicleState().network.sourceCount} 個道路圖徵皆有點選範圍；${r.matchedSegments}／${r.segments} 個方向小段可幾何對照觀測。未對照路段不補造數字。`;}
  }
  function selectRoad(record){
   if(vdOverlay?.opened)vdOverlay.close();selectedVD=null;
   stop();
   if(record.route&&!summary.rows.some(d=>d.id===record.route)){$('island-scope').value='all';recompute();$('scope-notice').hidden=false;$('scope-notice').textContent='所點道路在原篩選範圍外，已切換全部已盤點方向。';}
   selectedRoad=record;selected=record.route||null;$('island-route').value=selected||'';render();city?.selectRoad(record.id);city?.focusRoad(record.id);
  }
  function renderFleet(){
   const f=city.vehicleState();$('fleet-summary').textContent=`底圖 ${f.network.sourceCount} 個道路圖徵、${f.network.paths} 條方向路徑。當前配置：汽車 ${f.cars}、機車 ${f.motorcycles} 台模型；未觀測道路亦有示意車流。`;
   $('fleet-table').innerHTML='<thead><tr><th>動畫路徑</th><th>汽車模型</th><th>機車模型</th><th>配置依據</th></tr></thead><tbody>'+f.paths.map(p=>`<tr><th>${esc(p.names.join(' → '))}<small>${esc(p.route)}${p.bridge?' · 含橋梁':''}</small></th><td>${p.vehicles.filter(v=>v.kind==='car').length}</td><td>${p.vehicles.filter(v=>v.kind==='moto').length}</td><td>${p.context?'道路類型＋長度，無觀測依據':'路徑部分有觀測對照，車數仍為示意'}</td></tr>`).join('')+'</tbody>';
  }
  function renderAnalysis(){
   $('analysis-slot').innerHTML=Array.from({length:10},(_,i)=>`<option value="${i}" ${i===index?'selected':''}>${slotTime(i)}–${slotTime(i+1)}</option>`).join('');
   $('period-comparison').innerHTML=renderPeriodComparison(summary,window.NEIHU_PERIOD_FLOW,index,{selectedId:selected,detailOpen:analysisDetailOpen});
   const t=summary.totals,o=summary.official,f=summary.flow[0],c=summary.congestion[0];
   const cards=[['觀測日 / 目標日',`${summary.dates.length} / ${summary.requested.length}`,'有快照不等於分鐘完整'],['代表方向',summary.representativeCount,`範圍內 ${summary.candidatesCount} 方向，同 LinkID 選代表`],['整體低速時間占比',pct(t.share),`${fmt(t.congested)} / ${fmt(t.classified)} 路段分鐘`],['最高低速比例時段',summary.peakPeriods.map(p=>time(p.index)).join('、')||'—','07:00–09:30，每格15分鐘'],['低速時間占比最高',c?`${fmt(c.congestedShare)}%`:'—',c?label(c)+'；門檻代表性待核':'沒有可比較資料'],['平均每分鐘通過車次最高',f?fmt(f.averageMinuteVolume)+' 車次／分鐘':'—',f?label(f)+'；所選日期 07:00–09:30，全車種合計':'沒有可比較資料'],['與官方分級相同占比',pct(o.share),`${fmt(o.exact)} / ${fmt(o.minutes)} 配對；非獨立準確率`],['有效車流資料完整度',pct(t.completeness),`${fmt(t.valid)} / ${fmt(t.expected)} 目標分鐘，含缺日`]];
   $('overview-grid').innerHTML=cards.map(([name,value,note])=>`<article><span>${esc(name)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
   $('island-heat').innerHTML=`<thead><tr><th>代表方向 · 依平均車流率排序</th><th>平均每分鐘通過<small>07:00–09:30 · 全車種</small></th><th>歷史平均車速<small>07:00–09:30</small></th>${summary.periods.map(p=>`<th>${time(p.index)}–${time(p.index+1)}<small>低速時間占比</small></th>`).join('')}</tr></thead><tbody>${summary.rows.map(d=>{const row=summary.heat.find(r=>r.direction.id===d.id),flow=summary.flow.find(r=>r.id===d.id),speed=summary.congestion.find(r=>r.id===d.id);return `<tr class="${d.id===selected?'selected':''}"><th><button data-select="${esc(d.id)}">${esc(label(d))}</button><small>${esc(d.vdId)}</small></th><td class="traffic-metric" title="${fmt(flow?.totalObservedVolume)} 車次 ÷ ${fmt(flow?.validMinutes)} 個有效分鐘">${flow?`<strong>${fmt(flow.averageMinuteVolume)}</strong> 車次／分鐘`:'缺資料'}</td><td class="traffic-metric" title="五分鐘車次加權速度，再按有效分鐘平均；非目前車速或全程旅速">${speed?`<strong>${fmt(speed.averageSpeed)}</strong> km/h`:'缺資料'}</td>${row.periods.map((p,i)=>`<td><button data-select="${esc(d.id)}" data-period="${i}" style="background:${p.share===null?'#e1e4dd':color(p.share)+'55'}" aria-label="${esc(label(d))} ${time(i)} 低速 ${pct(p.share)}">${p.share===null?'—':(p.share*100).toFixed(0)+'%'}</button></td>`).join('')}</tr>`;}).join('')}</tbody>`;
  }
  function renderQuality(d){
   $('quality-summary').textContent=d?`${label(d)} · ${d.vdId} · LinkID ${d.linkId}；偵測 ${d.laneCount??'未知'}／實際 ${d.actualLaneCount??'未知'} 車道。`:'沒有選取路段';
   $('quality-origin').textContent=`來源快照 ${DATA.observations.provenance.generatedAt}；commit ${DATA.observations.provenance.commit.slice(0,7)}。原始逐分鐘檔未提供。`;
   const rows=d?qualityRows(d,summary.requested):[];
   $('island-quality').innerHTML=`<thead><tr><th>日期</th><th>收到／預期分鐘</th><th>有效車流分鐘</th><th>可分級分鐘</th><th>未能分級</th><th>有效車次</th><th>官方相同／配對分鐘</th></tr></thead><tbody>${rows.map(r=>`<tr><th>${r.date}</th><td>${fmt(r.received)} / 150</td><td>${fmt(r.valid)}</td><td>${fmt(r.speed)}</td><td>${fmt(r.unclassified)}</td><td>${fmt(r.volume)}</td><td>${r.official?.minutes?`${fmt(r.official.exact)} / ${fmt(r.official.minutes)}`:d.geometry?.sectionId?'本日無有效配對':'未對應官方路況分級'}</td></tr>`).join('')}</tbody>`;
  }
  function selectRoute(id,{fly=true,source='list'}={}){if(vdOverlay?.opened)vdOverlay.close();selectedVD=null;selectedRoad=null;city?.selectRoad(null);if(view==='live'){monitor.select(id,fly,source);return;}if(!summary.rows.some(d=>d.id===id))return;selected=id;$('island-route').value=id;render();city?.focusRoute(id,fly);}
  function selectGate(gate,source='list'){const info=DATA.presentation.corridors.find(c=>c.gate===gate),location=DATA.geography.locations.records.find(l=>l.gate===gate);const d=DATA.observations.directions.find(d=>d.vdId===(info?.vd||location?.id)&&d.bearing===(info?.bearing||location?.directions[0]));if(!d){$('scope-notice').hidden=false;$('scope-notice').textContent='此測點尚無對應多日方向，未補造數值。';return;}
   if(view==='live'){monitor.select(d.id,true,source);return;}
   if(!summary.rows.some(r=>r.id===d.id)){$('island-scope').value='all';$('scope-notice').hidden=false;$('scope-notice').textContent='為顯示此走廊測點，已切換全部已盤點方向；概況同步重算。';recompute();}
   const representative=summary.rows.find(r=>r.linkId===d.linkId);if(representative)selectRoute(representative.id);
  }
  function renderCommute(){
   const d=summary.rows.find(d=>d.id===selected),output=renderCommuteComparison(d,summary,window.NEIHU_PERIOD_FLOW,compareA,compareB);
   const business=renderCompanyCommute(allSummary,company,DATA.geography.roads.bbox,DATA.observations.provenance.generatedAt);
   $('commute-panel').innerHTML=business.html+'<h2 id="commute-road-title">路段時段對照</h2>'+output.html;window.trafficCommuteState=output.result;window.companyCommuteState=business.result;
   $('panel-subtitle').textContent=d?`${label(d)} · ${d.vdId} · ${summary.requested.length} 個所選日（${summary.dates.length} 日有快照）`:'目前沒有選取路段，請調整上方範圍。';
  }
  function show(next){
   if(next==='scenario')next='commute';
   stop();city?.setCompanyPick(false);$('company-pick-notice').hidden=true;view=next;const isScene=['monitor','live','devices'].includes(next),live=next==='live',devices=next==='devices';
   $('scene-workspace').hidden=!isScene;$('island-road-strip').hidden=next!=='monitor';$('road-coverage').hidden=next!=='monitor';$('timeline').hidden=live||devices;
   document.querySelector('#timeline .time-row').hidden=next==='commute';document.querySelector('#timeline .timeline-foot').hidden=next==='commute';
   $('motion-toggle').hidden=devices;$('help-toggle').hidden=devices;$('help').hidden=true;$('data-panel').hidden=isScene;$('analysis-panel').hidden=next!=='analysis';$('quality-panel').hidden=next!=='quality';$('commute-panel').hidden=next!=='commute';
   $('scene-workspace').classList.toggle('history-active',next==='monitor');$('scene-workspace').classList.toggle('devices-active',devices);
   $('help-toggle').setAttribute('aria-expanded','false');
   for(const id of ['scene-stats','scene-legend'])$(id).hidden=false;$('detail-card').hidden=live||devices;
   $('scene-title').innerHTML='讓早晨的擁擠，<br><em>有跡可循。</em>';
   $('mode-tag').textContent='歷史回放 · 非即時路況';$('map-caption').innerHTML='<span class="compass">N ↑</span>真實路網位置 · 建物、高度與河寬示意<br><small>© OpenStreetMap contributors / ODbL · TDX 路段與 VD</small>';
   $('panel-eyebrow').textContent=next==='commute'?'COMPARE / 同一路段・同方向・歷史觀測':next==='analysis'?'EVIDENCE / 同一組日期與方向':'PROVENANCE / 資料的邊界';
   $('panel-title').textContent=next==='commute'?'換個時間，路況曾有什麼不同？':next==='analysis'?'每個熱點，都有時間脈絡。':'這座城市，哪些地方有資料？';
   document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===next)));
   city?.setActive(isScene);if(isScene)city?.setMode(next);else city?.setDevicesVisible(false);monitor.setActive(false);deviceView.setActive(false);vdOverlay?.setMode(next);selectedVD=null;
   if(live)monitor.setActive(true);if(devices)deviceView.setActive(true);if(!live&&!devices)render();window.scrollTo({top:0,behavior:'instant'});
  }
  document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.view)show(b.dataset.view);else if(b.dataset.open)show(b.dataset.open);else if(b.dataset.gate)selectGate(b.dataset.gate);else if(b.dataset.select){if(b.dataset.period!==undefined)index=Number(b.dataset.period);show('monitor');selectRoute(b.dataset.select);}else if(b.dataset.period!==undefined){stop();index=Number(b.dataset.period);render();}});
  for(const id of ['island-date','island-scope','island-holidays'])$(id).onchange=()=>{stop();$('scope-notice').hidden=true;recompute();};$('island-route').onchange=()=>selectRoute($('island-route').value);
  $('period-comparison').addEventListener('click',e=>{const cell=e.target.closest('[data-heat-route]'),column=e.target.closest('[data-heat-column]');if(!cell&&!column)return;stop();if(cell){selected=cell.dataset.heatRoute;index=Number(cell.dataset.heatPeriod);analysisDetailOpen=true;$('island-route').value=selected;}else index=Number(column.dataset.heatColumn);render();});
  $('period-comparison').addEventListener('toggle',e=>{if(e.target.matches('.period-cell-detail'))analysisDetailOpen=e.target.open;},true);
  $('island-road-strip').addEventListener('click',e=>{const b=e.target.closest('[data-heat-period],[data-heat-column]');if(!b)return;stop();index=Number(b.dataset.heatPeriod??b.dataset.heatColumn);render();});
  $('analysis-slot').onchange=()=>{stop();index=Number($('analysis-slot').value);render();};
  $('play').onclick=()=>{if(playing){stop();return;}if(reduced||!summary.dates.length)return;motionPaused=false;city?.setPaused(false);$('motion-toggle').setAttribute('aria-pressed','false');$('motion-toggle').innerHTML='Ⅱ <span>暫停動態</span>';playing=true;$('play').textContent='Ⅱ 暫停';$('play').setAttribute('aria-pressed','true');if(index===9)index=0;render();timer=setInterval(()=>{if(index>=9){stop();return;}index++;if(index===9)stop();render();},1800);};
  $('home-view').onclick=()=>{city?.home();$('top-view').setAttribute('aria-pressed','false');};$('zoom-in').onclick=()=>city?.zoomStep(.7);$('zoom-out').onclick=()=>city?.zoomStep(1/.7);
  // A press nudges the map once; holding keeps it moving until release.
  const panDirections={up:[0,1],down:[0,-1],left:[-1,0],right:[1,0]};let holdTimer=0;const endHold=()=>{clearTimeout(holdTimer);holdTimer=0;city?.panHold(0,0);};
  for(const b of document.querySelectorAll('[data-pan]')){const [x,z]=panDirections[b.dataset.pan];b.addEventListener('pointerdown',e=>{if(e.button!==0)return;endHold();city?.panStep(x*.22,z*.22);holdTimer=setTimeout(()=>city?.panHold(x,z),320);b.setPointerCapture?.(e.pointerId);});for(const type of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(type,endHold);b.addEventListener('click',e=>{if(e.detail===0)city?.panStep(x*.22,z*.22);});b.addEventListener('contextmenu',e=>e.preventDefault());}
  addEventListener('blur',endHold);$('top-view').onclick=()=>$('top-view').setAttribute('aria-pressed',String(city?.bird()||false));
  $('motion-toggle').onclick=()=>{motionPaused=!motionPaused;if(motionPaused)stop();city?.setPaused(motionPaused);$('motion-toggle').setAttribute('aria-pressed',String(motionPaused));$('motion-toggle').innerHTML=motionPaused?'▶ <span>恢復動態</span>':'Ⅱ <span>暫停動態</span>';};
  function help(open){$('help').hidden=!open;$('help-toggle').setAttribute('aria-expanded',String(open));if(open)stop();else{try{localStorage.setItem('neihu-island-help','seen');}catch{}}}
  $('help-toggle').onclick=()=>help($('help').hidden);$('help-close').onclick=()=>help(false);document.addEventListener('keydown',e=>{if(e.key==='Escape')help(false);});
  $('commute-panel').onchange=e=>{if(e.target.id==='commute-a')compareA=Number(e.target.value);if(e.target.id==='commute-b')compareB=Number(e.target.value);if(['commute-a','commute-b'].includes(e.target.id))renderCommute();};
  function readCompanyForm(requireLocation=true){
   const form=$('company-form');if(!form)return false;
   if(requireLocation&&!form.reportValidity())return false;
   const lat=form.elements.lat.value,lon=form.elements.lon.value;
   company.lat=lat.trim()===''?null:Number(lat);company.lon=lon.trim()===''?null:Number(lon);company.time=form.elements.time.value;
   company.radius=form.elements.radius.value==='map'?'map':Number(form.elements.radius.value);company.rule=form.elements.rule.value;return true;
  }
  $('commute-panel').addEventListener('submit',e=>{if(e.target.id!=='company-form')return;e.preventDefault();if(readCompanyForm()){renderCommute();city?.setCompanyPosition(window.companyCommuteState?company:null);}});
  $('commute-panel').addEventListener('click',e=>{
   const b=e.target.closest('[data-commute-slot]');if(b){compareB=Number(b.dataset.commuteSlot);renderCommute();}
   const route=e.target.closest('[data-company-route]');if(route){$('island-scope').value='all';recompute();selected=route.dataset.companyRoute;$('island-route').value=selected;compareA=Number(route.dataset.companyPeriod);compareB=Math.min(13,compareA+1);render();$('commute-road-title').scrollIntoView({block:'start'});}
   if(e.target.closest('#company-pick')){readCompanyForm(false);if(!city){$('company-error').textContent='3D 尚未就緒，請直接輸入公司座標。';return;}show('monitor');city.setCompanyPick(true);city.home();city.bird();$('company-pick-notice').hidden=false;}
  });
  $('company-pick-cancel').onclick=()=>{city?.setCompanyPick(false);show('commute');};
  media.addEventListener('change',e=>{reduced=e.matches;if(reduced)stop();city?.setReduced(reduced);render();});document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  const monitored=buildMonitoredSummary(DATA.geography.inventory,DATA.observations);
  monitor=createMonitor({summary:monitored,history:DATA.observations,getCity:()=>city,onState:(_,snapshot)=>{if(window.trafficIslandState)Object.assign(window.trafficIslandState,{view:'live',source:'live'});vdOverlay?.sync(snapshot);vdOverlay?.render();if(vdOverlay?.opened)$('live-detail').hidden=true;}});
  deviceView=createDeviceView({DATA,getCity:()=>city,onSnapshot:next=>vdOverlay?.sync(next)});
  vdOverlay=createVDOverlay({DATA,getCity:()=>city,getContext:()=>summary?{dates:summary.dates,requested:summary.requested,index}:null,onSelection:(device,link)=>{
   selectedVD={device,link};selectedRoad=null;city?.selectRoad(null);
   if(view==='monitor'){const id=link?.reference?.id;if(id&&allSummary?.rows.some(d=>d.id===id)&&!summary.rows.some(d=>d.id===id)){$('island-scope').value='all';recompute();$('scope-notice').hidden=false;$('scope-notice').textContent='已切換全部已盤點方向，顯示所選 VD 的對應路段。';}selected=summary.rows.some(d=>d.id===id)?id:null;$('island-route').value=selected||'';render();$('detail-card').hidden=true;}else if(view==='live'){monitor.select(monitored.rows.some(d=>d.id===link?.id)?link.id:null,false,'overlay');$('live-detail').hidden=true;}
  },onClose:()=>{selectedVD=null;if(view==='monitor'){$('detail-card').hidden=false;render();}if(view==='live'){$('live-detail').hidden=false;monitor.render();}}});
  recompute();window.trafficIsland={show,recompute,selectRoad,selectRoute,selectGate,selectDevice:(id,link)=>view==='devices'?deviceView.select(id,link):vdOverlay.select(id,link),setPeriod(i){if(!Number.isInteger(i)||i<0||i>9)throw Error('超出多日時段');stop();index=i;render();},get scene(){return city;},get data(){return DATA;}};
  $('runtime-status').textContent='資料已載入 · 準備 3D';
  try{
   const module=await Promise.race([import('./traffic-island-scene.js'),new Promise((_,reject)=>setTimeout(()=>reject(Error('3D 元件載入逾時，請檢查網路或改用 2D 備援。')),20000))]);
   city=module.createCity($('canvas-host'),DATA,selection=>{if(selection.miss){if(view==='live')monitor.dismissPopup();return;}stop();if(selection.companyPosition){Object.assign(company,selection.companyPosition);city.setCompanyPosition(company);show('commute');return;}if(selection.road){selectRoad(selection.road);return;}if(selection.device){if(view==='devices')deviceView.select(selection.device,selection.link);else vdOverlay.select(selection.device,selection.link);return;}if(selection.route)selectRoute(selection.route,{source:'map'});if(selection.gate)selectGate(selection.gate,'map');},fail);city.setReduced(reduced);render();try{if(localStorage.getItem('neihu-island-help')!=='seen')help(true);}catch{help(true);}$('loading').hidden=true;document.body.dataset.renderStatus='ready';$('runtime-status').textContent='3D 已就緒 · 全路網模型配置；非實測車數／速度';
   const initialView=new URLSearchParams(location.search).get('view')||(window.ISLAND_DATA?'monitor':'live');if(['monitor','analysis','quality','commute','scenario','live','devices'].includes(initialView))show(initialView);
  }catch(error){fail(error);}
 }catch(error){fail(error);}
}

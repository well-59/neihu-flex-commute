import {validateSnapshot,summarize,periodEvidence,qualityRows} from './route-evidence-model.js';
import {renderEvidenceMap,trafficColor} from './route-evidence-map.js';
const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bearings={E:'東向',W:'西向',N:'北向',S:'南向',NE:'東北向',NW:'西北向',SE:'東南向',SW:'西南向'};
const label=d=>`${d.roadName} · ${bearings[d.bearing]||d.bearing}`;
const fmt=n=>n==null?'—':n.toLocaleString('zh-TW',{maximumFractionDigits:1});
const pct=n=>n==null?'缺值':`${(n*100).toFixed(1)}%`;
const time=i=>`${String(7+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`;
let data,summary,selected,index=4,focusedGate=null;
const gateBearing={G1:"E",G2:"N",G3:"W",G4:"E",G5:"N",G6:"NE"};
const reasons={error_diag:'品質旗標',status:'設備狀態',volume:'車次異常',lane_count:'車道數不符',duplicate_lane:'重複車道',missing_link:'缺路段',missing_minute:'缺分鐘',conflicting_duplicate:'同分鐘衝突'};
function kpis(){
 const t=summary.totals,o=summary.official,f=summary.flow[0],c=summary.congestion[0];
 const cards=[
  ['分析日數',`${summary.dates.length} / ${summary.requested.length}`,'可用日 / 目標日；有快照不等於分鐘完整'],
  ['觀測代表方向',fmt(summary.representativeCount),`範圍內 ${summary.candidatesCount} 個方向；同 LinkID 不重複`],
  ['整體低速時間占比',pct(t.share),`${fmt(t.congested)} / ${fmt(t.classified)} 已分級路段分鐘`],
  ['最高比例時段',summary.peakPeriods.map(p=>time(p.index)).join('、')||'—',summary.peakPeriods.length?`每格 15 分鐘 · ${pct(summary.peakPeriods[0].share)}`:'沒有有效分級，不推測尖峰'],
  ['低速時間占比最高路段',c?pct(c.congestedShare/100):'—',c?`${label(c)} · ${fmt(c.classifiedMinutes)} 分鐘；門檻與點位代表性待核`:'沒有可比較資料'],
  ['平均每分鐘通過車次最高',f?fmt(f.averageMinuteVolume)+' 車次／分鐘':'—',f?`${label(f)} · 07:00–09:30，全車種`:'沒有可比較資料'],
  ['與官方分級相同占比',pct(o.share),`${fmt(o.exact)} / ${fmt(o.minutes)} 配對分鐘 · 非獨立準確率`],
  ['有效車流資料完整度',pct(t.completeness),`有效 ${fmt(t.valid)} / ${fmt(t.expected)} 分鐘；包含缺日`]
 ];
 $('route-kpis').innerHTML=cards.map(([name,value,note],i)=>`<article data-kpi="${i}"><span>${name}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`).join('');
}
function draw(){
 summary=summarize(data,{skipHolidays:$('route-holidays').checked,date:$('route-date').value||null,metric:$('route-metric').value,scope:$('route-scope').value});
 if(!summary.rows.some(r=>r.id===selected)){selected=summary.rows[0]?.id;focusedGate=null;$('map-note').textContent='所選方向不在目前範圍，已選取此範圍的第一個方向。';}
 if(focusedGate&&data.directions.find(d=>d.id===selected)?.vdId!==window.VD_LOCATIONS.records.find(l=>l.gate===focusedGate)?.id)focusedGate=null;
 $('route-coverage').textContent=`${summary.dates.length} / ${summary.requested.length} 日有快照 · ${summary.representativeCount} 個代表方向 · 07:00–09:30`;
 $('route-missing').textContent=summary.requested.length?`已排除 ${summary.excludedHolidayCount} 個假日；${summary.missing.length?'缺少 '+summary.missing.join('、'):'所選日期均有快照'}。來源 2026-09-23–10-22；不同路段有效時刻可能不同。`:'篩選後沒有日期；請取消假日排除或選擇其他日期。';
 const topFlow=summary.flow[0],topJam=summary.congestion[0];
 $('route-insight').textContent=topFlow&&topJam?`平均車流率最高：${label(topFlow)}；低速比例最高：${label(topJam)}。${topFlow.id===topJam.id?'此樣本兩者相同。':'車多與常低速，出現在不同路段。'} 分級比例不是最塞排名。`:'所選日期沒有可排名資料，不將缺值當成順暢。';
 kpis();
 const rows=$('route-limit').value==='10'?summary.ranked.slice(0,10):summary.rows;
 $('route-heat').innerHTML=`<thead><tr><th scope="col">${summary.metric==='flow'?'依平均車流率':'依低速比例'}排序 · ${rows.length} 列</th><th scope="col">${summary.metric==='flow'?'平均每分鐘通過':'低速時間占比'}<small>所選日期 07:00–09:30</small></th><th scope="col">歷史平均車速<small>07:00–09:30</small></th>${Array.from({length:10},(_,i)=>`<th scope="col" class="${index===i?'active-period':''}">${time(i)}</th>`).join('')}</tr></thead><tbody>${rows.map(d=>{
  const h=summary.heat.find(r=>r.direction.id===d.id),flow=summary.flow.find(r=>r.id===d.id),speed=summary.congestion.find(r=>r.id===d.id);
  return `<tr class="${selected===d.id?'selected':''}"><th scope="row"><button data-route="${esc(d.id)}">${d.rank?`第 ${d.rank} 名 · `:''}${esc(label(d))}</button><small>${esc(d.vdId)} · ${d.geometry?.sectionId?'可對照官方路況分級':'未對應官方路況分級'}<br>有效 ${fmt(flow?.validMinutes)} / ${fmt(summary.requested.length*150)} 分鐘</small></th><td>${summary.metric==='flow'?(d.averageMinuteVolume==null?'缺資料':fmt(d.averageMinuteVolume)+' 車次／分鐘'):d.congestedShare==null?'缺資料':fmt(d.congestedShare)+'%'}</td><td title="五分鐘車次加權速度再按有效分鐘平均；非目前車速">${speed?fmt(speed.averageSpeed)+' km/h':'缺資料'}</td>${Array.from({length:10},(_,i)=>{const p=h?.periods[i];return `<td><button data-route="${esc(d.id)}" data-period="${i}" class="${index===i?'active-period':''}" style="--heat:${p?.share==null?0:.12+p.share*.7}" aria-label="${esc(label(d))} ${time(i)}–${time(i+1)} 低速時間占比 ${pct(p?.share)}，${p?.congested??0}/${p?.classified??0} 分鐘" title="低速 ${p?.congested??0} / ${p?.classified??0} 分鐘">${p?.share==null?'—':Math.round(p.share*100)+'%'}</button></td>`;}).join('')}</tr>`;
 }).join('')}</tbody>`;
 $('route-periods').innerHTML=summary.periods.map(p=>`<button data-map-period="${p.index}" aria-pressed="${index===p.index}"><span>${time(p.index)}</span><strong style="color:${trafficColor(p.share)}">${pct(p.share)}</strong></button>`).join('');
 $('route-map-time').textContent=`${time(index)}–${time(index+1)} · ${summary.dates.length===1?summary.dates[0]:'所選日期彙整'}`;
 $('planning-map').innerHTML=renderEvidenceMap(data,summary,index,selected,window.NEIHU_ROADS,window.NeihuRoadScene,window.VD_LOCATIONS);
 for(const l of window.VD_LOCATIONS.records){const pin=$('city-'+l.gate);if(!pin)continue;pin.querySelector('.gate-value').textContent='';pin.querySelector('.vd-point-caption').textContent=l.id+' · '+bearings[gateBearing[l.gate]];pin.classList.toggle('selected',focusedGate===l.gate);}
 document.querySelectorAll('[data-focus-gate]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.focusGate===focusedGate)));
 const valid=summary.heat.filter(r=>r.periods[index].share!==null).length;
 $('route-map-caption').textContent=`此格 ${valid} / ${summary.representativeCount} 個方向有有效分級；${summary.representatives.filter(d=>d.geometry?.shape?.length>1).length} 個方向有線形。低速比例不等於容量；非即時路況。`;
 detail();
}
function quality(d){
 const rows=d?qualityRows(d,summary.requested):[];
 $('route-quality-title').textContent=d?`${label(d)} · ${d.vdId}`:'沒有選取路段';
 $('route-quality-summary').textContent=d?`偵測 ${d.laneCount??'未知'} / 實際 ${d.actualLaneCount??'未知'} 車道；本範圍代表 ${d.vdId}；LinkID ${d.linkId}。逐日量為全車種合計。`:'請選擇有日期的路段。';
 $('route-quality-rows').innerHTML=rows.map(r=>`<tr><th scope="row">${r.date}</th><td>${fmt(r.received)} / 150</td><td>${fmt(r.valid)}</td><td>${fmt(r.speed)}</td><td>${fmt(r.unclassified)}</td><td>${fmt(r.volume)}</td><td>${r.official?.minutes?`${fmt(r.official.exact)} / ${fmt(r.official.minutes)} (${pct(r.official.exact/r.official.minutes)})`:d.geometry?.sectionId?'本日無有效配對':'未對應官方路況分級'}</td><td>${r.reasons?Object.entries(r.reasons).filter(([,n])=>n>0).map(([k,n])=>`${esc(reasons[k]||k)} ${fmt(n)}`).join('、')||'沒有排除原因紀錄':'無此日資料'}</td></tr>`).join('');
}
function detail(){
 const d=data.directions.find(d=>d.id===selected);
 quality(d);
 $('analysis-selected').textContent=d?label(d):'沒有選取路段';
 $('analysis-period').textContent=`${time(index)}–${time(index+1)} · ${summary.dates.length} 個資料日 · ${d?.vdId||'無測點'}`;
 if(!d||!summary.dates.length){$('route-detail').textContent='沒有可用資料。';window.routeEvidenceReport={provenance:data.provenance,dates:summary.dates,requestedDates:summary.requested,scope:summary.scope,official:summary.official,totals:summary.totals,policyEffect:null};return;}
 const p=periodEvidence(d,summary.dates,index,summary.requested),flow=summary.flow.find(r=>r.id===d.id),congestion=summary.congestion.find(r=>r.id===d.id);
 $('route-detail').innerHTML=`<p class="eyebrow">目前查看 / ${esc(d.vdId)} · ${esc(d.linkId)}</p><h3>${esc(label(d))}</h3><p class="route-period">${time(index)}–${time(index+1)} <strong style="color:${trafficColor(p.share)}">${pct(p.share)}</strong><span>低速時間占比</span></p><p>${p.observedDays} 個有資料可判讀的日子中，${p.highDays} 日在這個時段至少一半有效時間為低速。</p><p class="small-note">所選日期的這個時段，共 ${p.classified} 分鐘可判讀，其中 ${p.congested} 分鐘低速。目標共 ${p.expected} 分鐘，缺資料不算順暢；這不是塞車車輛的比例。</p><div class="detail-actions"><button data-open-page="analysis">時段熱度圖 ↗</button><button data-open-page="quality">資料品質 ↗</button></div><details class="route-detail-more"><summary>逐日分布、車流與來源</summary><div class="route-daily">${p.days.map(day=>`<div title="${day.date}：低速 ${day.congested}/${day.classified} 分鐘"><span style="height:${day.share==null?3:Math.max(3,day.share*70)}px" class="${day.share==null?'missing':''}"></span><small>${day.date.slice(5).replace('-','/')}</small></div>`).join('')}</div><p class="small-note">各日同一時段 · 虛線為缺值，短實柱含真實零值；低於 15 個有效分鐘的日期仍有樣本偏差。</p><div class="route-detail-metrics"><span>全部所選日 07–09:30<br><strong>${fmt(flow?.averageMinuteVolume)} 輛／有效分鐘</strong><small>${fmt(flow?.totalObservedVolume)} 車次 ÷ ${fmt(flow?.validMinutes)} 分鐘；全車種合計</small></span><span>已分級分鐘平均速度<br><strong>${fmt(congestion?.averageSpeed)} km/h</strong><small>5 分鐘車次加權速度再按分鐘平均；不是路線旅時</small></span></div><p class="data-boundary">${p.endOfObservation?'已到資料右邊界，不能判定 09:30 後解除壅塞。':'低速比例是樣本描述；較低的時段不代表能承接移入車流。'} 此資料沒有同口徑分車種時序，不從單筆例子推算汽機車比例。</p><details><summary>低速定義、範圍與來源</summary><p>本專案將 E、F 兩級計為低速，依路段適用的速度門檻判讀；不是所有道路共用一個速度標準。例如有效資料共 15 分鐘，其中 6 分鐘為低速，低速時間占比就是 40%。同時選多個日期時，合計各日相同時段的有效分鐘，不是低速天數占比。</p><p>${esc(d.scope.reason)}</p><p>${esc(d.geometry?.congestionLevelBasis||'依隊友快照門檻判讀')}。園區範圍由官方門牌與道路幾何推導，不是官方認證的交通影響範圍。</p></details></details>${d.vdId==='VQBUL20'&&d.bearing==='E'?'<button id="route-single-link" class="quiet">查看同測點東向的 10/22 單日比較 ↗</button>':''}`;
 $('route-single-link')?.addEventListener('click',()=>{window.NeihuDashboard.show('analysis');$('legacy-evidence').open=true;document.querySelector('[data-observed-gate="G1"]').click();$('evidence').scrollIntoView({behavior:'smooth'});});
 window.routeEvidenceReport={provenance:data.provenance,dates:summary.dates,requestedDates:summary.requested,skipHolidays:summary.skipHolidays,rankingMetric:summary.metric,scope:summary.scope,official:summary.official,totals:summary.totals,peakPeriods:summary.peakPeriods,quality:qualityRows(d,summary.requested),map:{period:index,source:"historical",policyEffect:null},selected:{id:d.id,name:label(d),time:`${time(index)}–${time(index+1)}`,...p},ranking:summary.ranked.map(r=>({id:r.id,rank:r.rank,name:label(r),value:summary.metric==='flow'?r.averageMinuteVolume:r.congestedShare})),policyEffect:null};
}
fetch('data/route-clarity.json').then(r=>{if(!r.ok)throw Error('無法載入');return r.json();}).then(d=>{
 data=validateSnapshot(d);
 $('route-date').innerHTML='<option value="">整段期間</option>'+data.coverage.requestedDates.map(date=>`<option value="${date}">${date}${data.holidays.dates.some(d=>d.date===date)?'（假日）':''}${data.coverage.availableDates.includes(date)?'':'（缺資料）'}</option>`).join('');
 $('route-provenance').textContent=`隊友快照 ${data.provenance.generatedAt} · commit ${data.provenance.commit.slice(0,7)}；已核對彙整一致性，原始逐分鐘檔未隨 repo 提供。`;
 $('route-scope').addEventListener('change',()=>{$('route-scope-notice').hidden=true;});
 for(const id of ['route-date','route-metric','route-holidays','route-scope','route-limit'])$(id).addEventListener('change',draw);
 $('route-heat').addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b){selected=b.dataset.route;focusedGate=null;$('map-note').textContent='熱度圖選取的 VD 方向；彩色線為點位分級映射，非整段旅速。';if(b.dataset.period!==undefined)index=Number(b.dataset.period);draw();}});
 $('route-periods').addEventListener('click',e=>{const b=e.target.closest('[data-map-period]');if(b){index=Number(b.dataset.mapPeriod);draw();}});
 const focusGate=gate=>{
  const loc=window.VD_LOCATIONS.records.find(l=>l.gate===gate),d=data.directions.find(d=>d.vdId===loc?.id&&d.bearing===gateBearing[gate]);
  focusedGate=gate;let expanded=false;
  if(d&&!summary.rows.some(r=>r.id===d.id)){$('route-scope').value='all';expanded=true;$('route-scope-notice').hidden=false;$('route-scope-notice').textContent='走廊捷徑已將道路範圍切換為「全部已盤點方向」；八項概況與熱圖同步重算。可在上方道路範圍改回園區。';summary=summarize(data,{skipHolidays:$('route-holidays').checked,date:$('route-date').value||null,metric:$('route-metric').value,scope:'all'});}
  const representative=d&&summary.rows.find(r=>r.linkId===d.linkId);
  if(representative)selected=representative.id;
  draw();
  const caveat=gate==='G6'?'成美橋走廊使用新明路東北向代理點；代理代表性待確認，不是橋上實測。':gate==='G1'?'民權大橋走廊使用民權東路六段東向測點，不是橋上實測。':'顯示此 VD 的單向觀測；不代表整條走廊。';
  $('map-note').textContent=`${loc?.road||gate} · ${loc?.id||'未映射'}。${caveat} ${expanded?'已切換為全部已盤點方向，指標同步重算。':''}${!representative?'多日快照沒有對應方向；右側保留原路段，不補造數值。':''}`;
 };
 document.querySelectorAll('[data-focus-gate]').forEach(b=>b.addEventListener('click',()=>focusGate(b.dataset.focusGate)));
 const mapSelect=e=>{const b=e.target.closest('[data-map-route],[data-map-label]'),pin=e.target.closest('.city-gate'),road=e.target.closest('[data-road-id]');if(b){selected=b.dataset.mapRoute||b.dataset.mapLabel;focusedGate=null;draw();$('map-note').textContent='選取 TDX 路段映射的 VD 分級；不是整段道路旅行速度。';}else if(pin)focusGate(pin.id.replace('city-',''));else if(road){const f=window.NEIHU_ROADS.features.find(f=>String(f.id)===road.dataset.roadId);$('map-note').textContent=`${f?.properties.name||'道路'} · 道路底圖位置，沒有將相鄰 VD 數值套用為此道路的路況。`;}};
 $('route-map').addEventListener('click',mapSelect);$('route-map').addEventListener('keydown',e=>{
  if(e.key!=='Enter'&&e.key!==' ')return;
  const target=e.target.closest('[data-map-route],[data-map-label],.city-gate,[data-road-id]');if(!target)return;
  const attribute=['data-map-route','data-map-label','id','data-road-id'].find(a=>target.hasAttribute(a));
  const selector=`${target.classList.contains('map-road-label')?'.map-road-label':''}[${attribute}="${CSS.escape(target.getAttribute(attribute))}"]`;
  e.preventDefault();mapSelect(e);$('planning-map').querySelector(selector)?.focus({preventScroll:true});
 });
 $('route-open-scenario').addEventListener('click',()=>{window.NeihuDashboard.show('scenario',{focus:true});$('synthetic-example').open=true;$('synthetic-example').scrollIntoView({behavior:'smooth'});});
 draw();
}).catch(error=>{$('route-coverage').textContent='多日證據未通過載入或一致性檢查';$('route-detail').textContent='暫不顯示結論：'+error.message;window.routeEvidenceReport=null;});

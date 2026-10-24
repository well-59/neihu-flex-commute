/* Observation provenance and synthetic scheduling never share numerical inputs. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),M=window.NeihuPlanning,D=window.NEIHU_DATA,E=window.NeihuEvidenceWindows;
 const names={G1:'民權東路六段',G2:'堤頂大道',G3:'環東大道',G4:'內湖路一段',G5:'成功路二段',G6:'新明路代理點'};
 const directions={G1:'東向',G2:'北向',G3:'西向',G4:'東向',G5:'北向',G6:'東北向'};
 const fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:1}):'—';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={baseline:'不調整',uniform:'統一延後',best:'受限分批候選'};
 let gate='G1',slot=5,heatMetric='flow',comparisonStart='07:30',comparisonShift=60,comparison=null,corridorReview=null,windowScan=[],survey=null,config=M.demo(),result,selected='best',historical=null,audit=null;
 const signed=n=>Number.isFinite(n)?`${n>0?'+':''}${fmt(n)}`:'—';
 function evidenceReview(){
  corridorReview=E.corridorSummary(D,{start:comparisonStart,shift:comparisonShift});
  const {counts,rows}=corridorReview,c=comparison;
  $('corridor-window').textContent=`${c.earlier.start}–${c.earlier.end} 對照 ${c.later.start}–${c.later.end}`;
  $('corridor-summary').textContent=`均速較高 ${counts.higher} 點 · 較低 ${counts.lower} 點 · 相同 ${counts.equal} 點${counts.missing?` · 缺格 ${counts.missing} 點`:''}`;
  $('corridor-cards').innerHTML=rows.map(r=>{
   const metrics=r.comparison.metrics;
   return `<article class="corridor-card ${r.gate===gate?'selected':''}"><div class="corridor-card-heading"><h3>${esc(r.name)}</h3><button data-corridor-gate="${r.gate}" aria-pressed="${r.gate===gate}">${r.gate===gate?'正在查看':'查看此點'}</button></div><p>${esc(r.road)} · ${esc(r.direction)}</p><span class="coverage-tag">${esc(r.coverage)}</span><small class="delta-label">後窗 − 前窗 · 各 60 分鐘</small><div class="corridor-deltas"><span>汽車 <b>${signed(metrics.flow.delta)}</b> 車次</span><span>機車 <b>${signed(metrics.moto.delta)}</b> 車次</span><span>車道均速 <b>${signed(metrics.speed.delta)}</b> km/h</span></div></article>`;
  }).join('');
  windowScan=E.scan(D,gate,{start:comparisonStart});
  $('window-scan-rows').innerHTML=windowScan.map(r=>`<tr class="${r.shift===comparisonShift?'selected':''}"><th scope="row">${r.later.start}–${r.later.end}<small>後移 ${r.shift} 分鐘</small></th><td>${signed(r.metrics.flow.delta)}</td><td>${signed(r.metrics.moto.delta)}</td><td>${signed(r.metrics.speed.delta)}</td><td>${r.pairedSpeeds.higher} / ${r.pairedSpeeds.valid}${r.pairedSpeeds.valid<4?' · 配對不足':''}</td><td>${r.overlapMinutes}</td><td><button data-window-shift="${r.shift}" aria-pressed="${r.shift===comparisonShift}">${r.shift===comparisonShift?'已選':'比較'}</button></td></tr>`).join('');
 }
 function compareWindows(){
  comparison=window.NeihuEvidenceWindows.compare(D,gate,{start:comparisonStart,shift:comparisonShift});
  const c=comparison;
  $('window-location').textContent=names[gate]+' · '+directions[gate]+' · '+D.meta.days[0];
  $('window-earlier-label').textContent=`${c.earlier.start}–${c.earlier.end}`;
  $('window-later-label').textContent=`${c.later.start}–${c.later.end}`;
  const [hour,minute]=comparisonStart.split(':').map(Number),startIndex=(hour*60+minute-420)/15,offset=comparisonShift/15;
  $('window-ruler').innerHTML=['earlier','later'].map((key,i)=>`<div class="ruler-track"><span class="ruler-window ${key}" style="left:${(startIndex+i*offset)/14*100}%;width:${4/14*100}%">${c[key].start}–${c[key].end}</span></div>`).join('')+'<div class="ruler-labels"><span>07:00</span><span>08:00</span><span>09:00</span><span>10:30</span></div>';
  $('window-ruler').setAttribute('aria-label',`較早 ${c.earlier.start}–${c.earlier.end}；較晚 ${c.later.start}–${c.later.end}；重疊 ${c.overlapMinutes} 分鐘`);
  const meta={flow:['汽車量 · S＋L＋T','車次 / 60 分鐘'],moto:['機車量 · M','車次 / 60 分鐘'],speed:['車道均速 · 未分車種','km/h · 四格簡單平均']};
  $('window-metrics').innerHTML=Object.entries(meta).map(([key,[label,unit]])=>{
   const m=c.metrics[key],max=Math.max(1,m.earlier??0,m.later??0);
   return `<article class="window-metric ${key}" data-window-metric="${key}"><h4>${label}</h4><div class="window-values">${fmt(m.earlier)} <span>→</span> ${fmt(m.later)}</div><small>${unit}</small><div class="window-bars">${['earlier','later'].map(k=>`<div class="window-bar ${k}" style="width:${m[k]===null?0:m[k]/max*100}%"></div>`).join('')}</div><strong class="window-delta">${m.delta===null?'缺格，暫不比較':`${signed(m.delta)} ${key==='speed'?'km/h':'車次'}${key==='speed'?'':m.percent===null?' · 原值為 0，不計百分比':` (${signed(m.percent)}%)`}`}</strong><small>彙整格 ${m.available[0]}/4 → ${m.available[1]}/4 · 分鐘完整率待核對</small></article>`;
  }).join('');
  const trend=(key,label)=>{const delta=c.metrics[key].delta;return delta===null?`${label}缺格`:delta===0?`${label}相同`:`${label}較${delta>0?'高':'低'}`;};
  $('window-reading').textContent=`較晚時窗：${trend('flow','汽車量')}、${trend('moto','機車量')}、${trend('speed','車道均速')}。`;
  $('window-next').textContent=c.metrics.speed.delta===null?'先補齊車道均速，再檢查時段差異；目前無法判讀速度變化。':c.metrics.speed.delta>0?'下一步查多日旅行時間是否也較短，以及移入額外車流後是否仍能維持。此處尚未證明能承接錯峰車流。':'這個比較沒有顯示較晚時窗的車道均速更高。先追查上下游、號誌與事件，不把延後本身當成改善。';
  $('window-coverage').textContent='資料邊界：單日保留彙整；原始分鐘未核對。汽機車各自比較，不計當日構成、不預測速度、不換算省時。';
  $('window-overlap').textContent=c.overlapMinutes?`兩個時窗重疊 ${c.overlapMinutes} 分鐘，共用部分觀測，並非兩組獨立樣本；不可把兩窗加總。`:'兩個時窗不重疊，但仍是同一天；差異不能歸因於彈性工時。';
  evidenceReview();
 }
 function drawLine(values,x,y,color,width=2){let path='',out='';values.forEach((v,i)=>{if(!Number.isFinite(v)){if(path)out+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="${width}"/>`;path='';}else path+=`${path?'L':'M'}${x(i)},${y(v)} `;});if(path)out+=`<path d="${path}" fill="none" stroke="${color}" stroke-width="${width}"/>`;return out;}
 function observations(){
  compareWindows();
  heatmap();
  const value=M.observed(D,gate,slot),loc=window.VD_LOCATIONS.records.find(x=>x.gate===gate);
  $('observed-title').textContent=names[gate];$('observed-direction').textContent=`${directions[gate]}單向彙整 · ${loc.id}`;
  $('observed-time-label').textContent=`${D.slots[slot]}–${M.time(slot)}`;

  $('detail-selection').textContent=`${names[gate]} · ${D.slots[slot]}–${M.time(slot)}`;
  $('car-count').textContent=fmt(value.car);$('moto-count').textContent=fmt(value.moto);$('speed-value').textContent=fmt(value.speed);
  document.querySelectorAll('[data-observed-gate]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.observedGate===gate));
  for(const [mode,key,color] of [['car','flow','#79ddbf'],['moto','moto','#9ebcf3'],['speed','speed','#ffb279']]){
   const values=D.measured[D.meta.days[0]][gate][key].slice(1),max=Math.max(1,...values.filter(Number.isFinite));
   const x=i=>12+i*625/13,y=v=>50-v/max*40;
   $('trace-'+mode).innerHTML=`<path d="M12 50H637" stroke="#293b45"/><path d="M${x(slot-1)} 5V55" stroke="#ffffff33"/>`+drawLine(values,x,y,color)+`<text x="690" y="14" fill="${color}" text-anchor="end" font-size="12">${fmt(max)}</text><text x="12" y="64" fill="#96aab5" font-size="10">07:00</text><text x="637" y="64" fill="#96aab5" font-size="10" text-anchor="end">10:15</text>`;
   $('trace-'+mode).setAttribute('aria-label',`${names[gate]} ${mode==='speed'?'車道均速':mode==='car'?'汽車':'機車'}；所選 ${D.slots[slot]}：${fmt(value[mode])}；十四格最高 ${fmt(max)}；缺值不補零。`);
  }

 }
 function heatmap(){
  const label={flow:'汽車車次',moto:'機車車次',speed:'車道均速'}[heatMetric],unit=heatMetric==='speed'?'km/h':'車次 / 15 分鐘';
  const values=D.gates.flatMap(g=>D.measured[D.meta.days[0]][g.id][heatMetric].slice(1)).filter(Number.isFinite),max=Math.max(1,...values);
  document.querySelectorAll('[data-heat-metric]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.heatMetric===heatMetric));
  $('observed-heat-caption').textContent=`${label}觀測 · ${unit} · ${heatMetric==='speed'?'速度依數值連續著色，不代表壅塞分級':'顏色越亮，通過數量越多'}。點格子展開逐格指標；不是示範配置後的車流。`;
  $('observed-heatmap').innerHTML='<span></span>'+D.slots.slice(1).map(t=>`<span class="heat-time">${t}</span>`).join('')+D.gates.map(g=>`<span class="heat-label ${gate===g.id?'selected':''}">${names[g.id]}</span>`+D.measured[D.meta.days[0]][g.id][heatMetric].slice(1).map((v,i)=>{
   const color=Number.isFinite(v)?`hsl(${heatMetric==='speed'?32:heatMetric==='moto'?218:161} 32% ${16+v/max*32}%)`:'#29353d';
   return `<button class="heat-cell ${g.id===gate&&slot===i+1?'selected':''}" data-heat-gate="${g.id}" data-heat-slot="${i+1}" style="background:${color}" aria-label="${names[g.id]} ${D.slots[i+1]} ${label} ${fmt(v)} ${unit}">${fmt(v)}</button>`;
  }).join('')).join('');
 }
 function renderHistory(){
  if(!historical)return;
  const s=historical.stations.find(s=>s.id===$('history-station').value),r=M.history(s);
  $('history-moto-share').textContent=fmt(r.motoShare)+'%';
  $('history-source').textContent=`${s.date} · ${s.name} · 與上方 VD 日期、位置及口徑不同`;
  $('history-counts').textContent=`機車 ${fmt(r.moto)} ／小型車 ${fmt(r.small)} ／大型車 ${fmt(r.large)}；分母 ${fmt(r.total)} 車次。`;
  $('history-bar').innerHTML=[['moto','#9ebcf3'],['small','#79ddbf'],['large','#ffb279']].map(([k,color])=>`<span style="width:${r.total?r[k]/r.total*100:0}%;background:${color}" title="${k}: ${r[k]}"></span>`).join('');
  $('history-original').href=`evidence/data/raw/${s.id}.xlsx`;
 }
 function controls(){
  $('car-limit').value=config.limits.car;$('moto-limit').value=config.limits.moto;$('uniform-delay').value=config.uniformDelay;
  $('group-controls').innerHTML=config.groups.map((g,i)=>`<div class="group-control"><label><input type="checkbox" data-group-active="${i}" ${g.active?'checked':''}> ${g.label} · ${M.time(g.slot)}</label><select data-group-delay="${i}" aria-label="${g.label}最晚可延後">${[0,15,30,45,60].map(n=>`<option value="${n}" ${g.maxDelay===n?'selected':''}>${n?'最多 '+n+' 分鐘':'不能調整'}</option>`).join('')}</select><small>示範汽車 ${g.car} ／機車 ${g.moto} 車次 · 原通過時段</small></div>`).join('');
 }
 function compute(){
  result=M.solve(config);
  if(!result[selected].feasible)selected='best';
  $('car-limit-out').textContent=config.limits.car+'%';$('moto-limit-out').textContent=config.limits.moto+'%';
  $('ceiling-summary').textContent=`可移轉上限：汽車 ${result.ceilings.car} ／機車 ${result.ceilings.moto} 車次。這是上限，不是必須移走的數量。`;
  $('search-summary').textContent=`本次完整比較 ${fmt(result.searched)} 組有限選項。四組以各自最晚延後限制，按 15 分鐘步長搜尋；不是允許任意拆批、提前或全路網的最佳解。`;
  renderPlans();
 }
 function renderPlans(){
  $('plans').innerHTML=Object.entries(labels).map(([key,label])=>{
   const p=result[key];return `<article class="plan-card ${key===selected?'selected':''} ${!p.feasible?'invalid':''}" data-plan="${key}"><h4>${label}</h4><span class="plan-status">${!p.feasible?'不符合群組時間限制':key==='baseline'?'保留作為比較基準':'符合輸入條件；道路承接待驗證'}</span>${p.feasible?`<div class="plan-peaks">${fmt(p.metrics.car.peakShare)}% <span class="moto">/ ${fmt(p.metrics.moto.peakShare)}%</span></div><small>尖峰占比 · 汽車 / 機車</small><p>移動 ${p.movedByMode.car} / ${p.movedByMode.moto} 車次</p><p>平均延後 ${fmt(p.averageDelay)} 分<br>最長 ${p.maxDelay} 分</p>`:`<p>${p.reasons.map(esc).join('<br>')}</p>`}<button data-select-plan="${key}" aria-pressed="${key===selected}" ${p.feasible?'':'disabled'}>${key===selected?'正在比較':'查看各批安排'}</button></article>`;
  }).join('');
  const p=result[selected],b=result.baseline;
  $('selected-plan-title').textContent=labels[selected]+' · 獨立合成示範';
  $('selected-plan-explanation').textContent=p.moved?`使用汽車上限 ${p.movedByMode.car}/${result.ceilings.car}、機車上限 ${p.movedByMode.moto}/${result.ceilings.moto} 車次。下圖顯示各車種移入與移出的分布，不是實測路況或上班時間建議。`:'目前保留原配置。零移轉仍是有效選項；不可為了顯示改善強迫參與。';
  for(const [mode,color] of [['car','#79ddbf'],['moto','#9ebcf3']]){
   const max=Math.max(1,...['baseline','uniform','best'].filter(k=>result[k].feasible).flatMap(k=>result[k].after[mode]))*1.15;
   const x=i=>40+i*670/13,y=n=>125-n/max*105;
   let svg='';for(let k=0;k<=2;k++){const n=max*k/2;svg+=`<path d="M40 ${y(n)}H720" stroke="#293b45"/><text x="32" y="${y(n)+4}" fill="#96aab5" text-anchor="end" font-size="10">${Math.round(n)}</text>`;}
   svg+=drawLine(b.after[mode],x,y,'#c29779',2)+drawLine(p.after[mode],x,y,color,3);
   p.after[mode].forEach((n,i)=>{const delta=n-b.after[mode][i];svg+=`<circle cx="${x(i)}" cy="${y(n)}" r="3" fill="${color}"><title>${M.time(i)}：${b.after[mode][i]} → ${n}；${delta>=0?'+':''}${delta} 車次</title></circle>`;if(i%2===0||i===13)svg+=`<text x="${x(i)}" y="150" text-anchor="middle" fill="#96aab5" font-size="10">${M.time(i)}</text>`;});
   $('planned-'+mode).innerHTML=svg;$('planned-'+mode).setAttribute('aria-label',`${mode==='car'?'汽車':'機車'}合成需求，${labels[selected]}，原尖峰 ${b.metrics[mode].peak}，配置後尖峰 ${p.metrics[mode].peak} 車次；非減塞預測。`);
  }
  $('plan-assignments').innerHTML=p.groups.map(g=>`<tr><th scope="row">${esc(g.label)}</th><td>${g.from} → ${g.to}</td><td>${g.counts.car} / ${g.counts.moto}</td><td>${g.stayed.car} / ${g.stayed.moto}</td><td>${g.delay} 分</td></tr>`).join('');
  $('plan-conservation').textContent=`07:00–10:30 全視窗：汽車 ${fmt(b.metrics.car.total)} → ${fmt(p.metrics.car.total)}；機車 ${fmt(b.metrics.moto.total)} → ${fmt(p.metrics.moto.total)} 車次。兩車種各自守恆，沒有刪車或把移出時段藏起來。`;
  const change=mode=>p.metrics[mode].peak-b.metrics[mode].peak;
  $('traffic-result').textContent=`最高格汽車 ${change('car')>0?'+':''}${change('car')} ／機車 ${change('moto')>0?'+':''}${change('moto')} 車次`;
  $('schedule-result').textContent=`移轉車次平均延後 ${fmt(p.averageDelay)} 分鐘`;
 }
 function auditView(){
  audit=window.BaselineAudit.audit(D);
  $('audit-summary').textContent=`${audit.summary.inconsistentGateDays}/${audit.summary.gateDayCount} 點日未通過一致性檢核`;
  $('audit-rows').innerHTML=audit.gates.map(g=>`<tr><th scope="row">${names[g.gateId]}</th><td>${fmt(g.mae)}</td><td>${fmt(g.maxAbsoluteError)}</td><td>${g.status==='INCONSISTENT'?'不一致':'未完成現場驗證'}</td></tr>`).join('');
 }
 $('observed-gates').innerHTML=['G1','G6','G2','G3','G4','G5'].map(id=>`<button data-observed-gate="${id}" aria-pressed="${id===gate}">${names[id]}</button>`).join('');

 $('corridor-cards').addEventListener('click',e=>{const b=e.target.closest('[data-corridor-gate]');if(b){gate=b.dataset.corridorGate;observations();}});
 $('window-scan-rows').addEventListener('click',e=>{const b=e.target.closest('[data-window-shift]');if(b){comparisonShift=Number(b.dataset.windowShift);$('comparison-shift').value=comparisonShift;compareWindows();}});
 $('observed-gates').addEventListener('click',e=>{const b=e.target.closest('[data-observed-gate]');if(b){gate=b.dataset.observedGate;observations();}});
 $('observed-time').addEventListener('input',e=>{slot=Number(e.target.value);observations();});
 $('observed-heat-controls').addEventListener('click',e=>{const b=e.target.closest('[data-heat-metric]');if(b){heatMetric=b.dataset.heatMetric;heatmap();}});
 $('observed-heatmap').addEventListener('click',e=>{const b=e.target.closest('[data-heat-gate]');if(b){gate=b.dataset.heatGate;slot=Number(b.dataset.heatSlot);$('observed-time').value=slot;$('observation-detail').open=true;observations();}});
 $('comparison-start').addEventListener('change',e=>{
  comparisonStart=e.target.value;
  const [h,m]=comparisonStart.split(':').map(Number),max=630-(h*60+m)-60;
  for(const option of $('comparison-shift').options)option.disabled=Number(option.value)>max;
  if(comparisonShift>max){comparisonShift=Math.max(...[...$('comparison-shift').options].filter(o=>!o.disabled).map(o=>Number(o.value)));$('app-status').textContent=`比較時窗須在 10:30 內；後移已調整為 ${comparisonShift} 分鐘。`;}
  $('comparison-shift').value=comparisonShift;compareWindows();
 });
 $('comparison-shift').addEventListener('change',e=>{comparisonShift=Number(e.target.value);compareWindows();});
 $('history-station').addEventListener('change',renderHistory);
 for(const mode of ['car','moto'])$(mode+'-limit').addEventListener('input',e=>{config.limits[mode]=Number(e.target.value);compute();});
 $('uniform-delay').addEventListener('change',e=>{config.uniformDelay=Number(e.target.value);compute();});
 $('group-controls').addEventListener('change',e=>{if(e.target.matches('[data-group-active]'))config.groups[Number(e.target.dataset.groupActive)].active=e.target.checked;if(e.target.matches('[data-group-delay]'))config.groups[Number(e.target.dataset.groupDelay)].maxDelay=Number(e.target.value);compute();});
 $('plans').addEventListener('click',e=>{const b=e.target.closest('[data-select-plan]');if(b&&!b.disabled){selected=b.dataset.selectPlan;renderPlans();}});
 $('reset-planning').addEventListener('click',()=>{config=M.demo();selected='best';controls();compute();});
 $('export-plan').addEventListener('click',()=>{
  const p=result[selected],observed=M.observed(D,gate,slot),hs=historical?.stations.find(s=>s.id===$('history-station').value);
  const report={title:'內湖時間島｜走廊證據與獨立合成示範',status:'DESCRIPTIVE_EVIDENCE_AND_SYNTHETIC_EXAMPLE',selectedPlan:labels[selected],
   observation:{date:D.meta.days[0],gate:gate,name:names[gate],time:D.slots[slot],values:observed,quality:'原始逐分鐘檔未補回；汽機車補正口徑不一致，不計當日比例'},
   observedWindowComparison:{...comparison,source:'data/neihu-data.js',method:'汽機車各自四格加總；車道均速四格簡單平均；缺格不計差異',interpretation:'單日不同時窗，不是錯峰政策前後效果；低流量不等於剩餘容量'},
   corridorReview,windowScan,surveyEvidence:survey,
   multiDayEvidence:window.routeEvidenceReport||null,
   historicalComposition:hs?{station:hs.name,date:hs.date,window:'07:00–09:00',...M.history(hs),source:hs.source,scope:'路口通過次數構成；不套用至當日VD或員工比例'}:null,
   conditions:config,plans:result,selectedGroups:p.groups,
   modelAudit:{status:audit.status,summary:audit.summary,physicalCalibration:audit.physicalCalibration},
   assumptions:['所有配置需求及群體都是合成示範，未使用VD反推需求或容量','時間是過瓶頸時段，不是已確認的上下班時間','汽機車分開守恆，未換算混流容量','可調整上限尚未獲企業確認，勾選僅啟用示範','尖峰集中度不是道路承接能力或減塞效益'],
   pending:['原始同口徑汽機車資料','獨立旅行時間與排隊校準及另日驗證','真實群體、運具、路徑與自願上限','過點與到班時間對應','核心在班、交接、晚下班與營運成本'],
   benefits:{speedAfter:null,commuteMinutesSaved:null,businessNetBenefit:null}};
  const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='內湖走廊證據與假設.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('app-status').textContent='已下載三走廊比較、全部可選時窗與獨立調查；合成配置另列為示範，未當作道路成效。';
 });
 controls();compute();observations();auditView();
 fetch('evidence/data/observations.json').then(r=>{if(!r.ok)throw Error('歷史資料載入失敗');return r.json();}).then(d=>{
  d.stations.forEach(s=>M.history(s));historical=d;survey=E.surveyPeaks(d);
  const complete=survey.rows.filter(r=>r.status==='COMPLETE_SURVEY_WINDOW'),distinctTimes=new Set(complete.flatMap(r=>r.peakTimes.map(t=>t.start)));
  $('survey-title').textContent=complete.length===survey.rows.length&&complete.length?`同日 ${complete.length} 個路口的最高格，分布在 ${distinctTimes.size} 個時段。`:'調查資料不足，暫不歸納路口高峰差異。';
  $('survey-peaks').innerHTML=survey.rows.map(r=>`<article><span>${esc(r.name)}</span><strong>${r.peakTimes.map(t=>`${t.start}–${t.end}`).join('、')||'資料不足'}</strong><div class="survey-timeline">${r.peakTimes.map(t=>{const [h,m]=t.start.split(':').map(Number);return `<i style="left:${(h*60+m-420)/120*100}%" title="${t.start}–${t.end}"></i>`;}).join('')}</div><small>07:00 <span>09:00</span></small><p>樣本最高格 ${fmt(r.maximum)} 車次</p><a href="evidence/data/raw/${encodeURIComponent(r.id)}.xlsx">原始調查 ↗</a></article>`).join('');
  $('history-station').innerHTML=d.stations.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');renderHistory();
 }).catch(()=>{$('history-source').textContent='歷史比例未載入，請透過本機預覽伺服器開啟；不以零值代替。';$('survey-peaks').textContent='歷史調查載入或口徑檢查未通過，暫不顯示結論。';survey=null;$('survey-title').textContent='調查資料未載入，暫不歸納路口高峰差異。';$('app-status').textContent='歷史調查未載入；其餘觀測與示範配置可獨立操作。';});
})();

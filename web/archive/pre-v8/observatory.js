/* Evidence drives the city scene; a separate model drives the experiment. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),D=window.NEIHU_DATA,M=window.Observatory;
  const names={G1:'民權大橋走廊',G2:'堤頂大道',G3:'環東大道',G4:'內湖路一段',G5:'成功路二段',G6:'新明路代理點'};
  const short={G1:'民權走廊',G2:'堤頂大道',G3:'環東大道',G4:'內湖路',G5:'成功路',G6:'新明路代理'};
  const dirs={G1:'東向',G2:'北向',G3:'西向',G4:'東向',G5:'北向',G6:'東北向'};
  const metrics={flow:{label:'汽車量',unit:'車次 / 15 分鐘',color:'#79ddbf'},moto:{label:'機車量',unit:'車次 / 15 分鐘',color:'#9ebcf3'},speed:{label:'車道均速（未分車種）',unit:'km/h',color:'#ffb279'}};
  const cases=[
    {id:'sydney',place:'SYDNEY · 澳洲',title:'讓彈性工時真正被使用',fact:'NSW 機關試驗中，離峰到班比例較基期增加 8.6 個百分點。',limit:'2018 官方報告；受試機關到班行為，不是全市減塞幅度。',lesson:'內湖可試：先談核心在班時段與會議規則，讓主管明確支持參與。',mechanism:'企業制度：先確認會議、交接與服務覆蓋，再邀請自願群體錯峰。',url:'https://www.nsw.gov.au/sites/default/files/2021-05/2018-Behavioural-Insights-Report.pdf'},
    {id:'dutch',place:'NETHERLANDS · 荷蘭',title:'獎勵可被驗證的避峰',fact:'官方彙整評估記載，每位參與者的尖峰汽車旅次減少約 34–39%。',limit:'2016–2020 計畫評估；參與者效果不等於道路總車流減幅。',lesson:'內湖可試：鎖定一個走廊，以實際避峰次數評估誘因，並檢查是否轉移到別處。',mechanism:'自願誘因：先定義避峰的時段與範圍，試辦時追蹤改時間、改路線與改運具的差別；預算待議。',url:'https://www.rijkswaterstaat.nl/zakelijk/zakendoen-met-rijkswaterstaat/werkwijzen/werkwijze-in-gww/nederland-bereikbaar-hinderaanpak/toolbox/factsheet-beloningsprojecten-financieel'},
    {id:'singapore',place:'SINGAPORE · 新加坡',title:'給通勤者一個替代選擇',fact:'Travel Smart Journeys 搭配指定公車獎勵與指定站點離峰搭車優惠。',limit:'現行機制參考；本頁沒有引用可直接套用的道路減塞成效。',lesson:'內湖可試：與企業討論離峰接駁或公共運輸誘因，先核對服務時段與容量。',mechanism:'替代運具：調查自願者起點與接駁需求，確認班次和乘載後再設計誘因；本模型尚未計算運具移轉效果。',url:'https://www.simplygo.com.sg/travel-smart-journeys'}
  ];
  // These editable local examples are design assumptions, not international effect estimates.
  const presets={
    sydney:{label:'澳洲 · 彈性工時',pct:15,shift:30,scope:'示範半小時彈性到班；企業實際可配合比例待訪談。'},
    dutch:{label:'荷蘭 · 自願避峰',pct:20,shift:45,scope:'示範較大參與群體與較長延後；誘因效果及預算尚未估計。'},
    singapore:{label:'新加坡 · 離峰選擇',pct:10,shift:60,scope:'僅試算時間移轉；尚未計入轉乘公車、接駁容量或票價誘因。'}
  };
  let state={gate:'G1',slot:4,metric:'flow',pct:15,shift:30,tail:'continue',plot:'demand',caseId:'sydney',view:'roads',heatMode:'observed'},timer=null,current,allocation;
  const fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:1}):'—';
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const series=gate=>M.observations(D,gate,state.metric);
  const displaySlots=series(state.gate).map(r=>r.time);
  const slotTime=()=>M.time(420+state.slot*15);
  function heatColor(v,max,metric=state.metric) {
    if(v===null)return '#29353d';
    if(metric==='speed')return v<20?'#9b5345':v<30?'#775c3c':v<40?'#425e52':'#2e665c';
    const r=max?v/max:0;
    return metric==='flow'?`hsl(161 32% ${16+r*33}%)`:`hsl(218 33% ${18+r*35}%)`;
  }
  const options=()=>({gateId:state.gate,pct:state.pct,shift:state.shift,tail:state.tail});
  const isPreset=()=>state.pct===presets[state.caseId].pct&&state.shift===presets[state.caseId].shift;
  const parameterSource=()=>`${presets[state.caseId].label} · ${isPreset()?'示範參數':'自訂參數'}`;
  const waitChange=r=>Math.abs(r.deltaWait)<1e-8?'模型總等待不變':`模型總等待${r.deltaWait>0?'增加':'減少'} ${fmt(Math.abs(r.deltaWait)/60)} 車小時`;
  const relativeChange=r=>r.percent===null?'原配置等待為 0，百分比不適用':Math.abs(r.percent)<1e-8?'相對變化 0%':`${r.percent<0?'增加':'減少'} ${Math.abs(r.percent).toFixed(1)}%`;
  const assessmentCopy=r=>({
    unchanged:{title:'原配置對照 · 尚未調整',card:'原配置對照卡',note:'目前未移轉車次，保留作為比較基準。'},
    worse:{title:'等待增加 · 此配置需修訂',card:'配置修訂討論卡',note:'此配置未通過模型初篩，不作為改善建議。延後不會減少總車次，仍須找到有承接空間的時段。'},
    'no-gain':{title:'未顯示總等待改善',card:'配置修訂討論卡',note:'此配置未顯示等待效益，尚不能以通勤改善作為參與誘因。'},
    tradeoff:{title:'原估計改善 · 仍有取捨',card:'有取捨的配置討論卡',note:[r.capacityReversal?'更換容量假設後，等待可能反而增加。':'',r.lateQueueIncreased?'10:30 的模型排隊增加，後段仍有代價。':'','需先釐清取捨，不能直接作為試辦承諾。'].filter(Boolean).join('')},
    candidate:{title:'模型等待減少 · 待驗證',card:'候選配置討論卡',note:'三種容量情境均未增加總等待；這只是一組候選配置，仍需資料校準、企業營運與員工自願條件確認。'}
  }[r.assessment]);
  function renderHeatmap() {
    const simulated=state.heatMode==='scenario',metric=metrics[state.metric];
    const model=simulated?M.fingerprint(D,options()):null;
    const rows=simulated?model.rows.map(r=>r.cells):D.gates.map(g=>series(g.id));
    const max=simulated?model.max:Math.max(1,...rows.flat().map(r=>r.value).filter(Number.isFinite));
    document.querySelectorAll('[data-heat-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.heatMode===state.heatMode));
    $('heatmap').classList.toggle('scenario-heatmap',simulated);
    $('heatmap').dataset.mode=state.heatMode;
    $('fingerprint').dataset.mode=state.heatMode;
    $('heat-kind').textContent=simulated?'模型 · 汽車需求':'觀測 · '+metric.label;
    $('heat-selected').hidden=!simulated;
    if(simulated){const cell=model.rows.find(r=>r.gateId===state.gate).cells[state.slot],observed=M.observations(D,state.gate,'flow')[state.slot].value;
      $('heat-selected').textContent=`${names[state.gate]} ${slotTime()}：汽車觀測 ${fmt(observed)} 車次｜模型原需求 ${fmt(cell.before)} → 調整後 ${fmt(cell.after)} 車次。觀測通過量與模型需求不同，不能直接相減。`;
    }
    $('heat-legend').textContent=(simulated?'汽車需求 · 車次 / 15 分鐘 · 小字為增減':state.metric==='speed'?'橙 <30 · 綠 ≥30 km/h':'淡 → 濃：數量增加')+' · 橙色分界後為 09:30–10:30';
    $('heat-note').textContent=simulated?`${names[state.gate]}：${state.pct}% 延後 ${state.shift} 分鐘。全表為模型需求，僅調整所選點；其餘點保留模型基準，未推算跨入口影響。地圖與右側仍為${metric.label}觀測。`:`${metric.label}觀測彙整；點選任一格連動場景與觀測。調整比例、延後時間或選國外方案，會切至汽車錯峰情境。`;
    $('heatmap').style.setProperty('--slot-count',displaySlots.length);
    $('heatmap').innerHTML='<span></span>'+rows[0].map(r=>`<span class="heat-time ${r.time==='09:30'?'late-start':''} ${r.time>='09:30'?'late-time':''}">${r.time}</span>`).join('')+D.gates.map((g,gi)=>`<span class="heat-label ${g.id===state.gate?'selected':''}">${short[g.id]} · ${dirs[g.id]}</span>`+rows[gi].map((r,i)=>{
      const value=simulated?r.after:r.value,delta=simulated?r.delta:0,changed=Math.abs(delta)>1e-8;
      const deltaText=changed?`${delta>0?'+':'−'}${fmt(Math.abs(delta))}`:'不變';
      const period=`${r.time}–${M.time(435+i*15)}`;
      const description=simulated?`${names[g.id]} ${period} 模型汽車需求 ${fmt(r.before)} → ${fmt(value)} 車次；${deltaText}，非實測`:`${names[g.id]} ${period} ${metric.label} ${fmt(value)} ${metric.unit}`;
      return `<button class="heat-cell ${g.id===state.gate&&i===state.slot?'selected':''} ${r.time==='09:30'?'late-start':''} ${changed?(delta>0?'demand-added':'demand-reduced'):''}" data-cell-gate="${g.id}" data-slot="${i}" data-value="${value??''}" data-delta="${delta}" aria-label="${description}" title="${description}" style="background:${heatColor(value,max,simulated?'flow':state.metric)}"><span>${fmt(value)}</span>${simulated?`<small>${deltaText}</small>`:''}</button>`;
    }).join('')).join('');
    // Keep the selected interval visible inside the horizontal scroller, without moving the page.
    const scroller=$('heatmap').parentElement,bounds=scroller.getBoundingClientRect();
    const selected=$('heatmap').querySelector('.heat-cell.selected').getBoundingClientRect();
    const labelWidth=$('heatmap').querySelector('.heat-label').getBoundingClientRect().width;
    if(selected.right>bounds.right)scroller.scrollLeft+=selected.right-bounds.right+2;
    else if(selected.left<bounds.left+labelWidth)scroller.scrollLeft+=selected.left-bounds.left-labelWidth-4;
  }
  function axes(w,h,max,xStart=35,bottom=27) {
    let s='';const top=14,plotH=h-top-bottom;
    for(let i=0;i<=3;i++){const y=top+plotH*i/3;s+=`<line x1="${xStart}" x2="${w-12}" y1="${y}" y2="${y}" stroke="#2c3e47"/><text x="${xStart-6}" y="${y+3}" fill="#91a5b0" text-anchor="end" font-size="9">${Math.round(max*(3-i)/3)}</text>`;}
    return s;
  }
  function segments(values,x,y,stroke,width=2.5) {
    let current=[],out='';const flush=()=>{if(current.length)out+=`<polyline points="${current.join(' ')}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;current=[];};
    values.forEach((v,i)=>{if(v===null){flush();return;}current.push(`${x(i)},${y(v)}`);});flush();return out;
  }
  function chooseGate(id){if(state.gate!==id){$('operations').checked=false;$('voluntary').checked=false;}state.gate=id;renderObservation();renderScenario();}
  function renderObservation() {
    const rows=D.gates.map(g=>series(g.id)),values=rows.flat().map(x=>x.value).filter(Number.isFinite),max=Math.max(1,...values),metric=metrics[state.metric];
    $('clock').textContent=slotTime();$('clock-end').textContent='— '+M.time(435+state.slot*15);$('time').max=displaySlots.length-1;$('time').value=state.slot;$('scene-unit').textContent=state.metric==='speed'?'km/h · 未分車種':metric.unit;
    document.querySelectorAll('[data-metric]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.metric===state.metric));
    $('gate-buttons').innerHTML=D.gates.map(g=>`<button data-gate="${g.id}" aria-pressed="${g.id===state.gate}">${short[g.id]}</button>`).join('');
    renderHeatmap();
    D.gates.forEach((g,gi)=>{const node=$('city-'+g.id);if(!node)return;node.classList.toggle('selected',g.id===state.gate);node.setAttribute('aria-pressed',g.id===state.gate);const v=rows[gi][state.slot].value;node.querySelector('.gate-value').textContent=fmt(v);node.querySelector('.gate-beacon').setAttribute('fill',heatColor(v,max));});
    const gate=D.gates.find(g=>g.id===state.gate),row=series(gate.id),v=row[state.slot].value,loc=window.VD_LOCATIONS.records.find(l=>l.gate===gate.id);
    $('gate-code').textContent=gate.id;$('gate-name').textContent=names[gate.id];$('gate-road').textContent=loc.road+' · '+dirs[gate.id]+' · '+loc.id;
    $('observed-value').textContent=fmt(v);$('observed-unit').textContent=metric.unit;$('observed-period').textContent=D.meta.days[0]+' / '+slotTime()+'–'+M.time(435+state.slot*15);
    const valid=row.filter(r=>Number.isFinite(r.value));const peak=valid.reduce((a,b)=>b.value>a.value?b:a,{value:-Infinity});
    $('observation-note').textContent=gate.id==='G6'?'成美橋走廊代理點；尚未確認可代表橋梁流量。':state.metric==='speed'?'車道 Speed 彙整，非汽車或機車專屬速度；納入車種口徑待確認。':`本日此點晨峰最高觀測：${peak.time}，${fmt(peak.value)} ${metric.unit}。`;
    const chartMax=Math.max(1,...valid.map(r=>r.value))*1.12,x=i=>35+i*328.5/(row.length-1),y=v=>123-v/chartMax*109;
    let svg=axes(380,150,chartMax)+`<line x1="${x(state.slot)}" x2="${x(state.slot)}" y1="14" y2="122" stroke="#53686f" stroke-dasharray="3 4"/>`;
    svg+=segments(row.map(r=>r.value),x,y,metric.color);
    row.forEach((r,i)=>{if(r.value!==null)svg+=`<circle cx="${x(i)}" cy="${y(r.value)}" r="${i===state.slot?4:2}" fill="${metric.color}"/>`;if([0,6,row.length-1].includes(i))svg+=`<text x="${x(i)}" y="144" text-anchor="middle" fill="#91a5b0" font-size="10">${r.time}</text>`;});
    $('observed-chart').innerHTML=svg;$('observed-chart').setAttribute('aria-label',`${names[gate.id]} ${metric.label}，${slotTime()}為${fmt(v)} ${metric.unit}`);
    $('observed-caption').textContent=state.metric==='moto'?'機車未作缺分鐘補正；不直接與汽車換算占比。':state.metric==='flow'?'S＋L＋T；既有彙整含缺分鐘補正，原始完整率待重驗。':'正值車道樣本的簡單平均，未依流量加權、排除 0 值；不是全程旅行速度。';
    $('metric-scope').textContent=state.metric==='moto'?'機車：只有觀測，尚無錯峰推估。下方比例只移轉汽車模型需求；機車數字不變不代表機車沒有受影響。':state.metric==='speed'?'車速：只有觀測，尚無情境速度模型。未推估汽機車混流、號誌與路段旅行時間，無法由汽車排隊量直接推算新車速。':'汽車：上方是觀測通過量；下方另外試算模型需求與排隊。機車及車速尚無情境推估。';
  }
  function renderScenario() {
    current=M.scenario(D,{gateId:state.gate,pct:state.pct,shift:state.shift,tail:state.tail});const r=current;
    $('share-out').textContent=state.pct+'%';$('share').value=state.pct;$('shift').value=state.shift;
    $('scenario-origin').textContent=parameterSource()+' · 可再調整';
    $('scenario-place').textContent=names[state.gate]+' · 單點情境';
    const verdict=assessmentCopy(r);
    $('cut').textContent=`${fmt(r.baseline.wait/60)} → ${fmt(r.result.wait/60)}`;
    $('cut').classList.toggle('negative',r.deltaWait>1e-8);
    $('cut-label').textContent=`${waitChange(r)} · ${relativeChange(r)}`;
    $('assessment-title').textContent=verdict.title;$('assessment-note').textContent=verdict.note;
    $('assessment').dataset.status=r.assessment;
    $('quick-result').dataset.status=r.assessment;
    $('quick-status').textContent=verdict.title;
    $('quick-wait').textContent=`${fmt(r.baseline.wait/60)} → ${fmt(r.result.wait/60)} 車小時`;
    $('quick-queue').textContent=`10:30 模型排隊 ${fmt(r.lateWindow.queueBefore)} → ${fmt(r.lateWindow.queueAfter)} 輛`;
    $('moved').textContent=fmt(r.moved);$('later').textContent='+'+fmt(r.maxIncrease);
    renderAllocation();
    renderLateWindow(r);
    $('tradeoff').textContent=r.maxIncrease>0?`${r.increaseTime} 起的 15 分鐘增加 ${fmt(r.maxIncrease)} 車次。仍須確認後段能否承接。`:'沒有移轉車次；保留原配置作為對照。';
    $('sensitivity').innerHTML=r.sensitivity.map(s=>`<tr data-factor="${s.factor}"><th scope="row">${s.factor===1?'原估計':s.factor<1?'容量 −5%':'容量 ＋5%'}<small>${fmt(s.capacity)} 車次 / 15 分鐘</small></th><td>${fmt(s.beforeWait/60)} → ${fmt(s.afterWait/60)}</td><td class="${s.deltaWait>1e-8?'negative':''}">${Math.abs(s.deltaWait)<1e-8?'不變':`${s.deltaWait>0?'增加':'減少'} ${fmt(Math.abs(s.deltaWait)/60)}`}<small>${s.percent===null?'原配置為 0；百分比不適用':relativeChange({percent:s.percent})}</small></td></tr>`).join('');
    const isQueue=state.plot==='queue',before=isQueue?r.baseline.rows.map(x=>x.queue):r.before,after=isQueue?r.result.rows.map(x=>x.queue):r.after;
    const n=Math.max(before.length,after.length),max=Math.max(1,...before,...after,...(isQueue?[]:[r.gate.capacity]))*1.15;
    const x=i=>45+i*(700/(n-1)),y=v=>218-v/max*204;
    let svg=axes(760,250,max,45,32);const tailX=x(isQueue?14:15);
    svg+=`<rect x="${tailX}" y="14" width="${Math.max(0,748-tailX)}" height="204" fill="#ffffff06"/><text x="${tailX+5}" y="27" fill="#82949b" font-size="9">未觀測背景假設</text>`;
    if(!isQueue)svg+=`<line x1="45" x2="745" y1="${y(r.gate.capacity)}" y2="${y(r.gate.capacity)}" stroke="#82949b" stroke-dasharray="5 5"/>`;
    svg+=segments(Array.from({length:n},(_,i)=>before[i]||0),x,y,'#c29779',2.5)+segments(Array.from({length:n},(_,i)=>after[i]||0),x,y,'#79ddbf',3);
    [0,3,7,11,15,n-1].filter((v,i,a)=>a.indexOf(v)===i).forEach(i=>{svg+=`<text x="${x(i)}" y="241" text-anchor="middle" fill="#91a5b0" font-size="10">${M.time(405+i*15+(isQueue?15:0))}</text>`;});
    $('scenario-chart').innerHTML=svg;$('scenario-caption').textContent=isQueue?'縱軸：每格末的模型排隊車輛；持續計算至清空。灰區為未觀測背景假設。':'縱軸：反推需求車次 / 15 分鐘；橫軸為時段起點。這不是實測流量或企業到班人數。';
    document.querySelector('.chart-legend .capacity').hidden=isQueue;
    $('case-feedback').textContent=`${r.pct}% 延後 ${r.shift} 分鐘 · ${parameterSource()}：${names[state.gate]}，${waitChange(r)}。${verdict.title}。這是時間配置的試算，並非國外政策的成效比較。`;
    renderHeatmap();renderCases();renderPilot();
  }
  function renderAllocation() {
    allocation=M.allocationComparison(D,options());
    const a=allocation,r=current,batched=a.plans[2],labels=['不調整','統一延後 · 目前主圖','分批比較 · 未套用'];
    $('share-denominator').textContent=`分母：此點 07:30–08:30 的 ${fmt(a.sourceTotal)} 模型汽車車次；${r.pct}% = ${fmt(r.moved)} 車次。不是員工參與率，也不是機車比例。`;
    const source=a.periods[1],later=a.periods.slice(2).reduce((n,p)=>n+p.waits[1]-p.waits[0],0);
    const change=n=>Math.abs(n)<1e-8?'不變':`${n>0?'增加':'減少'} ${fmt(Math.abs(n)/60)} 車小時`;
    $('allocation-reason').textContent=`統一延後：07:30–08:30 等待${change(source.waits[1]-source.waits[0])}；08:30 起至清空${change(later)}。空出的早段容量不能留到後段使用。`;
    $('allocation-plans').innerHTML=a.plans.map((p,i)=>`<tr data-plan="${p.id}"><th scope="row">${labels[i]}</th><td>${fmt(p.moved)}</td><td class="${p.deltaWait>1e-8?'negative':''}"><strong>${fmt(p.result.wait/60)}</strong><small>${i?`較不調整${change(p.deltaWait)}`:'比較基準'}</small></td><td>${fmt(p.averageDelay)} / ${fmt(p.maxDelay)}</td><td>${fmt(p.queue1030)}</td></tr>`).join('');
    const fragile=batched.sensitivity.some(s=>s.deltaWait>1e-8)||batched.queue1030>r.lateWindow.queueBefore+1e-8;
    $('allocation-verdict').textContent=r.moved===0?'目前沒有移轉車次，三列相同。':batched.deltaWait>=-1e-8?'這個比例下，分批比較仍未優於不調整。可降低移轉比例或重新確認可接收時窗；目前沒有模型省時依據支持這批移轉量。':fragile?'分批比較在原估計下等待較少，但容量情境或 10:30 排隊仍有代價；不能直接當作試辦建議。':'分批比較在三種容量情境均未增加總等待，且 10:30 排隊未增加；可列為待校準與企業條件確認的候選。';
    $('allocation-method').textContent=`固定同一批 ${fmt(r.moved)} 車次，四批各選 15–${r.shift} 分鐘、每 15 分鐘一格，共比較 ${fmt(a.searched)} 組；取原估計容量下等待最低者，同等待時取平均延後較短者。${r.moved===0?'無移轉車次，僅比較原配置。':''}相同車次與延後上限，平均延後不一定相同。不是全域最佳解；不含企業可行性。主圖與討論卡主方案仍為統一延後。`;
    $('allocation-weights').textContent=`每格移出 = 該格模型汽車需求 × ${r.pct}%；各批占全部移轉量 = 該格需求 ÷ ${fmt(a.sourceTotal)}。目前是固定移轉量，不是「最多可調整」的上限，沒有員工、汽機車或企業的政策權重。汽車資料包含 S＋L＋T，尚未辨識其中可錯峰的通勤車次。容量 ${fmt(r.gate.capacity)} 車次 / 15 分鐘為未校準估計。`;
    $('allocation-batches').innerHTML=a.batches.map(b=>`<tr><th scope="row">${b.time}</th><td>${fmt(b.moved)} / ${r.moved?fmt(b.weight*100)+'%':'—'}</td><td>${b.delay} 分鐘</td><td>${b.destination}</td></tr>`).join('');
    $('allocation-periods').innerHTML=a.periods.map(p=>`<tr><th scope="row">${p.label}</th>${p.waits.map(w=>`<td>${fmt(w/60)}</td>`).join('')}</tr>`).join('');
    $('allocation-sensitivity').innerHTML=batched.sensitivity.map(s=>`<p>${s.factor===1?'原估計':s.factor<1?'容量 −5%':'容量 ＋5%'}：${fmt(s.beforeWait/60)} → ${fmt(s.afterWait/60)}；${change(s.deltaWait)}</p>`).join('');
  }
  function renderLateWindow(r) {
    const late=r.lateWindow;
    $('late-window-place').textContent=names[state.gate]+' · 09:30–10:30';
    $('late-window-demand').textContent=`${fmt(late.before)} → ${fmt(late.after)}`;
    $('late-window-added').textContent='+'+fmt(late.added);
    $('late-window-queue').textContent=`${fmt(late.queueBefore)} → ${fmt(late.queueAfter)}`;
    $('late-window-rows').innerHTML=late.rows.map((row,i)=>`<tr><th scope="row">${row.time}–${M.time(585+i*15)}</th><td>${fmt(row.observed)}</td><td>${fmt(row.before)}</td><td>${fmt(row.after)}</td><td class="${row.delta>0?'added':''}">${row.delta>0?'+':''}${fmt(row.delta)}</td><td>${fmt(row.queueBefore)} → ${fmt(row.queueAfter)}</td></tr>`).join('');
    $('late-window-note').textContent=(late.added>0?`本情境將 ${fmt(late.added)} 車次移入這一小時，請同時檢查後段排隊。`:'本情境沒有車次移入這一小時；前段造成的排隊仍可能延續。')+' 觀測量是既有 VD 通過量，模型需求包含反推假設；兩者不可直接相減。排隊為模型值。';
  }
  function renderCases() {
    const focused=document.activeElement?.dataset.case;
    $('case-cards').innerHTML=cases.map(c=>{
      const p=presets[c.id],active=state.caseId===c.id,r=active?current:M.scenario(D,{...options(),pct:p.pct,shift:p.shift});
      const status=active?(isPreset()?'使用中 · 示範參數':'使用中 · 自訂參數'):'示範方案預覽';
      return `<article class="case-card ${active?'selected':''}" data-case-card="${c.id}"><span class="case-state">${status}</span><h3 class="case-parameters">${r.pct}% 車次延後 ${r.shift} 分鐘</h3><p class="case-inspiration">受此機制啟發的時間情境</p><span class="case-place">機制來源：${c.place}</span><p class="case-mechanism-title">${c.title}</p><div class="case-simulation"><h4>${names[state.gate]} · 單日未校準模型</h4><strong class="case-impact ${r.deltaWait>1e-8?'negative':''}">${fmt(r.baseline.wait/60)} → ${fmt(r.result.wait/60)}<small>總等待 · 車小時</small></strong><p class="case-change">${waitChange(r)} · ${relativeChange(r)}</p><p class="case-verdict">${assessmentCopy(r).title}</p><div class="case-numbers"><span>移轉 <b>${fmt(r.moved)}</b> 車次</span><span>後段最大新增 <b>+${fmt(r.maxIncrease)}</b> 車次 / 15 分鐘</span></div></div><details class="case-source"><summary>國外依據與本地假設</summary><p class="case-fact">${c.fact}</p><p class="case-limit">${c.limit}</p><p class="case-lesson">${c.lesson}</p><p class="case-assumption">本頁示範設定：${p.pct}% / ${p.shift} 分鐘；非國外實測參數或最佳解。${p.scope}尚未估計此機制會帶來多少參與率。</p></details><div class="case-actions"><button data-case="${c.id}" aria-pressed="${active}" aria-label="套用${p.label}示範：${p.pct}% 延後 ${p.shift} 分鐘">${active?(isPreset()?'重新套用示範 ↻':'恢復示範參數 ↻'):'套用時間情境 →'}</button><a href="${c.url}" target="_blank" rel="noreferrer">官方依據 ↗</a></div></article>`;
    }).join('');
    if(focused)document.querySelector(`[data-case="${focused}"]`)?.focus({preventScroll:true});
  }
  function applyCase(id) {
    const p=presets[id];if(!p)return;
    state.caseId=id;state.pct=p.pct;state.shift=p.shift;changed();
  }
  function renderPilot() {
    const c=cases.find(c=>c.id===state.caseId);
    const verdict=assessmentCopy(current);
    $('pilot-title').textContent=names[state.gate]+' · '+verdict.card;
    $('pilot-assessment').textContent=verdict.title+'。'+verdict.note;
    $('pilot-assessment').dataset.status=current.assessment;
    $('pilot-conditions').textContent=`${parameterSource()}。討論假設：07:30–08:30 的 ${state.pct}% 模型需求，延後 ${state.shift} 分鐘。約 ${fmt(current.moved)} 車次；參與企業與人數仍待調查。`;
    $('pilot-mechanism').textContent=c.mechanism;
    $('pilot-status').textContent=verdict.title+'。'+($('operations').checked&&$('voluntary').checked?'已記錄兩項示範討論；勾選不會改變模型判讀，仍需真實企業確認、原始資料與獨立交通驗證。':'待討論：營運限制、員工自願參與與原始資料品質。');
  }
  function pause(){clearInterval(timer);timer=null;$('play').textContent='▶';$('play').setAttribute('aria-pressed','false');$('play').setAttribute('aria-label','播放晨峰觀測');}
  function renderScene() {
    $('city-scene').innerHTML=state.view==='roads'?window.NeihuRoadScene.render(window.NEIHU_ROADS,window.VD_LOCATIONS):window.NEIHU_CITY_SVG;
    $('city-scene').setAttribute('aria-label',state.view==='roads'?'內湖道路與橋梁位置':'城市情境示意・非道路地圖');
    $('map-legend').hidden=state.view!=='roads';$('road-inspection').hidden=state.view!=='roads';
    $('road-inspection').textContent='點選路名或線段可查看圖資來源；點選 VD 點位可查看交通觀測。';
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===state.view));
    renderObservation();
  }
  function sceneAction(target) {
    const gate=target.closest('.city-gate');
    if(gate){chooseGate(gate.id.replace('city-',''));return;}
    const road=target.closest('[data-road-id]');if(!road)return;
    const feature=window.NEIHU_ROADS.features.find(f=>f.id===road.dataset.roadId),p=feature.properties;
    document.querySelectorAll('[data-road-id]').forEach(el=>el.classList.toggle('selected-road',el.dataset.roadId===feature.id));
    $('road-inspection').innerHTML=`<strong>${esc(p.name||'未命名道路')} · ${p.bridge?'橋梁／高架段':'一般道路段'}</strong><span>圖資路段 OSM ${esc(feature.id)}。此線段沒有獨立的本日交通彙整；右側數字仍為所選 VD 點位。</span><a href="${esc(p.source)}" target="_blank" rel="noreferrer">查看原始線型 ↗</a>`;
  }
  $('city-scene').addEventListener('click',e=>sceneAction(e.target));
  $('city-scene').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();sceneAction(e.target);}});
  $('view-controls').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){state.view=b.dataset.view;renderScene();}});
  $('gate-buttons').addEventListener('click',e=>{const b=e.target.closest('[data-gate]');if(b)chooseGate(b.dataset.gate);});
  $('heatmap').addEventListener('click',e=>{const b=e.target.closest('[data-cell-gate]');if(!b)return;pause();state.slot=Number(b.dataset.slot);chooseGate(b.dataset.cellGate);});
  $('metric-controls').addEventListener('click',e=>{const b=e.target.closest('[data-metric]');if(b){state.metric=b.dataset.metric;state.heatMode='observed';renderObservation();}});
  $('heat-controls').addEventListener('click',e=>{const b=e.target.closest('[data-heat-mode]');if(b){state.heatMode=b.dataset.heatMode;renderHeatmap();}});
  $('time').addEventListener('input',e=>{pause();state.slot=Number(e.target.value);renderObservation();});
  $('play').addEventListener('click',()=>{if(timer){pause();return;}$('play').textContent='Ⅱ';$('play').setAttribute('aria-pressed','true');$('play').setAttribute('aria-label','暫停晨峰觀測');timer=setInterval(()=>{state.slot=(state.slot+1)%displaySlots.length;renderObservation();},1100);});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  function changed(){ $('operations').checked=false;$('voluntary').checked=false;state.heatMode='scenario';$('case-feedback').textContent='';renderScenario(); }
  $('share').addEventListener('input',e=>{state.pct=Number(e.target.value);changed();});$('shift').addEventListener('change',e=>{state.shift=Number(e.target.value);changed();});$('tail').addEventListener('change',e=>{state.tail=e.target.value;changed();});
  $('plot').addEventListener('change',e=>{state.plot=e.target.value;renderScenario();});$('reset').addEventListener('click',()=>{state.pct=0;changed();});
  $('case-cards').addEventListener('click',e=>{const b=e.target.closest('[data-case]');if(b)applyCase(b.dataset.case);});
  ['operations','voluntary'].forEach(id=>$(id).addEventListener('change',renderPilot));
  $('evidence-open').addEventListener('click',()=>{pause();$('evidence').showModal();});$('evidence-close').addEventListener('click',()=>$('evidence').close());
  $('location-list').innerHTML=window.VD_LOCATIONS.records.map(l=>`<div>${esc(l.id)} · ${esc(l.road)} · ${l.lat}, ${l.lon} · ${esc(l.directions.join(' / '))}</div>`).join('');
  $('export').addEventListener('click',()=>{
    const c=cases.find(c=>c.id===state.caseId),r=current;
    const text=`內湖時間島｜${assessmentCopy(r).card}（草案）\n\n模型初篩：${assessmentCopy(r).title}\n${assessmentCopy(r).note}\n\n觀測點：${names[state.gate]} ${r.gate.vds[0]}\n觀測日期：${r.day}（單日彙整，非即時）\n情境：07:30–08:30 的 ${r.pct}% 模型需求延後 ${r.shift} 分鐘\n移轉車次：${fmt(r.moved)}（非參與人數）\n09:30–10:30 模型需求：${fmt(r.lateWindow.before)} → ${fmt(r.lateWindow.after)} 車次；移入 ${fmt(r.lateWindow.added)} 車次\n10:30 模型排隊：${fmt(r.lateWindow.queueBefore)} → ${fmt(r.lateWindow.queueAfter)} 車輛\n後段逐格（觀測汽車量 / 模型原需求 / 調整後需求 / 需求增減；車次每 15 分鐘）：\n${r.lateWindow.rows.map(row=>`${row.time}：${fmt(row.observed)} / ${fmt(row.before)} / ${fmt(row.after)} / +${fmt(row.delta)}`).join("\n")}\n模型總等待：${fmt(r.baseline.wait/60)} → ${fmt(r.result.wait/60)} 車小時；${waitChange(r)}，${relativeChange(r)}，非實際成效\n計算視窗：06:45 起，包含假設背景至排隊清空，非個人省時。\n三種容量情境（離散比較，非連續範圍或信賴區間）：\n${r.sensitivity.map(s=>`${s.factor===1?"原估計":s.factor<1?"容量 -5%":"容量 +5%"}：${fmt(s.beforeWait/60)} → ${fmt(s.afterWait/60)} 車小時；${relativeChange({percent:s.percent})}`).join("\n")}\n後段背景：${r.tail==='continue'?'10:30–11:30 沿用最後一格需求':'10:30–11:30 假設零需求'}；11:30 後無新需求，計算到排隊清空\n\n借鑑機制：${c.title}\n${c.mechanism}\n官方來源：${c.url}\n參數來源：${parameterSource()}\n示範設定：${presets[c.id].pct}% 延後 ${presets[c.id].shift} 分鐘，為本頁設計假設，非國外實測參數或最佳解。\n${presets[c.id].scope}\n國外效果不套用內湖。\n\n示範討論紀錄（不代表真實同意）：\n營運條件：${$('operations').checked?'已討論':'待討論'}\n自願參與：${$('voluntary').checked?'已討論':'待討論'}\n\n待驗證：原始逐分鐘資料、企業路徑及可調整人數、通過時間是否等幅延後、獨立旅行時間、營運與員工影響。以同星期別可比日比較，記錄天氣、事件與後段尖峰。\n模型假設：2 km 進路、初始零排隊、固定容量、單點獨立、只含汽車。六點不能加總成全內湖成效。\n官方VD來源：https://tcgbusfs.blob.core.windows.net/blobtisv/VDLive.xml\n靜態設備來源：${window.VD_LOCATIONS.source}\n靜態資料更新：${window.VD_LOCATIONS.updateTime}\n`;
    const comparisonText=`\n\n配置比較（分批未套用至主方案）：\n${$('share-denominator').textContent}\n${$('allocation-reason').textContent}\n${allocation.plans.map((p,i)=>`${['不調整','統一延後','分批比較'][i]}：移轉 ${fmt(p.moved)} 車次，總等待 ${fmt(p.result.wait/60)} 車小時，平均 / 最長延後 ${fmt(p.averageDelay)} / ${fmt(p.maxDelay)} 分鐘，10:30 排隊 ${fmt(p.queue1030)} 輛`).join("\n")}\n${$('allocation-verdict').textContent}\n${$('allocation-method').textContent}\n${$('allocation-weights').textContent}\n${allocation.batches.map(b=>`${b.time}：移出 ${fmt(b.moved)} 車次，延後 ${b.delay} 分鐘至 ${b.destination}`).join("\n")}\n分批容量檢查：\n${allocation.plans[2].sensitivity.map(s=>`${s.factor*100}% 容量：${fmt(s.beforeWait/60)} → ${fmt(s.afterWait/60)} 車小時`).join("\n")}\n機車與速度僅有觀測，尚無情境推估；不代表沒有影響。\n`;
    const url=URL.createObjectURL(new Blob([text,comparisonText],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`內湖錯峰討論卡-${state.gate}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('pilot-status').textContent=assessmentCopy(r).title+'。已產生討論卡；這是本機草案，尚未送出或取得企業承諾。';
  });
  renderScene();renderScenario();
})();

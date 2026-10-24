(function(){
  'use strict';
  const $=id=>document.getElementById(id),M=window.Negotiation,D=window.NEIHU_DATA;
  const fmt=(v,n=0)=>v.toLocaleString('zh-TW',{maximumFractionDigits:n});
  const config={gateId:'G1',target:20,tail:'continue',constraints:{A:{active:true,maxPct:10,maxShift:30},B:{active:true,maxPct:20,maxShift:45}}};
  const labels={few:'較少人調整',wait:'模型等待較少',balance:'最大調整較小'};
  let confirmed=false,parsed=true,online=false,revision=0,solution=null,selected='few';
  const quotes={A:'甲公司最多10%可晚30分鐘',B:'乙公司最多20%可晚45分鐘'};
  function companies(){
    $('company-cards').replaceChildren();
    for(const id of ['A','B']){
      const c=config.constraints[id],box=document.createElement('div');box.className='company';
      box.innerHTML=`<div class="company-head"><div><strong>${id==='A'?'甲公司 · 電子業':'乙公司 · 金融後台'}</strong><small>${id==='A'?'3,000':'1,200'} 人 · 匿名虛構樣板</small></div><label><input type="checkbox" id="active-${id}" ${c.active?'checked':''}>參與</label></div><div class="company-fields"><div><label for="pct-${id}">最多可調整 (%)</label><input id="pct-${id}" type="number" min="0" max="100" step="5" value="${c.maxPct}"></div><div><label for="shift-${id}">最多延後</label><select id="shift-${id}">${[0,15,30,45,60].map(v=>`<option value="${v}" ${v===c.maxShift?'selected':''}>${v} 分鐘</option>`).join('')}</select></div></div><p class="quote"></p>`;
      box.querySelector('.quote').textContent='條件依據：'+quotes[id];$('company-cards').append(box);
      $(`active-${id}`).onchange=e=>{revision++;c.active=e.target.checked;if(confirmed)search((id==='A'?'甲':'乙')+'公司'+(c.active?'重新參與':'退出，原車流保留')+'。');};
      for(const type of ['pct','shift'])$(`${type}-${id}`).onchange=e=>{
        revision++;c[type==='pct'?'maxPct':'maxShift']=e.target.value===''?NaN:Number(e.target.value);
        quotes[id]='手動修改，請重新確認';box.querySelector('.quote').textContent='條件依據：'+quotes[id];invalidate('條件已修改，請重新確認。');
      };
    }
  }
  function invalidate(message){confirmed=false;solution=null;$('consent').checked=false;$('confirm').disabled=true;$('parse-status').textContent=message;showPending();}
  $('consent').onchange=()=>{if(!$('consent').checked){invalidate('已撤回確認，請重新核對條件。');return;}$('confirm').disabled=!parsed;};
  $('request').oninput=()=>{revision++;parsed=false;invalidate('原句已變更，請重新整理；先前條件不會自動沿用。');};
  $('interpret').onclick=async()=>{
    const text=$('request').value,version=revision;$('interpret').disabled=true;parsed=false;invalidate(online?'Claude 正在整理條件…':'使用離線明確句型整理…');
    try{
      let p;
      if(online){const r=await fetch('/api/interpret',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});const body=await r.json();if(!r.ok)throw Error(body.error||'AI 未能完成，請稍後再試。');p=body;}
      else p=M.parseOffline(text);
      if(version!==revision)return;
      M.validateProposal(p,text);
      if(p.missing.length)throw Error('需要補充：'+p.missing.join('；'));
      for(const c of p.companies){config.constraints[c.id]={...config.constraints[c.id],maxPct:c.maxPct,maxShift:c.maxShift};quotes[c.id]=c.quote;}
      parsed=true;companies();$('parse-status').textContent=(p.mode==='claude'?'Claude 已整理':'離線句型已整理')+'。請核對原句、數字與營運限制，再確認。';
    }catch(e){if(version===revision)$('parse-status').textContent=e.message;}finally{$('interpret').disabled=false;}
  };
  $('confirm').onclick=()=>{if(!parsed||!$('consent').checked)return;confirmed=true;search();};
  $('target').onchange=e=>{config.target=Number(e.target.value);if(confirmed)search('改善目標已更新。');};
  $('tail').onchange=e=>{config.tail=e.target.value;if(confirmed)search('後段背景假設已更新。');else showPending();};
  function search(prefix=''){
    try{
      solution=M.solve(D,config);
      $('result-title').textContent=solution.plans.length?'把不同的安排，放在一起比較。':'目前條件下，沒有達到目標的候選案。';
      $('result-note').textContent=prefix+`搜尋 ${fmt(solution.searched)} 組配置，${fmt(solution.feasible)} 組達到 ${config.target}% 模型等待減幅。`+(solution.plans.length?'三種偏好可能選中同一方案。':'維持原安排仍可行；可調整目標或重新協商上限。');
      $('plan-cards').replaceChildren();
      if(!solution.plans.length){const div=document.createElement('div');div.className='empty';div.textContent=`目前網格最好約減少 ${fmt(solution.best.cut,1)}%。下圖維持原配置，沒有將未達標方案自動套用。`;$('plan-cards').append(div);render(null);return;}
      if(!solution.plans.some(p=>p.key===selected))selected='few';
      for(const p of solution.plans){const b=document.createElement('button');b.className='plan';b.dataset.plan=p.key;b.setAttribute('aria-pressed',String(p.key===selected));b.innerHTML=`<span class="tag">${labels[p.key]}</span><strong>−${fmt(p.cut,1)}<small style="display:inline">%</small></strong><small>${fmt(p.people)} 人調整 · 最多 ${p.maxShift} 分</small>`;b.onclick=()=>{selected=p.key;search();};$('plan-cards').append(b);}
      render(solution.plans.find(p=>p.key===selected));
    }catch(e){solution=null;$('result-title').textContent='這組條件尚不能試算。';$('result-note').textContent=e.message;$('plan-cards').replaceChildren();$('metrics').replaceChildren();$('queue-chart').replaceChildren();$('allocation').replaceChildren();$('sensitivity').textContent='條件未通過驗證';}
  }
  function showPending(){
    $('result-title').textContent='先讓條件一致，再比較效果。';$('result-note').textContent='確認後，同屏比較三種偏好。企業退出會恢復原車流並重新搜尋。';$('plan-cards').innerHTML='<div class="empty">等待條件確認 · 原配置仍完整保留</div>';
    try{render(null);}catch(e){$('result-note').textContent=e.message;$('metrics').replaceChildren();$('queue-chart').replaceChildren();$('allocation').replaceChildren();$('sensitivity').textContent='條件未完整';}
  }
  function render(plan){
    const context=solution?.context||M.prepare(D,config),base=M.queue(context.base,context.gate.capacity),result=plan?.result||base;
    $('metrics').innerHTML=`<div class="metric"><small>模型合計等待</small><b>${fmt(result.wait/60,1)}</b><span>車輛小時</span></div><div class="metric"><small>需調整的員工</small><b>${fmt(plan?.people||0)}</b><span>人</span></div><div class="metric"><small>最大延後幅度</small><b>${plan?.maxShift||0}</b><span>分鐘</span></div>`;
    draw(base,result,context.original.length);
    $('allocation').replaceChildren();
    for(const g of context.groups){const choice=plan?.choices[g.id]||{pct:0,shift:0},c=config.constraints[g.id],row=document.createElement('div');row.className='allocation-row';
      row.innerHTML=`<strong>${g.name}<small style="display:block;color:var(--muted)">${c.active?'參與條件已列入':'已退出・維持原時段'}</small></strong><span>${fmt(g.staff*choice.pct/100)} 人 · 延後 ${choice.shift} 分<br><small>約 ${fmt(g.vehicles*choice.pct/100,1)} 輛經過此口</small></span>`;
      const b=document.createElement('button');b.textContent=c.active?'退出重排':'重新參與';b.disabled=!confirmed;b.dataset.withdraw=g.id;b.onclick=()=>{c.active=!c.active;companies();search(g.name+(c.active?'重新參與':'退出，車仍在原時段')+'。');};row.append(b);$('allocation').append(row);
    }
    if(plan){const results=M.sensitivity(context,plan),vals=results.map(v=>v.cut).filter(v=>v!==null);$('sensitivity').textContent=(vals.length?`等待減幅 ${fmt(Math.min(...vals),1)}% ～ ${fmt(Math.max(...vals),1)}%`:'基準無排隊，不計算減幅')+(vals.length<results.length?' · 部分容量下原配置已無排隊':Math.min(...vals)<config.target?' · 部分假設未達目標':'');}
    else $('sensitivity').textContent='選擇候選方案後檢查';
  }
  function draw(before,after,nObserved){
    const svg=$('queue-chart'),n=Math.max(before.rows.length,after.rows.length),w=690,h=132,left=48,top=22,max=Math.max(10,...before.rows.map(r=>r.queue),...after.rows.map(r=>r.queue))*1.1;
    const x=i=>left+i*w/n,y=v=>top+h-v/max*h;
    const line=rows=>[0,...rows.map(r=>r.queue)].map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    svg.innerHTML=`<rect x="${x(nObserved)}" y="${top}" width="${w*(n-nObserved)/n}" height="${h}" fill="#fff" opacity=".035"/>`;
    for(let i=0;i<=3;i++){const v=max*i/3;svg.innerHTML+=`<path d="M${left},${y(v)}H738" stroke="#32413b"/><text x="40" y="${y(v)+4}" fill="#a2b2a8" text-anchor="end" font-size="10">${fmt(v)}</text>`;}
    svg.innerHTML+=`<path d="${line(before.rows)}" fill="none" stroke="#f0aa79" stroke-width="2.5"/><path d="${line(after.rows)}" fill="none" stroke="#b2eb8e" stroke-width="2.5" stroke-dasharray="5 3"/>`;
    for(let i=0;i<=n;i+=3){const m=405+i*15,t=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');svg.innerHTML+=`<text x="${x(i)}" y="180" text-anchor="middle" fill="#a2b2a8" font-size="10">${t}</text>`;}
  }
  const day=D.meta.days[0];$('survey-date').textContent=day;
  for(const [i,v] of D.measured[day].G1.speed.entries()){const cell=document.createElement('span');cell.textContent=v==null?'—':v;cell.style.background=v==null?'#586158':`hsl(${32+Math.min(1,v/40)*65} 40% ${36+Math.min(1,v/40)*24}%)`;cell.title=`${D.slots[i]} · ${v??'缺測'} km/h`;$('speed-strip').append(cell);}
  companies();showPending();$('parse-status').textContent='已預載虛構企業示範條件，請核對並確認。離線模式只接受明確的比例與時間句型。';
  if(location.protocol.startsWith('http'))fetch('/api/health').then(r=>r.json()).then(s=>{online=s.claude===true;$('ai-mode').textContent=online?'Claude CLI 已偵測':'離線條件模式';}).catch(()=>{});
})();

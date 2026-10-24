/* Persistent panels share one observation selection; synthetic inputs remain independent. */
(()=>{
 const $=s=>document.querySelector(s),main=$('main'),source=$('#route-evidence');
 const names={monitor:'監控總覽',analysis:'路段分析',scenario:'錯峰情境',quality:'資料品質'};
 const pages={};
 for(const key of Object.keys(names)){
  const page=document.createElement('div');page.id=`page-${key}`;page.className='dashboard-page';page.setAttribute('role','tabpanel');page.setAttribute('aria-labelledby',`tab-${key}`);page.tabIndex=0;page.hidden=key!=='monitor';pages[key]=page;main.append(page);
 }
 main.append($('#app-status'));
 source.classList.add('dashboard-filterbar');source.querySelector('.panel-head').remove();
 const move=(selector,key)=>{const el=$(selector);if(el)pages[key].append(el);};
 move('#route-kpis','monitor');move('#route-insight','monitor');move('.route-layout','monitor');
 move('.route-heat-section','analysis');
 const selected=document.createElement('div');selected.className='analysis-selection panel';selected.innerHTML='<div><p class="eyebrow">共用觀測選取</p><h2 id="analysis-selected">請選取路段</h2><p id="analysis-period" class="small-note"></p></div><div class="detail-actions"><button data-open-page="monitor">在唯一地圖查看 ↗</button><button data-open-page="quality">資料品質 ↗</button></div>';pages.analysis.prepend(selected);
 const legacy=document.createElement('details');legacy.id='legacy-evidence';legacy.className='legacy-evidence';legacy.innerHTML='<summary>補充證據：三走廊單日比較與 2025 路口調查 <span>獨立日期與口徑，不跟隨上方多日篩選</span></summary>';pages.analysis.append(legacy);legacy.append($('#corridors'),$('#evidence'));
 move('#synthetic-example','scenario');$('#synthetic-example').open=true;
 const coverage=document.createElement('section');coverage.className='corridor-sources panel';coverage.innerHTML=`<h2>三條走廊，資料落在哪裡？</h2><p class="small-note">同圖呈現位置與歷史分級，不把相關測點當成整條走廊。</p><div class="table-scroll"><table><thead><tr><th>提案走廊</th><th>實際 VD 與方向</th><th>資料界線</th></tr></thead><tbody><tr><th>民權大橋</th><td>VQBUL20 · 民權東路六段 · 東向</td><td>引道相關測點，不是橋上觀測</td></tr><tr><th>成美橋</th><td>VMSV820 · 新明路 · 東北向</td><td>代理代表性待確認；預設園區範圍未納入</td></tr><tr><th>堤頂大道</th><td>VRHT600 · 北向</td><td>快速道路分類；預設園區範圍未納入</td></tr></tbody></table></div><p class="small-note">低速與分時資料：<a href="data/route-clarity.json">匯入快照 JSON</a> · 測點座標：<a href="data/vd-static-selected.xml">官方 VD XML 摘錄</a> · 原始分鐘未提供。三走廊 10/22 單日汽機車補充在「路段分析」，不混入多日統計。</p>`;pages.quality.append(coverage);
 move('.route-quality','quality');move('.route-method','quality');const supplement=document.createElement('details');supplement.className='quality-supplement';supplement.innerHTML='<summary>補充：證據缺口、舊模型稽核與國外試辦方法</summary>';supplement.append($('#readiness'));pages.quality.append(supplement);
 $('.route-next').remove();
 const scenarioLink=document.createElement('button');scenarioLink.id='route-open-scenario';scenarioLink.className='quiet';scenarioLink.textContent='開啟獨立錯峰情境 ↗';pages.analysis.append(scenarioLink);
 $('#map-zoom').addEventListener('click',()=>{const expanded=$('#route-map').classList.toggle('zoomed');$('#map-zoom').setAttribute('aria-pressed',String(expanded));$('#map-zoom').textContent=expanded?'縮回全圖':'放大地圖';});
 let current='monitor';
 const routeFor=hash=>({monitor:'monitor',analysis:'analysis',scenario:'scenario',quality:'quality','route-evidence':'monitor',corridors:'analysis',evidence:'analysis',planning:'scenario',readiness:'quality','synthetic-example':'scenario'}[hash]||'monitor');
 function show(key,{updateHash=true,focus=false}={}){
  if(!pages[key])key='monitor';current=key;
  for(const [id,page] of Object.entries(pages))page.hidden=id!==key;
  document.querySelectorAll('[data-dashboard-tab]').forEach(b=>{const active=b.dataset.dashboardTab===key;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
  source.hidden=key==='scenario';
  $('#dashboard-context').textContent=key==='scenario'?'獨立合成情境｜這裡的車次與條件不套用至觀測地圖。':`${names[key]}｜日期、道路範圍與所選路段共用；切頁保留設定。`;
  if(updateHash&&location.hash!==`#${key}`)history.pushState(null,'',`#${key}`);
  if(focus){pages[key].focus({preventScroll:true});$('.dashboard-tabs').scrollIntoView({behavior:'instant',block:'start'});}
  window.dispatchEvent(new CustomEvent('dashboard:page',{detail:{page:key}}));
 }
 document.addEventListener('click',e=>{const tab=e.target.closest('[data-dashboard-tab]');if(tab){show(tab.dataset.dashboardTab);return;}const link=e.target.closest('[data-open-page]');if(link)show(link.dataset.openPage,{focus:true});});
 $('.dashboard-tabs').addEventListener('keydown',e=>{
  const tabs=[...document.querySelectorAll('[data-dashboard-tab]')],i=tabs.indexOf(e.target);if(i<0)return;
  let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;
  if(next!==undefined){e.preventDefault();tabs[next].focus();show(tabs[next].dataset.dashboardTab);}
 });
 const fromHash=()=>{const hash=location.hash.slice(1);if(['evidence','corridors'].includes(hash))legacy.open=true;if(hash==='readiness')supplement.open=true;show(routeFor(hash),{updateHash:false});};
 window.addEventListener('hashchange',fromHash);window.addEventListener('popstate',fromHash);
 window.NeihuDashboard={show,get page(){return current;}};fromHash();
})();

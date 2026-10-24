const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const pages=await(await fetch(process.env.NEIHU_3D_CDP||'http://[::1]:9342/json')).json();const ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<500;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+expression);};
 const choose=(id,value)=>run(`document.getElementById('${id}').value=${JSON.stringify(value)};document.getElementById('${id}').dispatchEvent(new Event('change'))`);
 const text=selector=>run(`document.querySelector('${selector}').textContent`);
 const navigate=async file=>{await send('Page.navigate',{url:'about:blank'});await wait("location.href==='about:blank'");await send('Page.navigate',{url:'http://127.0.0.1:4173/'+file});};
 const shot=async name=>fs.writeFileSync('/private/tmp/neihu-strip-'+name+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const verifyCells=async()=>{
  // Independently sum the original source bins, not the rendering/model helper.
  const result=await run(`(()=>{const data=trafficIsland.data.observations,dates=trafficIslandState.requested;return [...document.querySelectorAll('#period-comparison [data-heat-route]')].map(b=>{const d=data.directions.find(d=>d.id===b.dataset.heatRoute),i=Number(b.dataset.heatPeriod);let n=0,low=0;for(const day of d.days){if(!dates.includes(day.date))continue;const bin=day.congestionProfile.bins[i];n+=bin[0];low+=bin[1];}const expected=n?(low/n*100).toLocaleString('zh-TW',{maximumFractionDigits:1})+'%':'—';return {actual:b.textContent,expected};});})()`);
  assert.ok(result.length);for(const r of result)assert.equal(r.actual,r.expected);return result.length;
 };
 try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 for(const file of ['traffic-island.html','traffic-island-standalone.html']){
  if(file.includes('standalone'))await send('Network.setBlockedURLs',{urls:['*127.0.0.1:4173/data/*','*127.0.0.1:4173/*.js','*127.0.0.1:4173/*.css']});
  await navigate(file);await wait("window.trafficIsland && ['ready','fallback'].includes(document.body.dataset.renderStatus)");await run("trafficIsland.show('analysis')");
  assert.equal(await verifyCells(),300);assert.equal(await run("document.querySelectorAll('#period-comparison thead [data-heat-column]').length"),10);assert.equal(await run("document.querySelector('#period-comparison .period-cell-detail').open"),false);
  assert.match(await text('#period-comparison thead'),/07:00/);assert.match(await text('#period-comparison thead'),/09:30/);
  const initialOrder=await run("[...document.querySelectorAll('#period-comparison [data-heat-row]')].map(r=>r.dataset.heatRow)");
  await run("document.querySelector('#period-comparison [data-heat-column=\"0\"]').click()");assert.equal(await run('trafficIslandState.index'),0);assert.deepEqual(await run("[...document.querySelectorAll('#period-comparison [data-heat-row]')].map(r=>r.dataset.heatRow)"),initialOrder);
  const selected=await run("(()=>{const b=[...document.querySelectorAll('#period-comparison [data-heat-route]')].find(b=>b.dataset.heatRoute.startsWith('VQBUL20:')&&b.dataset.heatPeriod==='0');const id=b.dataset.heatRoute;b.click();return id})()");
  assert.equal(await run('trafficIslandState.view'),'analysis');assert.equal(await run('trafficIslandState.selected'),selected);assert.ok(await run("document.querySelector('#period-comparison .period-cell-detail').open"));assert.match(await text('#period-comparison .period-cell-detail'),/部分樣本/);assert.match(await text('#period-comparison .period-cell-detail'),/應有 285 分鐘/);
  await choose('island-date','2026-10-22');await verifyCells();const detail=await text('#period-comparison .period-cell-detail');assert.match(detail,/275 車次/);assert.match(detail,/汽車類 157 · 機車 118/);assert.match(detail,/2026-10-22 07:00–07:15/);assert.match(detail,/有效 15／所選日期應有 15 分鐘/);assert.doesNotMatch(detail,/部分樣本/);
  await run(`document.querySelector('[data-heat-route="${selected}"][data-heat-period="9"]').click()`);assert.equal(await run('trafficIslandState.index'),9);assert.match(await text('#period-comparison .period-cell-detail'),/09:15–09:30/);assert.equal(await run("document.querySelector('#analysis-slot').value"),'9');
  await choose('island-date','2026-09-24');assert.match(await text('#period-comparison .period-cell-detail'),/尚無分時車次/);assert.ok(await run("[...document.querySelectorAll('#period-comparison .period-heat-cell')].every(e=>e.textContent==='—')"));await verifyCells();
  await choose('island-date','');await choose('analysis-slot','0');await choose('island-scope','entering');assert.ok(await run("[...document.querySelectorAll('#period-comparison tbody th')].every(e=>e.title.includes('入園方向'))"));await verifyCells();
  if(!file.includes('standalone')){
   await choose('island-scope','park');await run("document.querySelector('#period-comparison .period-cell-detail').open=false;document.querySelector('#period-comparison').scrollIntoView()");await run('new Promise(r=>setTimeout(r,100))');await shot('desktop');
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await run("document.getElementById('period-comparison').scrollIntoView()");assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));
   const left=await run("document.querySelector('#period-comparison tbody th').getBoundingClientRect().left");await run("document.querySelector('#period-comparison .period-scroll').scrollLeft=500");assert.equal(await run("document.querySelector('#period-comparison tbody th').getBoundingClientRect().left"),left);await shot('mobile');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  const selection=await run("(()=>{const b=document.querySelector('#period-comparison [data-select]');const id=b.dataset.select;b.click();return id})()");assert.equal(await run('trafficIslandState.view'),'monitor');assert.equal(await run('trafficIslandState.selected'),selection);assert.equal(await run('trafficIslandState.index'),0);
  console.log('PASS',file,'300 cells match original 15-minute bins; 10 aligned slots; stable order; detail selection; dates/missing/source coverage; explicit map link');
 }
 await send('Network.setBlockedURLs',{urls:[]});await navigate('planner.html');await wait("window.routeEvidenceReport && document.querySelectorAll('#route-period-comparison tbody tr').length>0");await run("document.querySelector('[data-dashboard-tab=analysis]').click()");
 assert.ok(await run("document.querySelector('#page-analysis #route-period-comparison')!==null"));assert.equal(await run("document.querySelectorAll('#route-period-comparison [data-heat-route]').length"),300);
 const picked=await run("(()=>{const b=document.querySelector('#route-period-comparison [data-heat-period=\"3\"]');const id=b.dataset.heatRoute;b.click();return id})()");assert.equal(await run('routeEvidenceReport.selected.id'),picked);assert.equal(await run('NeihuDashboard.page'),'analysis');assert.equal(await run('routeEvidenceReport.map.period'),3);assert.ok(await run("document.querySelector('#route-period-comparison .period-cell-detail').open"));
 await choose('route-date','2026-10-22');await choose('route-analysis-slot','0');assert.match(await text('#route-period-comparison .period-cell-detail'),/07:00–07:15/);await run("document.querySelector('#route-period-comparison [data-route]').click()");assert.equal(await run('NeihuDashboard.page'),'monitor');assert.equal(await run('routeEvidenceReport.map.period'),0);await choose('route-date','2026-09-24');assert.match(await text('#route-period-comparison .period-cell-detail'),/尚無分時車次/);
 assert.deepEqual(errors,[]);console.log('PASS: 2D interactions; mobile sticky road names and no page overflow; standalone with local assets blocked; no uncaught errors');
 }finally{ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

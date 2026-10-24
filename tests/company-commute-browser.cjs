const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const endpoint=process.env.NEIHU_3D_CDP||'http://127.0.0.1:9349/json',page=await(await fetch(endpoint.replace(/\/json$/,'/json/new?about:blank'),{method:'PUT'})).json();
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<400;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+expression);};
 const choose=(id,value)=>run(`document.getElementById('${id}').value=${JSON.stringify(value)};document.getElementById('${id}').dispatchEvent(new Event('change',{bubbles:true}))`);
 const submit=()=>run("document.querySelector('#company-form').requestSubmit()");
 const shot=async name=>fs.writeFileSync('/private/tmp/neihu-company-'+name+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 try{
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"if(location.protocol==='http:')localStorage.setItem('neihu-island-help','seen');"});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/traffic-island.html?view=commute'});await wait("window.trafficIsland && document.body.dataset.renderStatus==='ready'");
  assert.equal(await run('companyCommuteState'),null);const original=await run('JSON.stringify(trafficIsland.data.observations)');
  await choose('company-lat','25.07');await choose('company-lon','121.58');await choose('company-time','08:00');await submit();
  const first=await run('companyCommuteState');assert.equal(first.status,'DISCUSS_FLEX');assert.equal(first.window.label,'07:45–08:00');assert.equal(Object.keys(first.sectors).length,5);assert.ok(first.hits>0);assert.equal(await run("document.querySelectorAll('.company-sector').length"),4);assert.equal(first.policyEffect,null);
  const raw=await run('trafficIsland.data.observations.directions'),requested=await run('trafficIslandState.requested');for(const rows of Object.values(first.sectors))for(const road of rows)for(const p of road.hits){assert.equal(road.bearing,raw.find(d=>d.id===road.id).bearing);const bins=raw.find(d=>d.id===road.id).days.filter(d=>requested.includes(d.date)).map(d=>d.congestionProfile.bins[p.index]);assert.equal(p.index,3);assert.equal(p.congested,bins.reduce((n,b)=>n+b[1],0));assert.equal(p.classified,bins.reduce((n,b)=>n+b[0],0));}
  await shot('desktop');
  const hit=await run("(()=>{const b=document.querySelector('[data-company-route]');return {id:b.dataset.companyRoute,index:Number(b.dataset.companyPeriod)}})()");await run("document.querySelector('[data-company-route]').click()");assert.equal(await run('trafficCommuteState.route'),hit.id);assert.equal(await run('trafficCommuteState.left.index'),hit.index);assert.equal(await run('trafficIslandState.view'),'commute');
  await choose('company-time','08:05');await submit();assert.equal(await run('companyCommuteState.partialSlots'),true);assert.match(await run("document.querySelector('.company-recommendation').textContent"),/無法確定低速分鐘/);
  await choose('company-time','10:00');await submit();assert.equal(await run('companyCommuteState.status'),'INSUFFICIENT_DATA');assert.equal(await run('companyCommuteState.hits'),0);
  await choose('company-time','08:00');await choose('company-rule','any');await submit();assert.ok(await run(`companyCommuteState.hits>=${first.hits}`));await choose('island-date','2026-09-24');assert.equal(await run('companyCommuteState.status'),'INSUFFICIENT_DATA');await choose('island-date','');
  await run("document.querySelector('#company-pick').click()");assert.equal(await run('trafficIsland.scene.companyState().picking'),true);await run("document.querySelector('#company-pick-cancel').click()");assert.equal(await run('trafficIslandState.view'),'commute');assert.equal(await run('trafficIsland.scene.companyState().picking'),false);
  await run("document.querySelector('#company-pick').click();window.scrollTo(0,0);new Promise(r=>setTimeout(r,150))");
  const point=await run(`(()=>{const scene=trafficIsland.scene,rect=scene.renderer.domElement.getBoundingClientRect(),p=scene.project(121.58,25.075,.61).project(scene.camera);return {x:rect.x+(p.x+1)*rect.width/2,y:rect.y+(1-p.y)*rect.height/2}})()`);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await wait("trafficIslandState.view==='commute'");
  const position=await run('companyCommuteState.company');assert.ok(Math.abs(position.lat-25.075)<1e-6);assert.ok(Math.abs(position.lon-121.58)<1e-6);assert.equal(await run('trafficIsland.scene.companyState().picking'),false);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await run('window.scrollTo(0,0)');assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));await shot('mobile');
  assert.equal(await run('JSON.stringify(trafficIsland.data.observations)'),original);
  await send('Network.setBlockedURLs',{urls:['*127.0.0.1:4173/data/*','*127.0.0.1:4173/*.js','*127.0.0.1:4173/*.css']});await send('Page.navigate',{url:'http://127.0.0.1:4173/traffic-island-standalone.html?view=commute'});await wait("window.trafficIsland && document.body.dataset.renderStatus==='ready' && location.pathname.includes('standalone')");
  await choose('company-lat','25.07');await choose('company-lon','121.58');await choose('company-time','08:00');await submit();assert.equal(await run('companyCommuteState.status'),'DISCUSS_FLEX');assert.deepEqual(errors,[]);
  console.log('PASS: company input and actual 3D picking, cardinal groups, raw-bin trigger evidence, arrival overlap, partial-window warning, late/missing dates, rule changes, road comparison links, cancel selection, mobile, standalone and immutable source');
 }finally{await send('Page.close');ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

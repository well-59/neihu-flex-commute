const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const base='http://127.0.0.1:4173',response=await fetch(base+'/api/monitoring');assert.equal(response.status,200);
 const actual=await response.json();assert.equal(actual.schemaVersion,1);assert.ok(actual.rows.length>0);assert.ok(actual.sections.length>0);
 assert.ok(Object.values(actual.sources).every(s=>s.status==='PARSED'));
 const pages=await(await fetch('http://127.0.0.1:9342/json')).json(),ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<1000;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+expression);};
 const navigate=async file=>{await send('Page.navigate',{url:base+'/'+file});await wait("['ready','fallback'].includes(document.body?.dataset.renderStatus)");};
 const shot=async file=>fs.writeFileSync('/tmp/'+file,Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 let startup;
 try{
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  startup=await send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.setItem("neihu-island-help","seen")'});
  await navigate('traffic-island.html?view=live');assert.equal(await run('document.body.dataset.renderStatus'),'ready');
  await wait('window.trafficMonitoringState?.fetchedAt');
  assert.ok(await run('trafficMonitoringState.rows.some(r=>r.flowValid)'),'actual source has fresh usable VD');
  assert.equal(await run("document.querySelector('#timeline').hidden"),true);assert.equal(await run("document.querySelector('#live-detail').hidden"),false);
  assert.equal(await run("document.querySelectorAll('#live-roads-table tbody tr').length"),new Set(actual.rows.map(r=>r.roadName)).size);
  await run("window.testRoute=trafficMonitoringState.rows.find(r=>r.flowValid&&r.speed>0&&r.volumes.M>0&&r.volumes.S>0&&trafficIsland.scene.hasRoute(r.id)).id;trafficIsland.selectRoute(testRoute)");
  await run('new Promise(r=>setTimeout(r,1000))');await shot('neihu-monitor-live-desktop.png');
  assert.ok(await run('trafficIsland.scene.vehicleState().paths.every(p=>p.monitoring&&!p.context&&p.observationId)'));
  // Change the response to exercise the production API -> UI -> fleet path deterministically.
  await run(`window.monitorFixture=${JSON.stringify(actual)};window.originalFetch=window.fetch;window.fetch=async function(url,options){return url==='/api/monitoring'?new Response(JSON.stringify(monitorFixture),{status:200,headers:{'Content-Type':'application/json'}}):originalFetch(url,options)};`);
  const refresh=async()=>{await run("document.querySelector('#live-refresh').click()");await wait("!document.querySelector('#live-refresh').disabled");};
  await run("monitorFixture.rows.forEach(r=>r.dataCollectTime=new Date().toISOString());monitorFixture.sections.forEach(r=>r.dataCollectTime=new Date().toISOString());const chosen=monitorFixture.rows.find(r=>r.id===testRoute);chosen.volumes={M:0,S:80,L:0,T:0};chosen.speed=36;chosen.basicValid=true;monitorFixture.sections=[]");
  await refresh();assert.equal(await run("document.querySelector('#live-motos').textContent"),'0');assert.equal(await run("document.querySelector('#live-cars').textContent"),'80');assert.equal(await run("document.querySelector('#live-speed').textContent"),'36');
  const current=await run('trafficIsland.scene.vehicleState().paths.filter(p=>p.observationId===testRoute).flatMap(p=>p.vehicles)');assert.ok(current.length);assert.ok(current.every(v=>v.kind==='car'&&Math.abs(v.speed-.2)<1e-9));
  await run("monitorFixture.rows.forEach(r=>r.dataCollectTime=new Date(Date.now()-3600000).toISOString());monitorFixture.fetchedAt=new Date().toISOString()");await refresh();
  assert.equal(await run('trafficIsland.scene.vehicleState().cars+trafficIsland.scene.vehicleState().motorcycles'),0);assert.equal(await run('trafficMonitoringState.fresh'),0);assert.match(await run("document.querySelector('#live-direction').textContent"),/過期/);
  // Refresh failure must not replace the source timestamp or revive stale vehicles.
  await run("window.fetch=async function(url,options){if(url==='/api/monitoring')throw Error('fixture network failure');return originalFetch(url,options)}");await refresh();assert.equal(await run('trafficMonitoringState.fresh'),0);assert.match(await run("document.querySelector('#live-connection').textContent"),/fixture network failure/);
  await run('window.fetch=originalFetch');await refresh();assert.ok(await run('trafficMonitoringState.fresh>0'));
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await run("trafficIsland.scene.home();window.scrollTo(0,0)");await shot('neihu-monitor-live-mobile.png');assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await run("trafficIsland.show('scenario')");assert.equal(await run("document.querySelector('#live-controls').hidden"),true);assert.equal(await run('trafficMonitoringState.active'),false);assert.equal(await run('trafficIslandScenario.source'),'SYNTHETIC');
  await run("trafficIsland.show('monitor')");assert.equal(await run('trafficIslandState.source'),'historical');assert.equal(await run("document.querySelector('#live-detail').hidden"),true);assert.equal(await run('trafficIsland.scene.stats().routeCount'),30);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('traffic-island-standalone.html');await run("trafficIsland.show('live')");assert.match(await run("document.querySelector('#live-connection').textContent"),/原專案本機服務/);assert.equal(await run('trafficIsland.scene.vehicleState().cars'),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',actualSources:Object.fromEntries(Object.entries(actual.sources).map(([k,v])=>[k,{count:v.count,updateTime:v.updateTime}])),actualDirections:actual.rows.length,actualRoadNames:new Set(actual.rows.map(r=>r.roadName)).size,checks:['live API to 3D fleet','exact-ID mapped observations only','car/motorcycle density and common measured speed','stale data stops animation despite fresh fetch','network failure preserves age','390px layout','historical/scenario isolation','standalone disclosure','no uncaught browser exceptions']},null,2));
 }finally{if(startup)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:startup.identifier});await send('Page.navigate',{url:'about:blank'});ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

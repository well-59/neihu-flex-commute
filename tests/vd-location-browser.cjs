const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const pages=await(await fetch(process.env.NEIHU_3D_CDP||'http://127.0.0.1:9342/json')).json(),ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[],requests=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);if(m.method==='Network.requestWillBeSent')requests.push(m.params.request.url);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<800;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+expression);};
 const text=id=>run(`document.getElementById('${id}').textContent`);
 const navigate=async file=>{await send('Page.navigate',{url:'about:blank'});await wait("location.href==='about:blank'");await send('Page.navigate',{url:'http://127.0.0.1:4173/'+file});await wait("['ready','fallback'].includes(document.body?.dataset.renderStatus)");};
 const shot=async name=>{await run('new Promise(r=>setTimeout(r,1000))');fs.writeFileSync('/tmp/neihu-vd-'+name+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));};
 let startup;
 try{
  await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
  startup=await send('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.origin==="http://127.0.0.1:4173")localStorage.setItem("neihu-island-help","seen")'});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await navigate('traffic-island.html?view=devices');assert.equal(await run('document.body.dataset.renderStatus'),'ready');
  assert.equal(await run('vdLocationState.count'),128);assert.equal(await run('vdLocationState.inMap'),90);assert.equal(await run('trafficIsland.scene.deviceState().count'),90);
  assert.equal(await run("document.querySelectorAll('#vd-table tbody tr').length"),191);assert.equal(await run('trafficIsland.scene.stats().mode'),'devices');
  assert.equal(await run('trafficIsland.scene.stats().routeCount'),0);assert.match(await text('vd-times'),/最近觀測/);assert.match(await text('vd-times'),/分鐘資料發布/);assert.match(await text('vd-times'),/本機接收/);assert.match(await text('vd-status'),/已保存/);
  assert.ok(!requests.some(url=>url.endsWith('/api/monitoring')),'Device view must not start live requests');
  await run("trafficIsland.selectDevice('VQBUL20','6005320600000A')");assert.equal(await text('vd-link-id'),'6005320600000A');assert.match(await text('vd-lanes'),/道路西向；路段方位西向/);assert.equal(await run('trafficIsland.scene.deviceState().relation.bearing'),'W');
  await run("trafficIsland.selectDevice('V6121A0','2000700100400A')");assert.match(await text('vd-lanes'),/道路北向；路段方位西向/);assert.equal(await run('trafficIsland.scene.deviceState().relation.bearing'),'W');assert.equal(await run('vdLocationState.referenceMatched'),true);
  // Mouse-pick a visible marker using its independently projected official lon/lat.
  await run('trafficIsland.scene.home();new Promise(r=>setTimeout(r,1100))');
  const target=await run(`(()=>{const scene=trafficIsland.scene,rect=scene.renderer.domElement.getBoundingClientRect();return scene.deviceState().positions.map(p=>{const v=scene.project(p.lon,p.lat,1.1).project(scene.camera);return {id:p.id,x:rect.x+(v.x+1)*rect.width/2,y:rect.y+(1-v.y)*rect.height/2};}).find(p=>p.x>450&&p.x<1000&&p.y>340&&p.y<650)})()`);assert.ok(target);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',clickCount:1});assert.equal(await run('vdLocationState.selected'),target.id);
  await run("trafficIsland.selectDevice('VQBUL20','6005320200000A')");await shot('desktop');
  const expected=await run('vdLocationState.device.position');const world=await run("trafficIsland.scene.deviceState().positions.find(p=>p.id==='VQBUL20')");assert.equal(world.lat,expected.lat);assert.equal(world.lon,expected.lon);
  await run("document.querySelector('#vd-search').value='瑞光路';document.querySelector('#vd-search').dispatchEvent(new Event('input'))");assert.equal(await run("document.querySelectorAll('#vd-table tbody tr').length"),8);
  const outside=await run("(()=>{const rows=trafficIsland.data.geography.inventory.rows;return rows.find(r=>r.position.lon>121.605||r.position.lat>25.091||r.position.lat<25.047).vdId})()");await run(`trafficIsland.selectDevice(${JSON.stringify(outside)})`);assert.match(await text('vd-map-note'),/超出目前 3D/);assert.match(await run("document.querySelector('#vd-external').href"),/openstreetmap.org/);
  await run("trafficIsland.selectDevice('VQBUL20','6005320200000A');trafficIsland.scene.home()");await run('new Promise(r=>setTimeout(r,1200))');const count=await run('trafficIsland.scene.stats().frameCount');await run('new Promise(r=>setTimeout(r,350))');assert.equal(await run('trafficIsland.scene.stats().frameCount'),count,'No animation loop in the device view');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await shot('mobile');assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
  await run("trafficIsland.show('monitor')");assert.equal(await run('trafficIsland.scene.deviceState().visible'),true);assert.equal(await run('trafficIsland.scene.deviceState().count'),90);assert.equal(await run('trafficIsland.scene.stats().routeCount'),30);assert.equal(await run("document.querySelector('#vd-detail').hidden"),true);
  await run("trafficIsland.show('scenario')");assert.equal(await run('trafficIsland.scene.deviceState().visible'),false);assert.equal(await run("document.querySelector('#vd-controls').hidden"),true);
  await send('Network.setBlockedURLs',{urls:['*127.0.0.1:4173/data/*','*127.0.0.1:4173/*.js','*127.0.0.1:4173/*.css']});
  await navigate('traffic-island-standalone.html?view=devices');assert.equal(await run('document.body.dataset.renderStatus'),'ready');assert.equal(await run('vdLocationState.count'),128);assert.equal(await run("document.querySelector('#vd-refresh').disabled"),true);
  assert.deepEqual(errors,[]);console.log('PASS: 128 devices / 90 map points / 191 directions, exact official coordinates, click picking, road direction versus local bearing, separate observation/publication/reception times, 38 off-map devices disclosed, road search, no polling or vehicle animation, historical/scenario isolation, 390px layout, standalone with local assets blocked.');
 }finally{await send('Network.setBlockedURLs',{urls:[]});if(startup)await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:startup.identifier});await send('Page.navigate',{url:'about:blank'});ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const endpoint=process.env.NEIHU_3D_CDP||'http://127.0.0.1:9345/json';const page=await(await fetch(endpoint.replace(/\/json$/, '/json/new?about:blank'),{method:'PUT'})).json();const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<500;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout: '+expression);};
 const choose=(id,value)=>run(`document.getElementById('${id}').value=${JSON.stringify(value)};document.getElementById('${id}').dispatchEvent(new Event('change'))`);
 const text=selector=>run(`document.querySelector('${selector}').textContent`);
 const navigate=async file=>{await send('Page.navigate',{url:'about:blank'});await wait("location.href==='about:blank'");await send('Page.navigate',{url:'http://127.0.0.1:4173/'+file});};
 const shot=async name=>fs.writeFileSync('/private/tmp/neihu-strip-'+name+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const point=async id=>{await run(`trafficIsland.scene.focusRoad(${JSON.stringify(id)})`);await run('new Promise(r=>setTimeout(r,150))');return run(`(()=>{const r=trafficIsland.scene.roadState().records.find(r=>r.id===${JSON.stringify(id)}),p=trafficIsland.scene.camera.position.clone().set(...r.a).lerp(trafficIsland.scene.camera.position.clone().set(...r.b),.5).project(trafficIsland.scene.camera),b=trafficIsland.scene.renderer.domElement.getBoundingClientRect();return {x:b.x+(p.x+1)/2*b.width,y:b.y+(1-p.y)/2*b.height};})()`);};
 const click=async id=>{const p=await point(id);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...p});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...p});};
 try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"if(location.protocol==='http:')localStorage.setItem('neihu-island-help','seen')"});
 for(const file of ['traffic-island.html','traffic-island-standalone.html']){
  if(file.includes('standalone'))await send('Network.setBlockedURLs',{urls:['*127.0.0.1:4173/data/*','*127.0.0.1:4173/*.js','*127.0.0.1:4173/*.css']});
  await navigate(file);await wait("window.trafficIsland && document.body.dataset.renderStatus==='ready'");
  if(!file.includes('standalone')){
   const layers=await run(`(async()=>{const THREE=await import('three'),{createRoadInspector}=await import('./road-inspector.js');const group=new THREE.Group(),host=document.createElement('div');const layer=createRoadInspector(group,host,[{id:'lower',segmentNames:['平面路'],sources:['a'],segments:[{a:[-1,.65,0],b:[1,.65,0],route:null}]},{id:'upper',segmentNames:['高架路'],sources:['b'],segments:[{a:[0,1.07,-1],b:[0,1.07,1],route:null}]}]);group.updateMatrixWorld(true);const top=layer.pick(new THREE.Raycaster(new THREE.Vector3(0,5,0),new THREE.Vector3(0,-1,0)));const ground=layer.pick(new THREE.Raycaster(new THREE.Vector3(-.5,5,0),new THREE.Vector3(0,-1,0)));group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});const {periodColor}=await import('./traffic-palette.js'),{shareColor}=await import('./traffic-island-scene.js');return {top:top.name,ground:ground.name,palette:[null,0,.2,.5,.8,1].every(v=>periodColor(v)===shareColor(v))};})()`);
   assert.deepEqual(layers,{top:'高架路',ground:'平面路',palette:true});
  }
  const roads=await run('trafficIsland.scene.roadState()'),network=await run('trafficIsland.scene.vehicleState().network');assert.equal(roads.segments,network.edgeCount);assert.equal(network.sourceCount,1273);assert.equal(new Set(roads.records.map(r=>r.id)).size,roads.segments);console.log('coverage',roads.segments,roads.matchedSegments,network.sourceCount);
  const known=roads.records.find(r=>r.route?.startsWith('VQBUL20:')&&Math.hypot(r.b[0]-r.a[0],r.b[2]-r.a[2])>.2);assert.ok(known);
  const p=await point(known.id);await send('Input.dispatchMouseEvent',{type:'mouseMoved',...p});assert.match(await text('.road-hover'),/民權東路六段/);assert.match(await text('.road-hover'),/08:00–08:15/);assert.equal(await run("document.querySelector('.road-hover').hidden"),false);
  await click(known.id);assert.equal(await run('trafficIslandState.selectedRoad'),known.id);assert.equal(await run('trafficIslandState.selected'),known.route);assert.equal(await run("document.querySelectorAll('#island-road-strip [data-heat-route]').length"),10);
  const expected=await run('trafficIslandState.period.share');assert.match(await text('#detail-share'),new RegExp((expected*100).toFixed(1).replace('.','\\.')));
  await run("document.querySelector('#island-road-strip [data-heat-period=\"0\"]').click()");assert.equal(await run('trafficIslandState.index'),0);assert.match(await text('#detail-direction'),/07:00–07:15/);assert.equal(await run('trafficIslandState.selected'),known.route);
  const unknown=roads.records.find(r=>!r.route&&r.name!=='未命名道路'&&Math.hypot(r.b[0]-r.a[0],r.b[2]-r.a[2])>.4);assert.ok(unknown);await click(unknown.id);assert.equal(await run('trafficIslandState.selectedRoad'),unknown.id);assert.equal(await text('#detail-name'),unknown.name);assert.equal(await text('#detail-share'),'缺資料');assert.match(await text('#island-road-strip'),/尚無對應觀測/);
  await choose('island-date','2026-10-22');assert.equal(await run('trafficIslandState.selected'),null);assert.equal(await text('#detail-share'),'缺資料');
  await click(known.id);await choose('island-date','2026-09-24');assert.equal(await text('#detail-share'),'缺資料');assert.ok(await run("[...document.querySelectorAll('#island-road-strip .period-heat-cell')].every(e=>e.textContent==='—')"));await choose('island-date','');
  const outside=roads.records.find(r=>r.route&&r.name==='堤頂大道一段'&&Math.hypot(r.b[0]-r.a[0],r.b[2]-r.a[2])>.25);assert.ok(outside);await click(outside.id);assert.equal(await run('trafficIslandState.scope'),'all');assert.equal(await run('trafficIslandState.selected'),outside.route);assert.match(await text('#scope-notice'),/範圍外/);
  if(!file.includes('standalone')){
   await shot('road-map');await run("document.querySelector('#island-road-strip').scrollIntoView()");await shot('road-strip');
   await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));await shot('road-mobile');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  }
  await run("trafficIsland.show('scenario')");assert.equal(await run("document.querySelector('#island-road-strip').hidden"),true);await run("trafficIsland.show('devices')");assert.equal(await run("document.querySelector('#island-road-strip').hidden"),true);assert.equal(await run("document.querySelector('.road-hover').hidden"),true);await run("trafficIsland.show('monitor')");assert.equal(await run("document.querySelector('#island-road-strip').hidden"),false);
  console.log('PASS',file,'full directed-edge picking coverage, actual hover/ray clicks, missing roads, scope expansion, selected time and single-road strip, other views isolated');
 }
 assert.deepEqual(errors,[]);console.log('PASS no uncaught browser exceptions; standalone independent of local data/scripts; mobile no overflow');
 }finally{await send('Page.close');ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

const assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const endpoint=process.env.NEIHU_3D_CDP||'http://127.0.0.1:9352/json',page=await(await fetch(endpoint.replace(/\/json$/,'/json/new?about:blank'),{method:'PUT'})).json();
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<400;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+expression);};
 const choose=(id,value)=>run(`document.getElementById('${id}').value=${JSON.stringify(value)};document.getElementById('${id}').dispatchEvent(new Event('change',{bubbles:true}))`);
 const submit=()=>run("document.querySelector('#company-form').requestSubmit()");
 const shot=async name=>fs.writeFileSync('/private/tmp/neihu-map-'+name+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));

 const state=()=>run('({position:trafficIsland.scene.camera.position.toArray(),target:trafficIsland.scene.controls.target.toArray(),angle:trafficIsland.scene.controls.getAzimuthalAngle()})');
 const canvasPoint=()=>run(`(()=>{const c=trafficIsland.scene.renderer.domElement,r=c.getBoundingClientRect();for(const fx of [.5,.4,.6,.3])for(const fy of [.45,.35,.55]){const x=r.x+r.width*fx,y=r.y+r.height*fy;if(document.elementFromPoint(x,y)===c&&document.elementFromPoint(x+30,y+8)===c)return {x,y};}throw Error('No unobstructed map point');})()`);
 const drag=async button=>{const p=await canvasPoint();await send('Input.dispatchMouseEvent',{type:'mousePressed',button,buttons:button==='left'?1:2,clickCount:1,...p});for(let i=1;i<=4;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',button,buttons:button==='left'?1:2,x:p.x+i*8,y:p.y+i*2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button,clickCount:1,x:p.x+32,y:p.y+8});await run('new Promise(r=>setTimeout(r,150))');};
 const navigate=async path=>{await send('Page.navigate',{url:'about:blank'});await wait("location.href==='about:blank'");await send('Page.navigate',{url:'http://127.0.0.1:4173/'+path});await wait("window.trafficIsland && document.body.dataset.renderStatus==='ready'");};
 try{
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"if(location.protocol==='http:')localStorage.setItem('neihu-island-help','seen')"});
 await navigate('traffic-island.html');assert.equal(await run('trafficIslandState.view'),'live');
 const liveRect=await run("(()=>{const r=document.querySelector('#live-road-panel').getBoundingClientRect();return {x:r.x,width:r.width}})()");
 let before=await state();await drag('left');let after=await state();assert.ok(Math.abs(after.angle-before.angle)>.01,'left drag rotates');assert.deepEqual(after.target,before.target);
 before=await state();await drag('right');after=await state();assert.notDeepEqual(after.target,before.target,'right drag pans');
 await run("trafficIsland.show('monitor')");assert.equal(await run("document.querySelector('#history-road-panel').hidden"),false);assert.equal(await run("document.querySelector('#live-road-panel').hidden"),true);
 assert.deepEqual(await run("(()=>{const r=document.querySelector('#history-road-panel').getBoundingClientRect();return {x:r.x,width:r.width}})()"),liveRect);
 assert.equal(await run("document.querySelectorAll('[data-history-route]').length"),81);assert.equal(await run("document.querySelector('#history-road-total').textContent"),'21');
 await choose('island-scope','park');assert.equal(await run("document.querySelectorAll('[data-history-route]').length"),30);await choose('island-scope','all');assert.equal(await run("document.querySelectorAll('[data-history-route]').length"),81);
 await run("document.querySelector('#history-road-search').value='瑞光路';document.querySelector('#history-road-search').dispatchEvent(new Event('input'))");
 assert.ok(await run("[...document.querySelectorAll('#history-road-list details')].filter(d=>!d.hidden).length>0"));
 assert.ok(await run("[...document.querySelectorAll('#history-road-list details')].filter(d=>!d.hidden).every(d=>d.dataset.road==='瑞光路')"));
 const selected=await run("(()=>{const b=[...document.querySelectorAll('[data-history-route]')].find(b=>!b.hidden);b.click();return b.dataset.historyRoute})()");
 assert.equal(await run('trafficIslandState.selected'),selected);assert.equal(await run("document.querySelector('#detail-name').textContent"),'瑞光路');
 for(const i of [0,7]){await run(`trafficIsland.setPeriod(${i})`);assert.equal(await run(`document.querySelector('[data-history-route="${selected}"] .live-route-reading').textContent`),await run("'低速 '+(trafficIslandState.period.share*100).toFixed(1)+'%'"));}
 await choose('island-date','2026-09-24');assert.ok(await run("[...document.querySelectorAll('#history-road-list .live-route-reading')].every(e=>e.textContent==='缺資料')"));await choose('island-date','');
 await run("document.querySelector('#history-search-clear').click();document.querySelector('#history-list-toggle').click()");assert.equal(await run("document.querySelector('#history-road-content').hidden"),true);
 await run("trafficIsland.show('live')");assert.equal(await run("document.querySelector('#live-road-content').hidden"),false);assert.equal(await run("document.querySelector('#scene-workspace').classList.contains('monitor-list-collapsed')"),false);
 await run("trafficIsland.show('monitor')");assert.equal(await run("document.querySelector('#history-road-content').hidden"),true);await run("document.querySelector('#history-list-toggle').click()");
 // Inspect the actual fleet geometry sent to the renderer, not source constants.
 await run(`(()=>{const r=trafficIsland.scene.renderer,original=r.render;r.render=function(s,c){window.fleetColors=[];s.traverse(o=>{if(o.isInstancedMesh&&o.material.vertexColors&&o.geometry.attributes.color){const a=o.geometry.attributes.color.array;for(let i=0;i<a.length;i+=3)fleetColors.push([a[i],a[i+1],a[i+2]]);}});r.render=original;return original.call(r,s,c);};trafficIsland.scene.zoomStep(.85);})()`);
 await wait('window.fleetColors?.length>0');assert.equal(await run(`(async()=>{const {Color}=await import('three');return [0xd87556,0x4b9297].every(hex=>{const c=new Color(hex);return fleetColors.some(v=>Math.abs(v[0]-c.r)<1e-6&&Math.abs(v[1]-c.g)<1e-6&&Math.abs(v[2]-c.b)<1e-6);});})()`),true);
 await shot('history-desktop');before=await state();await drag('left');after=await state();assert.ok(Math.abs(after.angle-before.angle)>.01,'history drag rotates');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});await run('window.scrollTo(0,0);new Promise(r=>setTimeout(r,150))');
 const p=await canvasPoint();before=await state();await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+30,y:p.y+8,id:1}]});await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});after=await state();assert.ok(Math.abs(after.angle-before.angle)>.01,'phone single finger rotates');
 assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));await shot('history-mobile');
 await send('Network.setBlockedURLs',{urls:['*127.0.0.1:4173/data/*','*127.0.0.1:4173/*.js','*127.0.0.1:4173/*.css']});await navigate('traffic-island-standalone.html?view=monitor');assert.equal(await run("document.querySelectorAll('[data-history-route]').length"),81);assert.equal(await run("document.querySelector('#history-road-total').textContent"),'21');assert.equal(await run('trafficIsland.scene.controls.mouseButtons.LEFT'),0);assert.equal(await run('trafficIsland.scene.controls.touches.ONE'),0);assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));assert.deepEqual(errors,[]);
 console.log('PASS: live/history mouse rotation and panning, phone touch rotation, original vehicle geometry colours, matching sidebar layout, historical scope/search/selection/period/missing-date data, independent collapse states, mobile and standalone');
 }finally{await send('Page.close');ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

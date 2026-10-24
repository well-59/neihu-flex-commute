const assert=require('node:assert/strict');
(async()=>{
 const endpoint=process.env.NEIHU_3D_CDP||'http://127.0.0.1:9348/json',page=await(await fetch(endpoint.replace(/\/json$/,'/json/new?about:blank'),{method:'PUT'})).json();
 const ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expression=>{for(let i=0;i<400;i++){if(await run(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+expression);};
 const choose=(id,value)=>run(`document.getElementById('${id}').value=${JSON.stringify(value)};document.getElementById('${id}').dispatchEvent(new Event('change',{bubbles:true}))`);
 try{
  await send('Runtime.enable');await send('Page.enable');await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:"if(location.protocol==='http:')localStorage.setItem('neihu-island-help','seen');"});
  await send('Page.navigate',{url:'http://127.0.0.1:4173/traffic-island.html?view=scenario'});await wait("window.trafficIsland && document.body.dataset.renderStatus==='ready'");
  assert.equal(await run('trafficIslandState.view'),'commute');assert.equal(await run("document.querySelector('[data-view=scenario]')"),null);assert.equal(await run('typeof trafficIslandScenario'),'undefined');
  const snapshot=await run('JSON.stringify(trafficIsland.data.observations)');
  await choose('island-scope','all');await choose('island-route','VQBUL20:6005320200000A');await choose('island-date','2026-10-22');await choose('commute-a','0');await choose('commute-b','1');
  const state=await run('trafficCommuteState');assert.equal(state.route,'VQBUL20:6005320200000A');assert.deepEqual(state.commonDates,['2026-10-22']);assert.equal(state.left.flow.total,275);assert.equal(state.left.flow.volumes.M,118);
  const raw=await run("trafficIsland.data.observations.directions.find(d=>d.id==='VQBUL20:6005320200000A').days.find(d=>d.date==='2026-10-22').congestionProfile.bins");assert.equal(state.left.period.classified,raw[0][0]);assert.equal(state.left.period.congested,raw[0][1]);assert.ok(Math.abs(state.difference-(raw[1][1]/raw[1][0]-raw[0][1]/raw[0][0])*100)<1e-10);
  const other=await run("[...document.querySelector('#island-route').options].find(o=>o.value!=='VQBUL20:6005320200000A').value");await choose('island-route',other);assert.equal(await run('trafficCommuteState.route'),other);
  await run("document.querySelector('[data-commute-slot=\"13\"]').click()");assert.equal(await run('trafficCommuteState.right.index'),13);assert.equal(await run('trafficCommuteState.right.period'),null);assert.equal(await run('trafficCommuteState.policyEffect'),null);
  await choose('island-date','2026-09-25');assert.equal(await run('trafficCommuteState.left.period.expected'),0);assert.equal(await run('trafficCommuteState.difference'),null);
  await choose('island-date','2026-10-22');await choose('commute-b','2');await run("document.querySelector('#commute-panel [data-period=\"2\"]').click()");assert.equal(await run('trafficIslandState.view'),'monitor');assert.equal(await run('trafficIslandState.selected'),other);assert.equal(await run('trafficIslandState.index'),2);
  await run("trafficIsland.show('commute')");assert.equal(await run('trafficCommuteState.route'),other);assert.equal(await run('JSON.stringify(trafficIsland.data.observations)'),snapshot);assert.deepEqual(errors,[]);
  console.log('PASS: old URL opens historical comparison, no synthetic output, raw-bin agreement, exact vehicle samples, shared road/date/holiday filters, late missing slots, map handoff, immutable source, no runtime errors');
 }finally{await send('Page.close');ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

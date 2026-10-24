const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
(async()=>{
 const pages=await(await fetch('http://127.0.0.1:9341/json')).json(),ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
 let id=0;const pending=new Map(),errors=[];
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=async expr=>{for(let i=0;i<100;i++){if(await run(expr))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+expr);};
 try{
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1180,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:pathToFileURL(path.resolve(__dirname,'../web/negotiation.html')).href});await wait("document.querySelectorAll('#speed-strip span').length===15");
 assert.equal(await run("document.querySelector('#confirm').disabled"),true);
 await run("document.querySelector('#consent').click();document.querySelector('#confirm').click()");
 assert.equal(await run("document.querySelectorAll('.plan').length"),3);
 assert.match(await run("document.querySelector('#result-note').textContent"),/65 組/);
 await run("document.querySelector('#consent').click()");assert.equal(await run("document.querySelectorAll('.plan').length"),0);assert.equal(await run("document.querySelector('[data-withdraw]').disabled"),true);
 await run("document.querySelector('#consent').click();document.querySelector('#confirm').click();document.querySelector('[data-withdraw=A]').click()");
 assert.match(await run("document.querySelector('#result-note').textContent"),/甲公司退出/);
 await run("document.querySelector('[data-withdraw=B]').click()");assert.equal(await run("document.querySelectorAll('.plan').length"),0);assert.match(await run("document.querySelector('#result-note').textContent"),/維持原安排仍可行/);
 await run("document.querySelector('[data-withdraw=A]').click();document.querySelector('[data-withdraw=B]').click()");
 await run("document.querySelector('#pct-A').value='101';document.querySelector('#pct-A').dispatchEvent(new Event('change'))");assert.equal(await run("document.querySelector('#queue-chart').children.length"),0);assert.match(await run("document.querySelector('#result-note').textContent"),/補齊/);
 await run("document.querySelector('#pct-A').value='10';document.querySelector('#pct-A').dispatchEvent(new Event('change'));document.querySelector('#consent').click();document.querySelector('#confirm').click()");
 await run("document.querySelector('#request').value+='；客服不能晚到';document.querySelector('#request').dispatchEvent(new Event('input'));document.querySelector('#interpret').click()");await wait("!document.querySelector('#interpret').disabled");assert.match(await run("document.querySelector('#parse-status').textContent"),/需要補充/);await run("document.querySelector('#consent').click()");assert.equal(await run("document.querySelector('#confirm').disabled"),true);
 await run("document.querySelector('#request').value='甲公司最多10%可晚30分鐘；乙公司最多20%可晚45分鐘';document.querySelector('#request').dispatchEvent(new Event('input'));document.querySelector('#interpret').click()");await wait("!document.querySelector('#interpret').disabled");await run("document.querySelector('#consent').click();document.querySelector('#confirm').click();document.querySelector('[data-plan=wait]').click()");
 assert.equal(await run("document.querySelectorAll('.plan').length"),3);assert.match(await run("document.querySelector('#sensitivity').textContent"),/等待減幅/);
 fs.writeFileSync('/private/tmp/neihu-negotiation-desktop.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
 fs.writeFileSync('/private/tmp/neihu-negotiation-mobile.png',Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})).data,'base64'));
 await send('Page.navigate',{url:'http://127.0.0.1:4173/negotiation.html'});await wait("document.querySelector('#ai-mode')?.textContent==='Claude CLI 已偵測'");
 await run(`window.realFetch=window.fetch;window.fetch=(url,opts)=>url==='/api/interpret'?new Promise(resolve=>{window.finishAI=()=>resolve({ok:true,json:async()=>({mode:'claude',companies:[{id:'A',maxPct:10,maxShift:30,quote:'甲公司最多10%可晚30分鐘'},{id:'B',maxPct:20,maxShift:45,quote:'乙公司最多20%可晚45分鐘'}],missing:[]})});}):window.realFetch(url,opts);document.querySelector('#interpret').click()`);
 await wait("typeof window.finishAI==='function'");await run("document.querySelector('#pct-A').value='5';document.querySelector('#pct-A').dispatchEvent(new Event('change'));window.finishAI()");await wait("!document.querySelector('#interpret').disabled");assert.equal(await run("document.querySelector('#pct-A').value"),'5');assert.equal(await run("document.querySelector('#confirm').disabled"),true);
 await run("window.fetch=window.realFetch");
 if(process.argv.includes('--live')){
   await run("document.querySelector('#request').value='甲公司最多一成員工可以晚三十分鐘；乙公司最多兩成員工可以晚四十五分鐘。';document.querySelector('#request').dispatchEvent(new Event('input'));document.querySelector('#interpret').click()");
   for(let i=0;i<1000;i++){if(await run("!document.querySelector('#interpret').disabled"))break;await new Promise(r=>setTimeout(r,100));}
   assert.match(await run("document.querySelector('#parse-status').textContent"),/Claude 已整理/);
   await run("document.querySelector('#consent').click();document.querySelector('#confirm').click()");assert.equal(await run("document.querySelectorAll('.plan').length"),3);
   console.log('PASS: LIVE Claude → source-backed condition cards → human confirmation → deterministic candidate plans');
 }

 assert.deepEqual(errors,[]);
 console.log('PASS: offline flow, consent and revocation, 3 candidate preferences, withdrawal conservation behavior, no-solution, invalid-field stale-result clearing, unknown-clause rejection, reparse, sensitivity, 390px, no JS exceptions');
 }finally{ws.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

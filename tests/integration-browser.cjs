// Run with Node 22+ and Chrome remote debugging on localhost:9335.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
(async () => {
  const pages = await (await fetch('http://127.0.0.1:9335/json')).json();
  const ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.onopen = resolve);
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    pending.set(++id, {resolve, reject}); ws.send(JSON.stringify({id, method, params}));
  });
  const run = async expression => {
    const r = await send('Runtime.evaluate', {expression, returnByValue: true});
    if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const ready = async expression => {
    for (let i = 0; i < 100; i++) {
      if (await run(expression)) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw Error('Page did not become ready');
  };
  try {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', {width:1440, height:1050, deviceScaleFactor:1, mobile:false});
    await send('Page.navigate', {url:pathToFileURL(path.resolve(__dirname, '../web/index.html')).href});
    await ready("!!document.querySelector('#headline')?.textContent");
    // Disclosure: the badge must match the data file's source, and simulated parts stay labelled.
    const source = await run('window.NEIHU_DATA.meta.source');
    assert.match(await run("document.querySelector('#badge').textContent"), source === 'sample' ? /非實測/ : /真實資料/);
    assert.match(await run("document.querySelector('footer').innerText"), /公司類型為模擬/);
    assert.match(await run("document.querySelector('a[href=\"evidence/index.html\"]').textContent"), /2025 官方路口調查/);
    const results = await run(`(() => {
      const out = [];
      for (const a of ['A','B','C','D']) for (const s of [15,30,45,60]) for (const p of [0,100]) {
        for (const [id,value] of [['arch',a],['shift',s],['pct',p]]) {
          const e=document.getElementById(id); e.value=value;
          e.dispatchEvent(new Event(id==='pct'?'input':'change'));
        }
        out.push(document.querySelector('#stats').innerText);
      }
      document.querySelector('[data-mode=all]').click();
      out.push(document.querySelector('#sumMain').innerText);
      return out;
    })()`);
    assert.equal(results.length, 33);
    results.forEach(t => assert.doesNotMatch(t, /NaN|Infinity|undefined/));
    assert.match(results.at(-1), /等待沒有減少/);
    fs.writeFileSync(path.join(os.tmpdir(), 'neihu-integrated.png'),Buffer.from((await send('Page.captureScreenshot', {format:'png'})).data,'base64'));
    await run("document.querySelector('a[href=\"evidence/index.html\"]').click()");
    await ready("document.readyState === 'complete' && typeof TrafficModel !== 'undefined' && document.querySelectorAll('.timeline-peak').length === 4");
    assert.match(await run("document.querySelector('#focus-peak-title').textContent"), /4 個路口.*3 個時段/);
    await run("document.querySelector('a[href=\"../index.html\"]').click()");
    await ready("!!document.querySelector('#headline')?.textContent");
    await send('Emulation.setDeviceMetricsOverride', {width:390, height:844, deviceScaleFactor:1, mobile:true});
    assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'), true);
    assert.deepEqual(errors, []);
    console.log('PASS: data-source disclosure, evidence link, 32 company scenarios, whole-shift comparison, round-trip links, mobile width, no JS exceptions');
  } finally { ws.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });

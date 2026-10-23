/** Export the traffic demo without a build tool. Three.js stays an explicit CDN dependency. */
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=path.join(root,'web');
const entry=path.join(web,'traffic-island.js');
const destination=path.join(web,'traffic-island-standalone.html');
const moduleCache=new Map(),visiting=new Set(),sources=new Map();
const read=async filename=>{if(!sources.has(filename))sources.set(filename,await readFile(filename,'utf8'));return sources.get(filename);};
const localPath=(from,specifier)=>{
  const resolved=path.resolve(path.dirname(from),specifier);
  if(!resolved.startsWith(web+path.sep))throw Error(`Dependency escapes web/: ${specifier}`);
  return resolved;
};
// Prevent inline HTML termination, including hostile labels in a future data snapshot.
const escapeScript=text=>text.replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const safeClassic=text=>text.replace(/<\/script/gi,'<\\/script');

function moduleSpecifiers(source){
  // This app uses static imports/exports and literal dynamic imports only; cycles fail explicitly.
  const patterns=[/\b(?:import|export)\s+[^;'"`]+?\s+from\s*(['"])([^'"\r\n]+)\1/g,/\bimport\s*(['"])([^'"\r\n]+)\1/g,/\bimport\s*\(\s*(['"])([^'"\r\n]+)\1\s*\)/g];
  const found=[];
  for(const pattern of patterns)for(const match of source.matchAll(pattern)){
    const start=match.index+match[0].lastIndexOf(match[2]);
    if(!found.some(item=>item.start===start))found.push({start,end:start+match[2].length,specifier:match[2]});
  }
  return found.sort((a,b)=>a.start-b.start);
}

async function embedModule(filename){
  if(visiting.has(filename))throw Error(`Cyclic module dependency: ${path.relative(web,filename)}`);
  if(moduleCache.has(filename))return moduleCache.get(filename);
  visiting.add(filename);
  let source=await read(filename);
  const edits=[];
  for(const item of moduleSpecifiers(source)){
    if(item.specifier.startsWith('./')||item.specifier.startsWith('../')){
      edits.push({...item,replacement:await embedModule(localPath(filename,item.specifier))});
    }else if(item.specifier!=='three'&&!item.specifier.startsWith('three/addons/')){
      throw Error(`Unsupported module dependency in ${path.relative(web,filename)}: ${item.specifier}`);
    }
  }
  for(const edit of edits.reverse())source=source.slice(0,edit.start)+edit.replacement+source.slice(edit.end);
  // The standalone data is injected before the entry executes. Keep the source's fallback harmless.
  if(filename===entry){
    const fallback=/fetch\(\s*(['"])data\/route-clarity\.json\1\s*\)/g;
    source=source.replace(fallback,'Promise.resolve({ok:true,json:async()=>window.ISLAND_DATA.observations})');
  }
  assert.ok(moduleSpecifiers(source).every(item=>!/^\.{1,2}\//.test(item.specifier)),`Unresolved module in ${filename}`);
  const result='data:text/javascript;base64,'+Buffer.from(source,'utf8').toString('base64');
  moduleCache.set(filename,result);visiting.delete(filename);return result;
}

function dataDefault(source){
  const match=/\bconst\s+DATA\s*=\s*window\.ISLAND_DATA\s*\|\|\s*/.exec(source);
  if(!match)throw Error('Cannot locate the entry DATA default; update the exporter for the new contract.');
  const start=match.index+match[0].length;
  if(source[start]!=='{')throw Error('DATA default is not an object literal.');
  let depth=0,quote=null,lineComment=false,blockComment=false;
  for(let i=start;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&next==='/'){blockComment=false;i++;}continue;}
    if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote=null;continue;}
    if(c==='/'&&next==='/'){lineComment=true;i++;continue;}
    if(c==='/'&&next==='*'){blockComment=true;i++;continue;}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue;}
    if(c==='{')depth++;
    if(c==='}'&&--depth===0){
      if(!/^\s*;/.test(source.slice(i+1)))throw Error('DATA default contains a trailing expression; inspect before exporting.');
      return source.slice(start,i+1);
    }
  }
  throw Error('Unterminated DATA default.');
}

let html=await read(path.join(web,'traffic-island.html'));
const classicFiles=[...html.matchAll(/<script\s+src=(['"])([^'"]+)\1\s*>\s*<\/script>/gi)];
assert.ok(classicFiles.length>=3,'Expected geographic data and planning globals before the module entry.');
const context={window:{},structuredClone};
for(const match of classicFiles){
  const filename=localPath(path.join(web,'traffic-island.html'),match[2]);
  const source=await read(filename);
  vm.runInNewContext(source,context,{filename,timeout:2000});
  html=html.replace(match[0],`<script data-embedded-source="${match[2]}">${safeClassic(source)}</script>`);
}
context.snapshot=JSON.parse(await read(path.join(web,'data/route-clarity.json')));
// Evaluate this repo's own DATA default, so presentation and synthetic defaults cannot drift.
const DATA=vm.runInNewContext('('+dataDefault(await read(entry))+')',context,{filename:'traffic-island-DATA',timeout:2000});
assert.ok(DATA.geography?.roads?.features?.length&&DATA.geography?.locations?.records?.length);
assert.ok(DATA.observations?.directions?.length&&DATA.synthetic?.groups?.length&&DATA.presentation?.corridors?.length);
const dataTag=`<script id="island-embedded-data">window.ISLAND_DATA=${escapeScript(JSON.stringify(DATA))};</script>`;

for(const match of [...html.matchAll(/<link\b(?=[^>]*\brel=(['"])stylesheet\1)[^>]*\bhref=(['"])([^'"]+)\2[^>]*>/gi)]){
  const css=await read(localPath(path.join(web,'traffic-island.html'),match[3]));
  if(/@import\b|url\(\s*(?!['"]?data:)/i.test(css))throw Error('CSS has an external asset; embed it before exporting.');
  html=html.replace(match[0],`<style data-embedded-source="${match[3]}">${css.replace(/<\/style/gi,'<\\/style')}</style>`);
}
const moduleTag=/<script\s+type=(['"])module\1\s*>([\s\S]*?)<\/script>/i.exec(html);
assert.ok(moduleTag,'Missing guarded module bootstrap.');
let bootstrap=moduleTag[2],replaced=0;
for(const item of moduleSpecifiers(bootstrap).reverse()){
  if(!item.specifier.startsWith('.'))throw Error('Unexpected external bootstrap import.');
  bootstrap=bootstrap.slice(0,item.start)+await embedModule(localPath(path.join(web,'traffic-island.html'),item.specifier))+bootstrap.slice(item.end);replaced++;
}
assert.equal(replaced,1,'Expected a single guarded entry import.');
assert.match(bootstrap,/\.catch\(/,'Keep the CDN/WebGL fallback bootstrap.');
html=html.replace(moduleTag[0],`${dataTag}\n<script type="module">${safeClassic(bootstrap)}</script>`);
// Links to optional project pages are disclosed; the 3D demo itself carries all local data/code.
html=html.replace('href="traffic-island.html"','href="traffic-island-standalone.html"');
html=html.replace(/(<a\b[^>]*href="planner\.html[^>]*>)([\s\S]*?)(<\/a>)/g,'$1$2（需原專案）$3');
html=html.replace('</footer>','<span class="standalone-note">單檔含觀測快照與程式；3D 需連線載入 Three.js CDN。2D 儀表板與單日補充需原專案網站。</span></footer>');

assert.ok(!/<script\b[^>]*\bsrc\s*=/i.test(html),'Standalone still has a script src.');
assert.ok(!/<link\b[^>]*\brel\s*=\s*['"]stylesheet/i.test(html),'Standalone still has a stylesheet link.');
assert.ok(!/import\s*\(\s*['"]\.\.?\//.test(html),'Standalone bootstrap still has a relative module import.');
assert.match(html,/three@0\.160\.0\/build\/three\.module\.js/);
assert.match(html,/id="fallback"/);assert.match(html,/id="retry"/);
// Execute the transformed data-only production path, including its nested ranking module.
const evidence=await import(await embedModule(path.join(web,'route-evidence-model.js')));
evidence.validateSnapshot(DATA.observations);
const result=evidence.summarize(DATA.observations);
assert.equal(result.representativeCount,30);assert.equal(result.dates.length,18);assert.equal(result.requested.length,19);
// Ensure every source read belongs to one coherent snapshot even if another agent is editing.
for(const [filename,source] of sources)if(await readFile(filename,'utf8')!==source)throw Error(`Source changed during export; rerun: ${path.relative(root,filename)}`);
await writeFile(destination,html,'utf8');
console.log(JSON.stringify({status:'PASS',output:path.relative(root,destination),bytes:Buffer.byteLength(html),embeddedModules:[...moduleCache.keys()].map(p=>path.relative(web,p)),observations:{directions:DATA.observations.directions.length,days:result.dates.length,representatives:result.representativeCount},externalDependencies:['Three.js 0.160.0 CDN and allowed addons','Optional planner.html links require original project']},null,2));

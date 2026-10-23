const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const R=require('../web/road-scene.js'),ctx={window:{}};
for(const file of ['neihu-road-network.js','vd-locations.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../web/data',file),'utf8'),ctx);
const roads=JSON.parse(JSON.stringify(ctx.window.NEIHU_ROADS)),locations=JSON.parse(JSON.stringify(ctx.window.VD_LOCATIONS));
test('map uses one projection for authoritative sensor coordinates and road geometry',()=>{
 const {point}=R.projection(roads.bbox),a=point(121.57845,25.06674),north=point(121.57845,25.06774),east=point(121.57945,25.06674);
 assert.ok(north[1]<a[1]);assert.equal(north[0],a[0]);assert.ok(east[0]>a[0]);assert.equal(east[1],a[1]);
 const svg=R.render(roads,locations);
 assert.ok(svg.includes(`cx="${a[0]}" cy="${a[1]}" r="7"`));
 assert.equal((svg.match(/class="gate-beacon"/g)||[]).length,6);
 assert.ok(!svg.includes('undefined')&&!svg.includes('NaN'));
});
test('bridge geometry and detector roads remain distinct and attributable',()=>{
 for(const name of ['民權大橋','成美橋','成功橋']){
  const features=roads.features.filter(f=>f.properties.name===name);assert.ok(features.length>0);
  assert.ok(features.some(f=>f.properties.bridge));assert.ok(features.every(f=>f.properties.highway&&f.geometry.type==='LineString'));
  for(const f of features)assert.equal(f.properties.source,`https://www.openstreetmap.org/way/${f.id}`);
 }
 // Same-name approaches are not automatically classified as bridge structures.
 assert.equal(roads.features.find(f=>f.id==='51813025').properties.bridge,true);
 assert.equal(roads.features.find(f=>f.id==='1323132624').properties.bridge,false);
 assert.ok(!roads.features.some(f=>f.id==='827002730'));
 assert.equal(locations.records.find(r=>r.gate==='G1').road,'民權東路六段');
 assert.equal(locations.records.find(r=>r.gate==='G6').road,'新明路');
 const svg=R.render(roads,locations);assert.match(svg,/OpenStreetMap contributors/);assert.match(svg,/線條不代表流量/);
});
test('traffic values do not recolor road geometry and names are safely rendered',()=>{
 const data=JSON.parse(JSON.stringify(roads));data.features[0].properties.name='<script>bad()</script>';data.features[0].properties.kind='road';data.features[0].properties.focus=true;
 const svg=R.render(data,locations);assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('data-metric'));
 const f=roads.features.find(f=>f.geometry.type==='LineString'),[p]=f.geometry.coordinates;
 const point=R.projection(roads.bbox).point,[x,y]=point(...p);
 assert.ok(R.pathData(f,point).startsWith(`M${x.toFixed(2)},${y.toFixed(2)}`));
});

test('local OSM extract retains streets beneath the observed arrows and draws connected surfaces last per elevation',()=>{
 for(const name of ['洲子街','瑞湖街','陽光街']){
  const features=roads.features.filter(f=>f.properties.name===name);assert.ok(features.length>0,name);
  assert.ok(features.every(f=>f.geometry.type==='LineString'&&f.properties.source.includes('/way/')));
 }
 const svg=R.render(roads,locations),start=svg.indexOf('data-road-layer="0"'),surfaces=svg.indexOf('class="road-surfaces"',start),next=svg.indexOf('data-road-layer=',start+1);
 assert.ok(start>=0&&surfaces>start);assert.ok(!svg.slice(surfaces,next<0?undefined:next).includes('class="road-casing"'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlaces,createPlaceSearch} from '../scripts/place-search.mjs';
const bbox=[121.55,25.047,121.623,25.091];
const point=(properties={},coordinates=[121.58,25.07])=>({type:'Feature',geometry:{type:'Point',coordinates},properties:{name:'測試地點',city:'臺北市',...properties}});
const collection=features=>({type:'FeatureCollection',features});
test('only finite points inside the current map survive, duplicates removed, road precision disclosed',()=>{
 const rows=normalizePlaces(collection([point(),point(),point({type:'street',name:'測試路'},[121.59,25.08]),point({},[0,0]),point({},['121.58',25.07]),point({},[NaN,25.07])]),bbox);
 assert.equal(rows.length,2);assert.equal(rows[0].approximate,false);assert.equal(rows[1].approximate,true);assert.match(rows[1].note,/非公司門牌/);assert.throws(()=>normalizePlaces({features:[]},bbox));
});
test('query validation, upstream request contract, one-hour memory cache and rate limit',async()=>{
 let time=10000,calls=0,last;
 const search=createPlaceSearch({bbox,now:()=>time,fetcher:async(url,options)=>{calls++;last={url,options};return {ok:true,json:async()=>collection([point()])};}});
 await assert.rejects(search('a'),e=>e.status===400);await assert.rejects(search({query:'xx'}),e=>e.status===400);await assert.rejects(search('a'.repeat(161)),e=>e.status===400);assert.equal(calls,0);
 const result=await search(' 測試公司 ');assert.equal(result.results.length,1);assert.equal(last.url.searchParams.get('bbox'),bbox.join(','));assert.equal(last.url.searchParams.get('q'),'測試公司');assert.match(last.options.headers['User-Agent'],/NeihuFlexCommute/);
 assert.deepEqual(await search('測試公司'),result);assert.equal(calls,1);await assert.rejects(search('另一家公司'),e=>e.status===429);time+=1200;await search('另一家公司');assert.equal(calls,2);time+=3600001;await search('測試公司');assert.equal(calls,3);
});
test('concurrent distinct lookups rejected and upstream failure is not an empty success',async()=>{
 let release;const search=createPlaceSearch({bbox,fetcher:()=>new Promise(resolve=>release=resolve)});
 const pending=search('第一間');await assert.rejects(search('第二間'),e=>e.status===429);release({ok:false});await assert.rejects(pending,e=>e.status===503);
 const invalid=createPlaceSearch({bbox,fetcher:async()=>({ok:true,json:async()=>({bad:true})})});await assert.rejects(invalid('格式測試'),e=>e.status===503);
});
test('empty result is an honest cached success',async()=>{let calls=0;const search=createPlaceSearch({bbox,fetcher:async()=>{calls++;return {ok:true,json:async()=>collection([])};}});assert.deepEqual((await search('未知公司')).results,[]);await search('未知公司');assert.equal(calls,1);});

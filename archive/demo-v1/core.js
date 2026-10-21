(function(root){
'use strict';
const times=Array.from({length:10},(_,i)=>`${String(7+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`);
function scenario(mirror=false,shift=0){
 const base=[100,100,100,100,100,160,140,100,100,100];
 if(mirror)[base[4],base[6]]=[base[6],base[4]];
 const values=base.slice(); if(![-1,0,1].includes(shift))throw Error('未知情境');
 if(shift){values[5]-=40;values[5+shift]+=40;}
 const peak=Math.max(...values);
 return {values,total:values.reduce((a,b)=>a+b,0),peak,peaks:times.filter((_,i)=>values[i]===peak)};
}
function validate(data){
 if(!data||data.schema!=='neihu-observation-v1')throw Error('schema 必須是 neihu-observation-v1');
 if(data.unit!=='vehicles/15min'||data.timezone!=='Asia/Taipei')throw Error('單位須為 vehicles/15min，時區須為 Asia/Taipei');
 for(const k of ['source','corridor','direction','aggregation'])if(typeof data[k]!=='string'||!data[k].trim()||data[k].length>500)throw Error(`缺少或過長欄位：${k}`);
 if(!Array.isArray(data.rows)||!data.rows.length||data.rows.length>5000)throw Error('rows 須有 1–5000 筆資料');
 const keys=new Set();
 for(const r of data.rows){
  if(!r||typeof r.start!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:(00|15|30|45):00\+08:00$/.test(r.start))throw Error('時間須為 15 分鐘整點，含 +08:00');
  const t=new Date(r.start); if(!Number.isFinite(+t)||new Date(+t+28800000).toISOString().slice(0,19)!==r.start.slice(0,19))throw Error('無效日期或時間');
  if(keys.has(r.start))throw Error('重複時間 key'); keys.add(r.start);
  if(!(r.volume===null||(Number.isInteger(r.volume)&&r.volume>=0)))throw Error('volume 須為非負整數或 null');
  if(!(r.speed===null||(typeof r.speed==='number'&&Number.isFinite(r.speed)&&r.speed>=0)))throw Error('speed 須為非負 km/h 或 null');
  if(typeof r.coverage!=='number'||!Number.isFinite(r.coverage)||r.coverage<0||r.coverage>1)throw Error('coverage 須介於 0 與 1');
  if(r.coverage<1&&(r.volume!==null||r.speed!==null))throw Error('不完整區間須將 volume 與 speed 設為 null，避免低估');
 }
 return {...data,rows:[...data.rows].sort((a,b)=>a.start.localeCompare(b.start))};
}
const api={times,scenario,validate};if(typeof module!=='undefined')module.exports=api;root.NeihuCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);

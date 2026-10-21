(function(root){'use strict';
const base=[180,240,420,420,240,180,120,0];
function arrivals(moved=0,shift=3,mode='split'){
 if(!Number.isFinite(moved)||moved<0||moved>450||!Number.isInteger(shift)||shift<1||shift>4||!['split','all'].includes(mode))throw Error('Invalid model input');
 const a=mode==='all'?Array(shift).fill(0).concat(base):base.slice();
 if(mode==='split')for(const i of [2,3]){a[i]-=moved/2;while(a.length<=i+shift)a.push(0);a[i+shift]+=moved/2;}
 while(a.length<12)a.push(0);return a;
}
function simulate(a,capacity){
 if(!Array.isArray(a)||!a.length||a.length>100||a.some(v=>!Number.isFinite(v)||v<0)||!Number.isFinite(capacity)||capacity<=0)throw Error('Invalid simulation');
 let q=0,wait=0,max=0,clear=null,served=0;const rows=[];
 for(let i=0;i<a.length||q>1e-8;i++){
  if(i>1000)throw Error('Queue horizon exceeded');
  const n=a[i]||0,change=n-capacity,q1=Math.max(0,q+change);
  const area=change<0&&q1===0?(q>0?.5*q*15*q/(-change):0):15*(q+q1)/2;
  if(q>0&&q1===0&&change<0)clear=i*15+15*q/(-change);
  wait+=area/60;max=Math.max(max,q,q1);served+=n+q-q1;
  rows.push({arrival:n,q0:q,q1,mean:area/15});q=q1;
 }
 return {wait,max,clear,served,total:a.reduce((x,y)=>x+y,0),endQueue:q,rows};
}
function stats(station,kind='total'){
 if(!['total','small','moto','large'].includes(kind))throw Error('Unknown vehicle type');
 const values=station.series.slice(0,8).map(r=>r[kind]);const first=values.slice(0,4).reduce((a,b)=>a+b,0),second=values.slice(4).reduce((a,b)=>a+b,0),peak=Math.max(...values);
 return {values,first,second,total:first+second,rise:first?(second/first-1)*100:null,peak,times:station.series.filter(r=>r[kind]===peak).map(r=>r.time)};
}
const api={arrivals,simulate,stats};root.TrafficModel=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);

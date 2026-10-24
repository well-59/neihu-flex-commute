// Explicit, low-volume Photon searches; no autocomplete or persistent query logs.
export function normalizePlaces(data,bbox){
 if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('地點服務回傳格式不符');
 const seen=new Set();return data.features.flatMap(f=>{
  const [lon,lat]=f.geometry?.coordinates||[],p=f.properties||{};
  if(f.geometry?.type!=='Point'||!Number.isFinite(lat)||!Number.isFinite(lon)||lon<bbox[0]||lat<bbox[1]||lon>bbox[2]||lat>bbox[3])return [];
  const safe=v=>typeof v==='string'?v.slice(0,240):'',name=safe(p.name)||safe(p.street),address=[p.city,p.district,p.locality,p.street,p.housenumber].map(safe).filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' ');
  if(!name&&!address)return [];const id=`${lon},${lat},${name}`;if(seen.has(id))return [];seen.add(id);
  const approximate=['street','locality','district','city','county','state','country'].includes(p.type)||p.osm_key==='highway';
  return [{name:name||address,address,lat,lon,approximate,note:approximate?'道路／區域參考位置，非公司門牌；請在地圖微調。':'圖資地點位置；請核對名稱與地址。'}];
 }).slice(0,5);
}
export function createPlaceSearch({bbox,fetcher=fetch,now=Date.now,endpoint=process.env.NEIHU_PHOTON_URL||'https://photon.komoot.io/api/'}){
 const cache=new Map();let busy=false,last=-Infinity;
 const fail=(status,message)=>Object.assign(new Error(message),{status});
 return async query=>{
  if(typeof query!=='string'||query.trim().length<2||query.trim().length>160)throw fail(400,'請輸入 2–160 字的公司名稱或地址。');
  query=query.trim().normalize('NFKC');const cached=cache.get(query);if(cached&&now()-cached.at<3600000)return cached.value;
  if(busy||now()-last<1100)throw fail(429,'正在查詢或操作太快，請稍後再搜尋。');
  busy=true;last=now();
  try{
   const url=new URL(endpoint);url.searchParams.set('q',query);url.searchParams.set('bbox',bbox.join(','));url.searchParams.set('limit','5');
   const response=await fetcher(url,{headers:{'User-Agent':'NeihuFlexCommute/1.0 (+https://github.com/well-59/neihu-flex-commute)','Accept':'application/json'},signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('upstream');const results=normalizePlaces(await response.json(),bbox),value={provider:'Photon / OpenStreetMap',results};
   if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(query,{at:now(),value});return value;
  }catch{throw fail(503,'地點搜尋暫時無法使用，請稍後重試，或直接在城市地圖選位置。');}finally{busy=false;}
 };
}

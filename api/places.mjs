// Vercel function for POST /api/places; same Photon search and limits as the local preview server.
import fs from 'node:fs';
import {createPlaceSearch} from '../scripts/place-search.mjs';
const network=fs.readFileSync(new URL('../web/data/neihu-road-network.js',import.meta.url),'utf8');
const searchPlaces=createPlaceSearch({bbox:JSON.parse(network.match(/"bbox":(\[[^\]]+\])/)[1])});
const json=(status,data)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const sameOrigin=request=>{try{return new URL(request.headers.get('origin')).host===request.headers.get('host');}catch{return false;}};
export async function POST(request){
  if(!sameOrigin(request))return json(403,{error:'請從本專案頁面搜尋。'});
  let query;try{const body=await request.text();if(Buffer.byteLength(body)>2048)throw Error();query=JSON.parse(body).query;}catch{return json(400,{error:'搜尋內容格式不正確。'});}
  try{return json(200,await searchPlaces(query));}catch(e){return json(e.status||503,{error:e.message});}
}

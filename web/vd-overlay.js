import {deviceInventory,referenceRoads,bearingNames} from './vd-location-model.js';
import {periodEvidence} from './route-evidence-model.js';
import {slotTime} from './period-comparison.js';
import {freshness} from './traffic-monitor-model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=t=>Number.isFinite(Date.parse(t))?new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'未提供';
const fmt=n=>Number.isFinite(n)?n.toLocaleString('zh-TW',{maximumFractionDigits:1}):'—';
export function createVDOverlay({DATA,getCity,getContext,onSelection,onClose}){
 let snapshot=DATA.geography.inventory,devices=deviceInventory(snapshot,DATA.observations,DATA.geography.roads.bbox),mode='monitor',enabled=true,selected=null,linkId=null,opened=false,liveUpdated=false;
 const card=document.createElement('aside');card.id='vd-overlay-card';card.className='detail-card vd-overlay-card';card.hidden=true;document.getElementById('scene-workspace').append(card);
 const button=document.createElement('button');button.id='vd-overlay-toggle';button.setAttribute('aria-pressed','true');button.innerHTML='● <span>VD 測點</span>';document.querySelector('.scene-controls').append(button);
 const note=document.createElement('p');note.id='vd-overlay-note';note.className='vd-overlay-note';document.getElementById('timeline').before(note);
 function render(){
  const active=['monitor','live'].includes(mode),city=getCity();button.hidden=!active;note.hidden=!active||!enabled;button.setAttribute('aria-pressed',String(enabled));
  card.hidden=!active||!enabled||!opened;
  window.vdOverlayState={active,enabled,opened:opened&&active&&enabled,selected,linkId,count:devices.length,inMap:devices.filter(d=>d.inMap).length,referenceRoads:0,mode,snapshotTime:snapshot?.fetchedAt};
  if(!active)return;
  city?.setDevicesVisible(enabled);if(!enabled)return;
  const device=devices.find(d=>d.id===selected),link=device?.links.find(l=>l.linkId===linkId)||device?.links[0];linkId=link?.linkId||null;
  const shown=DATA.observations.directions.filter(d=>city?.hasRoute(d.id)).map(d=>d.id),references=referenceRoads(devices,DATA.geography.roads.bbox,shown);
  city?.drawDevices(devices,opened?selected:null,opened?link:null,{references});
  note.textContent=`● 藍點＝VD 官方位置 · 藍線＝補充 TDX 路段線形（非即時路況色帶）。圖內 ${devices.filter(d=>d.inMap).length}／全部 ${devices.length} 個 VD；補顯示 ${references.length} 個已有精確 ID 對照的方向線形。點測點或藍線查看依據。`;
  if(opened&&device){
   const context=getContext(),reference=link?.reference,p=reference&&context?periodEvidence(reference,context.dates,context.index,context.requested):null;
   const fresh=mode==='live'&&liveUpdated&&freshness(link?.dataCollectTime)==='fresh'&&link?.basicValid;
   let reading;
   if(mode==='monitor')reading=`<p class="vd-overlay-reading">${context?`${slotTime(context.index)}–${slotTime(context.index+1)}`:''} · 歷史低速時間 <strong>${p?.share!=null?fmt(p.share*100)+'%':'無可對照資料'}</strong></p><p>${p?`低速 ${p.congested}／可判讀 ${p.classified} 分鐘，按所選日期同一時段合計。`:'這個設備方向尚未納入既有多日快照；不以鄰近設備代替。'}</p>`;
   else reading=`<p class="vd-overlay-reading">${fresh?'最近有效分鐘觀測':'目前沒有可採用的新近觀測'}</p><p>${fresh?`汽車類 ${fmt(link.volumes?.S+link.volumes?.L+link.volumes?.T)} · 機車 ${fmt(link.volumes?.M)} 車次／這筆分鐘；VD 加權速度 ${fmt(link.speed)} km/h。`:'已保存位置可查看；過期、缺值或未通過基本檢查的觀測不當作現在路況。'}</p>`;
   card.innerHTML=`<button class="vd-overlay-close" data-vd-close aria-label="關閉 VD 明細">×</button><p class="eyebrow">VD / ${mode==='live'?'即時監控測點':'歷史回放測點'}</p><h2>${esc(device.roadName)}</h2><p class="vd-device-id">${esc(device.id)}</p><div class="vd-directions">${device.links.map(l=>`<button data-overlay-link="${esc(l.linkId)}" aria-pressed="${l.linkId===linkId}">${esc(bearingNames[l.bearing]||l.bearing)} · ${esc(l.linkId)}</button>`).join('')}</div>${reading}<p class="boundary">${reference?'此設備、LinkID、道路及方位已對應歷史線形；藍線為圖資參考，不是感測範圍。':'這個方向沒有可核對的線形，只顯示官方座標；不猜接道路。'}</p><dl class="vd-times"><dt>LinkID</dt><dd>${esc(linkId)}</dd><dt>道路／路段方位</dt><dd>${esc(bearingNames[link?.roadDirection]||link?.roadDirection)}／${esc(bearingNames[link?.bearing]||link?.bearing)}</dd><dt>官方緯度、經度</dt><dd>${device.position.lat.toFixed(5)}, ${device.position.lon.toFixed(5)}</dd><dt>位置清單更新</dt><dd>${clock(snapshot?.sources?.VD?.updateTime)}</dd><dt>${mode==='monitor'?'另存分鐘樣本':'VD 觀測時間'}</dt><dd>${clock(link?.dataCollectTime)}</dd><dt>本批接收時間</dt><dd>${clock(snapshot?.fetchedAt)}</dd></dl><p class="muted">${mode==='monitor'?'分鐘樣本時間與歷史色帶日期不同，未混用為同時段資料。':'資料採用仍依觀測時間與基本檢查，不代表完整車道診斷。'}</p>`;
  }
  window.vdOverlayState={active,enabled,opened,selected,linkId,count:devices.length,inMap:devices.filter(d=>d.inMap).length,referenceRoads:references.length,mode,snapshotTime:snapshot?.fetchedAt};
 }
 function close(){opened=false;onClose?.();render();}
 function select(id,nextLink=null){const d=devices.find(d=>d.id===id);if(!d)return;selected=id;linkId=nextLink||d.links[0]?.linkId;opened=true;enabled=true;onSelection?.(d,d.links.find(l=>l.linkId===linkId));render();getCity()?.focusDevice(id);}
 card.onclick=e=>{if(e.target.closest('[data-vd-close]'))close();const b=e.target.closest('[data-overlay-link]');if(b)select(selected,b.dataset.overlayLink);};
 button.onclick=()=>{enabled=!enabled;if(!enabled)close();render();};
 return {render,select,close,get opened(){return opened&&enabled&&['monitor','live'].includes(mode);},setMode(next){mode=next;opened=false;render();},sync(next){if(next?.sources?.VD?.status!=='PARSED'||!next.rows?.length)return;if(snapshot===next)return;snapshot=next;liveUpdated=true;devices=deviceInventory(snapshot,DATA.observations,DATA.geography.roads.bbox);if(selected&&!devices.some(d=>d.id===selected)){opened=false;selected=null;linkId=null;onClose?.();}render();}};
}

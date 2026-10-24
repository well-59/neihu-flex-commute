import {periodColor} from './traffic-palette.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bearings={N:'北向',S:'南向',E:'東向',W:'西向',NE:'東北向',NW:'西北向',SE:'東南向',SW:'西南向'};
const slot=i=>`${String(7+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`;
export function createHistoryRoadList({workspace,onSelect}){
 const panel=document.createElement('aside');panel.id='history-road-panel';panel.className='live-road-panel';panel.hidden=true;panel.setAttribute('aria-label','歷史回放監控道路');
 panel.innerHTML='<button id="history-list-toggle" class="live-list-toggle" aria-expanded="true" aria-controls="history-road-content"><span>監控道路 <b id="history-road-total">0</b></span><span class="live-collapse-icon">−</span></button><div id="history-road-content"><label class="live-search-label" for="history-road-search">搜尋道路、方向或 VD</label><div class="live-search"><input id="history-road-search" type="search" placeholder="例如：瑞光路" autocomplete="off"><button id="history-search-clear" aria-label="清除道路搜尋" hidden>×</button></div><p id="history-road-count" class="muted" role="status"></p><p id="history-road-period" class="live-list-note"></p><div id="history-road-list"></div><p id="history-search-empty" class="muted" hidden>沒有符合的歷史道路，請調整搜尋或上方範圍。</p><p class="live-list-note">依上方日期與範圍顯示歷史代表方向；百分比為同一時段的低速時間占比，不是即時速度。與現行 VD 清單的涵蓋範圍可能不同；缺資料不補零。</p></div>';
 workspace.append(panel);
 const $=id=>panel.querySelector('#'+id);let rows=[],query='',signature='',lastSelected=null,active=false;
 const toggle=$('history-list-toggle'),content=$('history-road-content');
 toggle.onclick=()=>{content.hidden=!content.hidden;toggle.setAttribute('aria-expanded',String(!content.hidden));toggle.querySelector('.live-collapse-icon').textContent=content.hidden?'＋':'−';workspace.classList.toggle('monitor-list-collapsed',content.hidden);};
 function filter(){let count=0,names=0;for(const group of panel.querySelectorAll('.live-road-group')){let visible=0;for(const button of group.querySelectorAll('[data-history-route]')){const d=rows.find(r=>r.id===button.dataset.historyRoute);button.hidden=!!query&&!`${d.roadName} ${d.vdId} ${d.linkId} ${bearings[d.bearing]||d.bearing}`.toLocaleLowerCase('zh-TW').includes(query);if(!button.hidden){visible++;count++;}}group.hidden=!visible;if(visible){names++;if(query)group.open=true;}}$('history-road-count').textContent=`${names} 條道路 · ${count} 個歷史代表方向`;$('history-search-empty').hidden=!!count;$('history-search-clear').hidden=!query;}
 $('history-road-search').oninput=()=>{query=$('history-road-search').value.trim().toLocaleLowerCase('zh-TW');filter();};
 $('history-search-clear').onclick=()=>{$('history-road-search').value='';query='';filter();$('history-road-search').focus();};
 panel.addEventListener('click',e=>{const b=e.target.closest('[data-history-route]');if(b)onSelect(b.dataset.historyRoute);});
 function render(summary,index,selected){
  rows=summary.rows;const next=rows.map(d=>d.id).join('|');
  if(next!==signature){signature=next;const open=new Set([...panel.querySelectorAll('details[open]')].map(g=>g.dataset.road)),names=[...new Set(rows.map(d=>d.roadName))].sort((a,b)=>a.localeCompare(b,'zh-TW'));
   $('history-road-total').textContent=names.length;
   $('history-road-list').innerHTML=names.map(name=>`<details class="live-road-group" data-road="${esc(name)}" ${open.has(name)||rows.some(d=>d.roadName===name&&d.id===selected)?'open':''}><summary><span>${esc(name)}</span><small>${rows.filter(d=>d.roadName===name).length} 方向</small></summary><div>${rows.filter(d=>d.roadName===name).map(d=>`<button class="live-road-option" data-history-route="${esc(d.id)}" aria-pressed="false"><span class="live-route-dot"></span><span class="live-route-copy"><strong>${esc(bearings[d.bearing]||d.bearing)}</strong><small>${esc(d.vdId)}</small></span><span class="live-route-reading"></span></button>`).join('')}</div></details>`).join('');filter();
  }
  const heat=new Map(summary.heat.map(r=>[r.direction.id,r.periods[index]]));
  for(const b of panel.querySelectorAll('[data-history-route]')){const id=b.dataset.historyRoute,p=heat.get(id),value=p?.share==null?'缺資料':`低速 ${(p.share*100).toFixed(1)}%`;b.setAttribute('aria-pressed',String(id===selected));b.querySelector('.live-route-dot').style.background=periodColor(p?.share??null);b.querySelector('.live-route-reading').textContent=value;b.title=`${slot(index)}–${slot(index+1)} · ${value}`;if(id===selected&&lastSelected!==selected)b.closest('details').open=true;}
  lastSelected=selected;$('history-road-period').textContent=`歷史 ${slot(index)}–${slot(index+1)} · ${summary.dates.length} 個資料日／${summary.requested.length} 個所選日`;
 }
 return {render,setActive(value){active=value;panel.hidden=!active;workspace.classList.toggle('monitor-list-collapsed',active&&content.hidden);}};
}

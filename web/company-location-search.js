const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createCompanyLocationSearch({panel,company,onSelect,onInvalidate}){
 let controller=null,results=[],sequence=0;
 const $=id=>panel.querySelector('#'+id);
 function cancel(){sequence++;controller?.abort();controller=null;results=[];}
 function refresh(){cancel();if(window.ISLAND_DATA&&$('company-search')){$('company-search').disabled=true;$('company-search-status').textContent='單檔展示請直接在城市地圖選位置；文字搜尋需開啟原專案服務。';}}
 function invalidate(){cancel();company.locationQuery=$('company-query').value;company.lat=null;company.lon=null;company.locationLabel='';company.locationNote='';$('company-lat').value='';$('company-lon').value='';$('company-search-results').innerHTML='';$('company-search-status').textContent='';$('company-selected-location').textContent='文字已更新，請搜尋並重新選定位置。';$('company-search').disabled=!!window.ISLAND_DATA;panel.querySelectorAll('.company-recommendation,.company-sectors,.company-basis').forEach(e=>e.hidden=true);onInvalidate();}
 async function search(){
  const input=$('company-query');if(!input||window.ISLAND_DATA)return;
  const query=input.value.trim();if(query.length<2||query.length>160){$('company-search-status').textContent='請輸入 2–160 字的公司名稱或地址。';return;}
  cancel();const token=sequence;controller=new AbortController();$('company-search').disabled=true;$('company-search-results').innerHTML='';$('company-search-status').textContent='正在搜尋，請稍候…';
  try{const response=await fetch('/api/places',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query}),signal:controller.signal});if(token!==sequence||!input.isConnected)return;
   if(!(response.headers.get('content-type')||'').includes('application/json'))throw Error('文字搜尋需開啟原專案服務，或改用城市地圖選位置。');
   const data=await response.json();if(token!==sequence||!input.isConnected)return;if(!response.ok)throw Error(data.error||'搜尋暫時無法使用。');if(!Array.isArray(data.results))throw Error('搜尋結果格式不符。');results=data.results;
   $('company-search-status').textContent=results.length?'請核對名稱與地址，再選擇公司所在位置。':'這個範圍內沒有找到符合結果，請改用完整地址、附近地標，或在地圖選位置。';
   $('company-search-results').innerHTML=results.map((p,i)=>`<button type="button" data-company-place="${i}"><strong>${esc(p.name)}</strong><span>${esc(p.address)}</span><small>${esc(p.note)}</small></button>`).join('');
  }catch(e){if(token===sequence&&input.isConnected&&e.name!=='AbortError')$('company-search-status').textContent=e.message||'搜尋暫時無法使用，請改用地圖選位置。';}finally{if(token===sequence&&input.isConnected){$('company-search').disabled=false;controller=null;}}
 }
 panel.addEventListener('input',e=>{if(e.target.id==='company-query')invalidate();});
 panel.addEventListener('keydown',e=>{if(e.target.id==='company-query'&&e.key==='Enter'){e.preventDefault();search();}});
 panel.addEventListener('click',e=>{if(e.target.closest('#company-search'))search();const b=e.target.closest('[data-company-place]');if(b){const p=results[Number(b.dataset.companyPlace)];if(p)onSelect(p);}});
 return {refresh,cancel};
}

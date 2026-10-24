import {periodColor} from './traffic-palette.js';
import {periodEvidence} from './route-evidence-model.js';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n.toLocaleString('zh-TW',{maximumFractionDigits:1});
export const slotTime=i=>`${String(7+Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`;
const names={E:'東向',W:'西向',N:'北向',S:'南向',NE:'東北向',NW:'西北向',SE:'東南向',SW:'西南向'};
export function flowEvidence(source,direction,dates,index){
 if(!Number.isInteger(index)||index<0||index>9)throw Error('時段超出觀測範圍');
 const samples=[];
 for(const date of dates){
  const record=source?.days?.[date]?.[direction.id],p=record?.periods?.[index];
  if(record?.roadName!==direction.roadName||record?.bearing!==direction.bearing||!p||!Number.isInteger(p.validMinutes)||p.validMinutes<=0||p.validMinutes>15)continue;
  if(!['M','S','L','T'].every(k=>Number.isSafeInteger(p.volumes?.[k])&&p.volumes[k]>=0))continue;
  samples.push({date,...p});
 }
 const minutes=samples.reduce((s,p)=>s+p.validMinutes,0),expected=dates.length*15;
 const volumes=Object.fromEntries(['M','S','L','T'].map(k=>[k,samples.reduce((s,p)=>s+p.volumes[k],0)]));
 return {samples,minutes,expected,volumes,total:minutes?Object.values(volumes).reduce((s,n)=>s+n,0):null,complete:expected>0&&minutes===expected};
}
const roadLabel=d=>`${d.roadName} · ${names[d.bearing]||d.bearing}`;
const tint=periodColor;
export function renderPeriodComparison(summary,source,index,{routeAttribute='data-select',selectedId=null,detailOpen=false,compact=false}={}){
 const rows=[...summary.rows].sort((a,b)=>roadLabel(a).localeCompare(roadLabel(b),'zh-Hant')||a.id.localeCompare(b.id));
 const selected=rows.find(d=>d.id===selectedId)||rows[0];
 const start=slotTime(index),end=slotTime(index+1);
 let detail='';
 if(selected){
  const p=periodEvidence(selected,summary.dates,index,summary.requested),f=flowEvidence(source,selected,summary.requested,index);
  detail=`<details class="period-cell-detail" ${detailOpen?'open':''}><summary>${esc(roadLabel(selected))} · ${esc(selected.vdId)} · ${start}–${end} <span>查看車次與資料依據</span></summary><div class="period-detail-grid"><div><span>這一格的低速時間占比</span><strong>${p.share===null?'缺資料':fmt(p.share*100)+'%'}</strong><small>所選日期每天 ${start}–${end} 合計：低速 ${fmt(p.congested)}／可判讀 ${fmt(p.classified)} 分鐘。</small><small>完整度 ${p.expected?fmt(p.classified/p.expected*100)+'%':'—'}；${p.highDays}／${p.observedDays} 個可判讀日至少一半有效時間低速。</small></div><div><span>這一格有紀錄的通過車次</span>${f.total===null?'<strong>尚無分時車次</strong><small>缺資料不以晨峰平均值推估。</small>':`<strong>${fmt(f.total)} 車次${f.complete?'':'（部分樣本）'}</strong><small>汽車類 ${fmt(f.volumes.S+f.volumes.L+f.volumes.T)} · 機車 ${fmt(f.volumes.M)}</small><small>${esc(f.samples.map(s=>s.date).join('、'))} ${start}–${end}；有效 ${f.minutes}／所選日期應有 ${f.expected} 分鐘。</small>`}</div></div><p class="period-source">車次與低速比例的樣本日期、有效分鐘可能不同。公開車次缺少車道診斷旗標，僅通過基本檢查；機車 0 不代表完整偵測。測點車次不能加總為不重複進園車數。</p><button class="period-map-link" ${routeAttribute}="${esc(selected.id)}" data-period="${index}">在地圖查看這個路段與時段 ↗</button></details>`;
 }
 return `<div class="period-intro"><h2>${compact?'目前路段 · 各時段低速時間':'哪條路，幾點開始走得慢？'}</h2><p><strong>一條橫帶＝一個路段測點方向；一格＝15 分鐘。</strong>每格 % 只計算該路段在欄位時間內的低速時間占比。</p><p>${summary.dates.length===1?esc(summary.dates[0]):`所選 ${summary.dates.length} 個資料日，合計每天相同時段`} · 橫看一條路的變化，直看同時間各路段。點色格查看車次與依據。</p></div>
 <div class="period-legend" aria-label="低速時間占比色帶"><span><i style="background:#c7dfd0"></i>0–&lt;20%</span><span><i style="background:#eee3ae"></i>20–&lt;50%</span><span><i style="background:#ebbb96"></i>50–&lt;80%</span><span><i style="background:#dc947f"></i>80–100%</span><span><i style="background:#e3e6df"></i>缺資料</span><small>顏色越暖，這一格低速時間越多</small></div>
 ${detail}
 <div class="table-scroll period-scroll" tabindex="0" role="region" aria-label="各路段十五分鐘低速時間色帶，可左右捲動"><table class="period-road-table"><thead><tr><th scope="col">路段／方向</th>${Array.from({length:10},(_,i)=>`<th scope="col" class="${i===index?'period-column-active':''}"><button data-heat-column="${i}" aria-pressed="${i===index}" aria-label="比較 ${slotTime(i)}–${slotTime(i+1)}"><strong>${slotTime(i)}</strong><small>–${slotTime(i+1)}</small></button></th>`).join('')}</tr></thead><tbody>${rows.map(d=>`<tr data-heat-row="${esc(d.id)}"><th scope="row" title="${esc(roadLabel(d))} · ${esc(d.vdId)} · LinkID ${esc(d.linkId)}${d.scope?.category==='entering'?' · 入園方向':''}"><span>${esc(d.roadName)}</span><small>${esc(names[d.bearing]||d.bearing)} · ${esc(d.vdId)}</small></th>${Array.from({length:10},(_,i)=>{
  const p=periodEvidence(d,summary.dates,i,summary.requested),value=p.share===null?'—':fmt(p.share*100)+'%';
  const description=`${roadLabel(d)} ${slotTime(i)}–${slotTime(i+1)}：${p.share===null?'缺資料':`低速時間占比 ${value}，低速 ${p.congested}／可判讀 ${p.classified} 分鐘`}；點選查看這格車次與依據`;
  return `<td class="${i===index?'period-column-active':''}"><button class="period-heat-cell" data-heat-route="${esc(d.id)}" data-heat-period="${i}" aria-pressed="${d.id===selected?.id&&i===index}" style="background:${tint(p.share)}" title="${esc(description)}" aria-label="${esc(description)}">${value}</button></td>`;
 }).join('')}</tr>`).join('')||'<tr><td colspan="11">這個範圍沒有可比較方向。</td></tr>'}</tbody></table></div>
 <p class="period-source">每格＝所選日期「同一個 15 分鐘」的低速分鐘 ÷ 可判讀分鐘，不是整段 07:00–09:30 的占比。灰色缺資料不算順暢；歷史色帶不代表現在路況，出發前請查看<a href="traffic-island.html?view=live">即時監控 ↗</a>。</p>`;
}

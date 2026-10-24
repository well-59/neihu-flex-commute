import {flexPlan,rewardCheck,places,startTimes,clock,parseTime,reasonNames,directionNames,SLOT_START,SLOT_COUNT,DATA_END,CORE,BASE_FLEX,MAX_FLEX,PEAK_RATIO,CHRONIC_RATIO} from './flex-reward-model.js';
import {periodColor} from './traffic-palette.js';
import {bearingNames} from './vd-location-model.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=v=>v==null?'缺資料':`${Math.round(v*100)}%`,km=m=>m<1000?`${Math.round(m)} 公尺`:`${(m/1000).toFixed(1)} 公里`;
const flexColor=f=>f<=BASE_FLEX?'#dfeadb':f<=45?'#eee3ae':f<=75?'#ebbb96':'#dc947f';
const range=([a,b])=>`${clock(a)}–${clock(b)}`;
export const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

// Formula reference shared by this page and 資料品質, so both always describe the same calculation.
const sym=(term,meaning)=>`<dt>${term}</dt><dd>${meaning}</dd>`;
function workedExample(plan){
 const s=plan&&Object.values(plan.sectors).filter(s=>s.reason==='PEAK_NEAR_START').sort((a,b)=>b.flex-a.flex)[0];if(!s)return '';
 const road=s.peakRoads[0],slot=road?.slots.slice(s.peak.from,s.peak.to+1).find(p=>p.hot);
 const step1=road&&slot?`<li><b>步驟 1–2，以其中一條路為例：</b>${esc(road.roadName)}・${esc(bearingNames[road.bearing]||road.bearing)}（r）在 ${clock(slot.start)}–${clock(slot.start+15)}（t）：${plan.requested} 個上班日（${plan.dates} 天有資料）合計 Σ<sub>d</sub> 低速分鐘 = ${slot.congested}、Σ<sub>d</sub> 可判讀分鐘 = ${slot.classified} → s(r,t) = ${slot.congested} ÷ ${slot.classified} = ${pct(slot.share)} ≥ θ ${pct(plan.theta)} → h(r,t) = 1（這格算塞車）</li>`:'';
 const counts=s.counts.map((n,i)=>`${clock(SLOT_START+i*15)} ${n}`).join('、');
 return `<div class="flex-example"><strong>計算範例：目前選擇的${esc(s.name)}（D），上班時間 T = ${clock(plan.time)}</strong><ol>${step1}
<li><b>步驟 3–4：</b>${s.chronic.length?`先排除 ${s.chronic.length} 條全早壅塞路段，`:''}數出每個時段同時塞車的道路數 n(D,t)：${counts}</li>
<li><b>步驟 5：</b>最大值 n* = ${s.peak.max} 條；近峰門檻 ${PEAK_RATIO} × ${s.peak.max} = ${+(PEAK_RATIO*s.peak.max).toFixed(1)} 條；n(D,t) 達門檻的連續時段 → W = [a, b) = ${s.peak.label}，所以 a = ${clock(s.peak.start)}、b = ${clock(s.peak.end)}</li>
<li><b>步驟 6：</b>C = [T − 15, T + 15) = ${plan.core.label}；W 與 C 有重疊（W ∩ C ≠ ∅）</li>
<li><b>步驟 7：</b>T − a = ${plan.time-s.peak.start} 分鐘、b − T = ${s.peak.end-plan.time} 分鐘 → max(${plan.time-s.peak.start}, ${s.peak.end-plan.time}) + 15 = ${s.need} → 進位到 15 的倍數並限制在 ${BASE_FLEX}–${MAX_FLEX} → <b>F = ${s.flex} 分鐘</b></li>
<li><b>步驟 8–9：</b>可到班 [T − F, T + F] = ${s.window.label}；到班時間 x 落在 ${s.reward.label} 可得 1 點</li></ol></div>`;
}
export function flexMethodHtml(plan){
 const period=plan?.firstDate?`${plan.firstDate} 至 ${plan.lastDate}，排除週末與國定假日共 ${plan.requested} 個上班日（其中 ${plan.dates} 天有資料）`:'所選期間的上班日，排除國定假日';
 return `<div class="flex-method">
<section class="flex-brief"><h4>前情提要：這套公式在算什麼？</h4><p>公司在時間 T 上班。從北、東、南、西不同方向來的員工，會經過不同的道路；如果某個方向的道路剛好在上班前後最塞，就建議公司給這個方向的員工較長的彈性到班時間，並用點數鼓勵他們提早或延後、避開尖峰。整個計算分四段：</p>
<ol><li><b>每條路、每 15 分鐘塞不塞：</b>用過去約一個月的車輛偵測器紀錄，算出「低速時間占比」，超過門檻就算塞車（步驟 1–3）。</li><li><b>每個方向最多路同時塞的時段：</b>把同一方向的道路疊在一起數，找出最多道路同時塞車的時段，叫「最大集合塞車時段」（步驟 4–5）。</li><li><b>決定彈性工時：</b>如果這個時段碰到上班前後 15 分鐘，就把彈性加大到員工能提早或延後完全避開（步驟 6–8）。</li><li><b>發點數：</b>在彈性範圍內、避開上班前後 15 分鐘到班，得 1 點（步驟 9）。</li></ol></section>
<h4>資料從哪裡來：什麼是「低速分鐘」？</h4>
<dl class="flex-symbols">
${sym('VD','車輛偵測器（Vehicle Detector）。臺北市裝在道路上的感測器，每分鐘回報各車道通過的車數與車速。一個 VD 的一個行車方向（例如「堤頂大道・北向」）就是公式裡的一條「道路 r」。')}
${sym('資料期間',`${period}；每天只用 07:00–09:30，切成 ${SLOT_COUNT} 個 15 分鐘時段。`)}
${sym('品質檢查','每一分鐘的紀錄要狀態正常、車道數與設備資料相符、車數合理、沒有錯誤代碼，才會採用；不合格的分鐘不補零、不估算。')}
${sym('每分鐘車速','這一分鐘加前 4 分鐘（共 5 分鐘）通過品質檢查的紀錄裡，各車道車速依通過車數加權平均。')}
${sym('A–F 級','依臺北市在 TDX（交通部運輸資料流通服務）發布的道路壅塞水準門檻，把每分鐘車速分成 A（最順）到 F（最塞）六級；不同類型道路的速度門檻不同。')}
${sym('低速分鐘','車速被分在 <b>E 或 F 級</b>的分鐘，也就是本專案定義的「塞車分鐘」。')}
${sym('可判讀分鐘','通過品質檢查、前 5 分鐘內有車通過、能分出 A–F 級的分鐘。偵測器故障、資料異常或 5 分鐘都沒車的分鐘不算，也不當作順暢。每天每個 15 分鐘時段最多 15 分鐘。')}
</dl>
<h4>代號說明</h4>
<dl class="flex-symbols">
${sym('T','上班時間（Time），例如 09:00。計算時換成「從午夜起算的分鐘數」，09:00 = 540，所以可以直接加減分鐘。')}
${sym('t','時段（time slot）。07:00 起每 15 分鐘一格，共 10 格：07:00–07:15、07:15–07:30……09:15–09:30。')}
${sym('d','日期（day），資料期間中的某一天。')}
${sym('D','方向（Direction），北、東、南、西其中一個。依 VD 相對公司位置的方位角分：北 315°–45°、東 45°–135°、南 135°–225°、西 225°–315°。')}
${sym('r','道路（road），精確說是一個 VD 的一個行車方向。')}
${sym('R','分析範圍半徑（Radius），預設 2 公里；離公司超過 R 的 VD 不納入。')}
${sym('θ','壅塞門檻（讀作 theta），預設 50%；低速時間占比達到 θ 才算塞車。')}
${sym('s(r,t)','道路 r 在時段 t 的低速時間占比（share），0%–100%。')}
${sym('h(r,t)','道路 r 在時段 t 算不算塞車（hot）。只有兩種值：1＝塞車、0＝不塞車。')}
${sym('S(D,t)','方向 D 在時段 t 正在塞車的道路名單（Set）。')}
${sym('n(D,t)','S(D,t) 名單上有幾條路（number），也就是同時塞車的道路數；方向卡片長條圖的柱高。')}
${sym('n*','n(D,t) 在 10 個時段中的最大值，即「最大集合」有幾條路。')}
${sym('W(D) = [a, b)','最大集合塞車時段（Window）：a 是開始時間，b 是結束時間。')}
${sym('C','尖峰核心時段（Core），上班時間前後 15 分鐘；在這段到班不給點。')}
${sym('F(D)','方向 D 的建議彈性工時（Flex），單位分鐘；員工可在 T − F 到 T + F 之間到班。')}
${sym('x','員工實際到班時間。')}
</dl>
<h4>數學符號怎麼讀</h4>
<dl class="flex-symbols">
${sym('Σ','總和（讀作 sigma）：把後面的數全部加起來。')}
${sym('Σ<sub>d</sub>','右下角的 d 表示「對每一天 d 加總」。例：Σ<sub>d</sub> 低速分鐘 = 第 1 天這格的低速分鐘 + 第 2 天的 + …… + 最後一天的。')}
${sym('Σ<sub>t</sub>','對每個時段 t 加總。例：Σ<sub>t</sub> h(r,t) = 道路 r 在 10 個時段中被記為 1（塞車）的格數。')}
${sym('max、min','max(甲, 乙) 取較大的數，min(甲, 乙) 取較小的數。max<sub>t</sub> 是在所有時段 t 中取最大值。')}
${sym('｜S｜','集合 S 裡有幾個元素（幾條路）。')}
${sym('{ r ∈ D ｜ 條件 }','集合寫法，讀作「方向 D 裡符合條件的所有道路 r」。∈ 讀作「屬於」。')}
${sym('[a, b)','時間區間，包含 a、不包含 b。例：[08:45, 09:15) 從 08:45 起、到 09:15 前為止。[a, b] 則兩端都包含。')}
${sym('∩、∪、∅、≠','∩ 交集（兩段時間重疊的部分）、∪ 聯集（兩段時間合起來）、∅ 空集合（什麼都沒有，即沒有重疊）、≠ 不等於。所以 W ∩ C ≠ ∅ 讀作「W 和 C 有重疊」。')}
${sym('⌈x⌉<sub>15</sub>','把 x 無條件進位到 15 的倍數。例：⌈31⌉<sub>15</sub> = 45、⌈45⌉<sub>15</sub> = 45。')}
${sym('≥、≤、&lt;、×、÷','大於或等於、小於或等於、小於、乘、除。')}
</dl>
<h4>計算步驟</h4>
<ol class="flex-steps">
<li><b>低速時間占比</b><code>s(r,t) = Σ<sub>d</sub> 低速分鐘(r,t,d) ÷ Σ<sub>d</sub> 可判讀分鐘(r,t,d)</code><p class="flex-where">白話：把每一天 d、同一條路 r、同一個時段 t 的低速分鐘加起來，除以同樣加起來的可判讀分鐘。每天每格最多 15 分鐘${plan?`，所以 ${plan.requested} 天最多 ${plan.requested*15} 分鐘`:''}。可判讀分鐘加總為 0 時記為「缺資料」，不當作順暢。</p></li>
<li><b>壅塞判定</b><code>h(r,t) = 1　若 s(r,t) ≥ θ
h(r,t) = 0　其他情況</code><p class="flex-where">白話：h 是「這條路在這格算不算塞車」的開關。θ = 50% 時，低速時間占一半以上就記 1。</p></li>
<li><b>排除全早壅塞路段</b><code>Σ<sub>t</sub> h(r,t) ÷ 可判讀時段數(r) ≥ ${CHRONIC_RATIO}　→　r 列為全早壅塞</code><p class="flex-where">白話：Σ<sub>t</sub> h(r,t) 是這條路 10 格中記為 1 的格數，可判讀時段數是這條路 10 格中有資料的格數（至少 5 格才判斷）。例：10 格有 9 格塞車，9 ÷ 10 = 0.9 ≥ ${CHRONIC_RATIO}。這種路整個早上都塞，調整到班時間也避不開，另外列出、需其他措施，不計入下一步。</p></li>
<li><b>方向壅塞集合</b><code>S(D,t) = { r ∈ D ｜ h(r,t) = 1，且 r 不是全早壅塞 }
n(D,t) = ｜S(D,t)｜</code><p class="flex-where">白話：S(D,t) 是方向 D 在時段 t 正在塞車的道路名單，n(D,t) 是名單上有幾條路。例：東方 08:30 這格有 3 條路 h = 1，則 n(東方, 08:30) = 3。</p></li>
<li><b>最大集合塞車時段</b><code>n* = max<sub>t</sub> n(D,t)
W(D) = [a, b) = 包含 n* 的時段、且每格 n(D,t) ≥ ${PEAK_RATIO} × n* 的連續時段</code><p class="flex-where">白話：n* 是 10 格中最多同時塞車的道路數。把同時塞車道路數接近最多（至少 ${PEAK_RATIO*100}%）的相鄰時段連起來，就是最大集合塞車時段 W，從 a 開始、到 b 結束。若有好幾段，取與核心時段 C 重疊最多的，其次取離 T 最近的。</p></li>
<li><b>尖峰核心時段</b><code>C = [T − ${CORE}, T + ${CORE})</code><p class="flex-where">白話：上班時間前後 15 分鐘，是到班最集中的時段。例：T = 09:00 → C = [08:45, 09:15)。</p></li>
<li><b>建議彈性工時</b><code>若 W ∩ C ≠ ∅：F(D) = min(${MAX_FLEX}, max(${BASE_FLEX}, ⌈max(T − a, b − T) + ${CORE}⌉<sub>15</sub>))
其他情況：　F(D) = ${BASE_FLEX}（基本彈性）</code><p class="flex-where">白話：W ∩ C ≠ ∅ 表示這個方向最塞的時候剛好碰上上班時間。T − a 是要提早幾分鐘才能在塞車開始前到；b − T 是要延後幾分鐘才能等塞車結束。取兩者較大的（max）再加 ${CORE} 分鐘緩衝，讓提早、延後兩邊都至少留 ${CORE} 分鐘完全避開 W 的到班時間；然後無條件進位到 15 的倍數，max(${BASE_FLEX}, …) 保證至少 ${BASE_FLEX} 分鐘，min(${MAX_FLEX}, …) 保證最多 ${MAX_FLEX} 分鐘。其他情況包含：W 不在核心時段、方向內沒有塞車、只有全早壅塞路段、缺資料或範圍內沒有 VD。</p></li>
<li><b>可到班時段</b><code>可到班：[T − F, T + F]
避峰到班：[T − F, a) ∪ [b, T + F]，再扣除 C</code><p class="flex-where">白話：員工可以在上班時間前後 F 分鐘內到班；其中比 a 早或比 b 晚到的時段，完全避開最大集合塞車時段。∪ 表示兩段都可以選。</p></li>
<li><b>獎勵點數</b><code>T − F ≤ x &lt; T − ${CORE}　或　T + ${CORE} &lt; x ≤ T + F　→　1 點</code><p class="flex-where">白話：x 是實際到班時間。比核心時段早（但不早於 T − F）、或比核心時段晚（但不晚於 T + F）到班，就得 1 點；在核心時段內或超出彈性範圍到班為 0 點。每個上班日最多 1 點，可累積兌換商品。</p></li>
</ol>${workedExample(plan)}
<p class="flex-limits"><b>參數與限制：</b>θ = 50%、R = 2 公里、近峰係數 ${PEAK_RATIO}、全早壅塞比例 ${CHRONIC_RATIO}、基本彈性 ${BASE_FLEX} 分、上限 ${MAX_FLEX} 分都是討論用預設值，不是官方標準，θ 與 R 可在頁面調整。方向 D 是 VD 相對公司的位置，不是員工實際來向或必經路線。多日資料只到 ${clock(DATA_END)}，晚到側超過 ${clock(DATA_END)} 的時段沒有資料，須試辦驗證。本頁不估計減少的車流、省時或減塞百分比；點數與商品為示範設定。</p></div>`;
}

function compass(plan){
 const c=170,R=138,pt=(az,r)=>[c+r*Math.sin(az*Math.PI/180),c-r*Math.cos(az*Math.PI/180)].map(v=>v.toFixed(1));
 const wedges=Object.values(plan.sectors).map((s,i)=>{const mid=i*90,[x1,y1]=pt(mid-45,R),[x2,y2]=pt(mid+45,R),[lx,ly]=pt(mid,R*.6);
  return {wedge:`<path d="M${c} ${c}L${x1} ${y1}A${R} ${R} 0 0 1 ${x2} ${y2}Z" fill="${s.roads.length?flexColor(s.flex):'#eceee6'}" stroke="#fffdf7" stroke-width="3"/>`,label:`<text x="${lx}" y="${+ly-8}" class="flex-wedge-name">${s.name}</text><text x="${lx}" y="${+ly+14}" class="flex-wedge-value">±${s.flex} 分</text>`};});
 const dots=Object.values(plan.sectors).flatMap(s=>s.roads.map(r=>{const core=r.slots.filter(p=>p.share!==null&&p.start<plan.core.end&&p.start+15>plan.core.start).map(p=>p.share),v=core.length?Math.max(...core):null,[x,y]=pt(r.azimuth,Math.min(1,r.distance/plan.radius)*R);
  return `<circle cx="${x}" cy="${y}" r="4.5" fill="${periodColor(v)}" stroke="#40514a" stroke-width="1"><title>${esc(r.roadName)} ${esc(bearingNames[r.bearing]||r.bearing)} · ${km(r.distance)} · 上班核心時段低速 ${pct(v)}</title></circle>`;})).join('');
 const [nx,ny]=pt(0,R+16),[ex,ey]=pt(90,R+16),[sx,sy]=pt(180,R+16),[wx,wy]=pt(270,R+16);
 return `<svg viewBox="0 0 340 340" role="img" aria-label="公司四方位建議彈性工時與周邊測點">${wedges.map(w=>w.wedge).join('')}<circle cx="${c}" cy="${c}" r="${R/2}" fill="none" stroke="#fffdf7" stroke-dasharray="3 4"/>${dots}${wedges.map(w=>w.label).join('')}<circle cx="${c}" cy="${c}" r="9" fill="#953f63" stroke="white" stroke-width="3"/><text x="${c}" y="${c+26}" class="flex-company">公司</text><text x="${nx}" y="${+ny+4}" class="flex-cardinal">N</text><text x="${ex}" y="${+ey+4}" class="flex-cardinal">E</text><text x="${sx}" y="${+sy+4}" class="flex-cardinal">S</text><text x="${wx}" y="${+wy+4}" class="flex-cardinal">W</text></svg>`;
}

function bars(s,plan){
 const top=Math.max(1,...s.counts);
 return `<div class="flex-bars" role="img" aria-label="${s.name}各時段同時壅塞道路數：${s.counts.map((n,i)=>`${clock(SLOT_START+i*15)} ${n} 條`).join('，')}">${s.counts.map((n,i)=>{const start=SLOT_START+i*15,peak=s.peak&&i>=s.peak.from&&i<=s.peak.to,core=start<plan.core.end&&start+15>plan.core.start;
  return `<div class="flex-bar${peak?' peak':''}${core?' core':''}"><b>${n||''}</b><i style="height:${n?Math.max(8,n/top*100):0}%"></i><span>${i%2?'':clock(start)}</span></div>`;}).join('')}</div>`;
}

function roadRow(r,plan){
 return `<li class="${r.chronic?'chronic':''}"><div><strong>${esc(r.roadName)} · ${esc(bearingNames[r.bearing]||r.bearing)}</strong><small>${esc(r.vdId)} · 距公司約 ${km(r.distance)}${r.chronic?' · 全早壅塞，不計入最大集合':''}</small></div><div class="flex-cells">${r.slots.map(p=>`<span class="${p.hot?'hot':''}" style="background:${periodColor(p.share)}" title="${clock(p.start)}–${clock(p.start+15)} 低速 ${pct(p.share)}（${p.congested}／${p.classified} 分鐘）"></span>`).join('')}</div></li>`;
}

function directionCard(s,plan){
 const clear=s.clear.map(range).join('、')||'—',notes=[];
 if(s.reason==='NO_ROADS')notes.push(`${km(plan.radius)}內沒有歷史觀測測點；先採基本彈性，不代表此方向順暢。`);
 if(s.reason==='NO_DATA')notes.push('範圍內測點缺少可判讀分鐘；缺資料不算順暢。');
 if(s.reason==='NO_CONGESTION')notes.push(`各時段都沒有道路達 ${pct(plan.theta)} 門檻，採基本彈性。`);
 if(s.reason==='PEAK_ELSEWHERE')notes.push(`高峰 ${s.peak.label} 不在上班核心時段 ${plan.core.label}，採基本彈性。`);
 if(s.chronic.length)notes.push(`${s.chronic.length} 條路段整個早上都塞（${[...new Set(s.chronic.map(r=>r.roadName))].map(esc).join('、')}），調整時間也避不開，需搭配大眾運輸或分流等措施。`);
 if(s.rewardInPeak&&s.reason!=='PEAK_NEAR_START')notes.push('部分獎勵到班時段仍與此方向高峰重疊，建議選擇避峰到班時段。');
 if(s.capped)notes.push(`計算需 ${s.need} 分鐘，已達上限 ${MAX_FLEX} 分鐘。`);
 if(s.lateBeyondData)notes.push(`晚到側超過 ${clock(DATA_END)} 的部分沒有多日資料，效果待試辦驗證。`);
 return `<article class="flex-dir" data-flex-dir="${s.key}" data-reason="${s.reason}" style="--flex-tone:${flexColor(s.flex)}"><header><h3>${s.name}<small>${s.key}</small></h3><span class="flex-tag">${reasonNames[s.reason]}</span></header>
<div class="flex-dir-value"><strong>±${s.flex}</strong><span>分鐘<br>建議彈性工時 <var>F</var></span></div>
<dl class="flex-facts"><dt>可到班時段 <var>[T−F, T+F]</var></dt><dd>${s.window.label}</dd><dt>最大集合塞車時段 <var>W</var></dt><dd>${s.peak?`${s.peak.label} · 最多 <var>n*</var> = ${s.peak.max} 條同時塞車`:'—（沒有塞車道路）'}</dd><dt>避峰到班建議</dt><dd>${clear}</dd><dt>獎勵到班 +1 點</dt><dd>${s.reward.label}</dd></dl>
${bars(s,plan)}<p class="flex-bar-legend"><span class="peak">最大集合塞車時段 W</span><span class="core">上班核心時段 C ${plan.core.label}</span><span>柱高＝同時塞車道路數 n(D,t)（${s.roads.length-s.chronic.length} 條可變動路段）</span></p>
${notes.map(n=>`<p class="flex-note">${n}</p>`).join('')}
${s.roads.length?`<details><summary>此方向道路 ${s.roads.length} 條${s.peakRoads.length?`（最大集合包含 ${s.peakRoads.length} 條）`:''}</summary><p class="flex-cells-key">每列 10 格依序是 07:00–09:30 的時段 t；格子顏色＝低速時間占比 s(r,t)，粗框＝h(r,t) = 1（達門檻 θ，算塞車）。</p><ul class="flex-roads">${s.roads.map(r=>roadRow(r,plan)).join('')}</ul></details>`:''}</article>`;
}

function arrivalBar(time,flex,arrival){
 const T=parseTime(time),lo=T-flex,hi=T+flex,span=hi-lo,at=m=>`${((m-lo)/span*100).toFixed(2)}%`;let x=null;try{x=parseTime(arrival);}catch{}
 const pos=x===null?null:Math.max(lo,Math.min(hi,x)),edge=pos===null?'':(pos-lo)/span<.15?' class="start"':(pos-lo)/span>.85?' class="end"':'';
 const marker=pos!==null?`<em${edge} style="left:${at(pos)}"><span>${clock(x)} 到班${x<lo||x>hi?'（超出彈性）':''}</span></em>`:'';
 return `<div class="flex-timeline"><div class="flex-track"><span class="earn" style="left:0;width:${at(T-CORE)}">+1 點</span><span class="core" style="left:${at(T-CORE)};width:${(CORE*2/span*100).toFixed(2)}%">核心 C 0 點</span><span class="earn" style="left:${at(T+CORE)};right:0">+1 點</span>${marker}</div><div class="flex-ticks"><span>${clock(lo)}<small>T − F</small></span><span>${clock(T-CORE)}<small>T − 15</small></span><span>${time} 上班<small>T</small></span><span>${clock(T+CORE)}<small>T + 15</small></span><span>${clock(hi)}<small>T + F</small></span></div></div>`;
}

export function createFlexReward({root,getSummary,bbox,wallet,onPick,onPosition}){
 const first=places[0];
 const state={place:first.id,lat:first.lat,lon:first.lon,time:'09:00',radius:2000,theta:.5,direction:'S',date:localDate(),arrival:'08:20',message:''};
 let plan=null,error='';
 function compute(){
  try{plan=flexPlan(getSummary(),state,bbox,{theta:state.theta,radius:state.radius});error='';}catch(e){plan=null;error=e.message;}
 }
 function checkin(){
  const s=plan?.sectors[state.direction];if(!s)return null;
  try{return rewardCheck(state.time,s.flex,state.arrival);}catch{return null;}
 }
 function render(){
  if(!plan&&!error)compute();
  onPosition?.(plan?state:null);
  const focus=document.activeElement?.id,option=(v,label,cur)=>`<option value="${esc(v)}" ${String(v)===String(cur)?'selected':''}>${esc(label)}</option>`;
  const form=`<form id="flex-form" class="flex-form"><label>公司位置<select id="flex-place">${places.map(p=>option(p.id,p.name,state.place)).join('')}${option('custom',state.place==='custom'?`自訂（${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}）`:'自訂座標',state.place)}</select></label>${state.place==='custom'?`<label>緯度<input id="flex-lat" type="number" step="any" value="${state.lat}"></label><label>經度<input id="flex-lon" type="number" step="any" value="${state.lon}"></label><button type="submit">套用座標</button>`:''}<button type="button" id="flex-pick">在 3D 地圖選位置 ↗</button><label>上班時間<select id="flex-time">${startTimes.map(t=>option(t,t,state.time)).join('')}</select></label><label>分析範圍<select id="flex-radius">${[1000,2000,3000].map(v=>option(v,`${v/1000} 公里內`,state.radius)).join('')}</select></label><label>壅塞門檻 θ<select id="flex-theta">${[.3,.5,.7].map(v=>option(v,`低速時間 ≥ ${v*100}%`,state.theta)).join('')}</select></label></form><p class="flex-error" role="alert">${esc(error)}</p>`;
  const intro=`<header class="flex-hero"><div><p class="eyebrow">FLEX REWARD / 錯峰到班獎勵</p><h2>避開塞車的人，<em>值得被獎勵。</em></h2><p>選擇公司位置與上班時間，依公司東、南、西、北四個方向道路的歷史壅塞，推薦各方向合理的彈性工時。員工在彈性時間內錯開尖峰到班，就能累積獎勵點數。</p></div>
<aside class="flex-rule"><h3>獎勵規則</h3><p>上班時間前後 15 分鐘是<b>尖峰核心時段</b>（例如 09:00 上班 → 08:45–09:15）。在公司提供的彈性工時內，於上班時間前 15 分鐘<b>之前</b>、或上班時間後 15 分鐘<b>之後</b>到班，即可獲得 <b>1 點</b>獎勵點數；點數可累積，到「獎勵兌換商品」兌換。</p><p>藉此鼓勵上班族避開塞車時段，也讓塞車時段的車流減少。</p><div class="flex-rule-chips"><span class="earn">提早錯峰 +1</span><span class="core">核心 ±15 分 0 點</span><span class="earn">延後錯峰 +1</span></div></aside></header>`;
  if(!plan){root.innerHTML=`<section class="flex-reward">${intro}${form}</section>`;restore(focus);return;}
  const list=Object.values(plan.sectors);
  const summary=`<div class="flex-result"><figure class="flex-compass">${compass(plan)}<figcaption>扇形顏色＝建議彈性長短；圓點＝周邊 VD 測點，顏色為上班核心時段低速時間占比；外圈 ${km(plan.radius)}、虛線圈 ${km(plan.radius/2)}。</figcaption></figure><div class="flex-summary"><h3>${esc(state.place==='custom'?'自訂位置':places.find(p=>p.id===state.place).name)} · ${state.time} 上班</h3><p>核心時段 ${plan.core.label}；分析 ${km(plan.radius)}內 ${plan.rows} 個測點方向，${plan.requested} 個非假日（${plan.dates} 日有快照）。</p><ul>${list.map(x=>`<li data-reason="${x.reason}"><span class="flex-swatch" style="background:${x.roads.length?flexColor(x.flex):'#eceee6'}"></span><b>${x.name}</b><strong>±${x.flex} 分</strong><small>${reasonNames[x.reason]}${x.peak?` · 高峰 ${x.peak.label}`:''}</small></li>`).join('')}</ul><p class="flex-summary-note">建議企業依員工主要來向分組設定彈性；同一方向給相同的彈性範圍，方便管理也方便員工選擇。</p></div></div>`;
  const cards=`<h3 class="flex-section-title">四個方向的計算結果</h3><p class="flex-key">卡片上的代號：<b>T</b> 上班時間、<b>F</b> 建議彈性工時（分鐘）、<b>W</b> 最大集合塞車時段、<b>n(D,t)</b> 方向 D 在時段 t 同時塞車的道路數、<b>n*</b> 其中的最大值、<b>C</b> 上班前後 15 分鐘的核心時段。<a href="#flex-formula">完整代號與符號說明 ↓</a></p><div class="flex-directions">${list.map(x=>directionCard(x,plan)).join('')}</div>`;
  const sim=`<section class="flex-checkin"><div><p class="eyebrow">CHECK-IN / 到班打卡試算</p><h3>今天這樣到班，拿得到點數嗎？</h3><p class="flex-checkin-intro">規則（計算步驟 9）：到班時間 x 在 T − F 到 T − 15 之前，或 T + 15 之後到 T + F，得 1 點。T＝上班時間、F＝你這個方向的建議彈性工時。</p><form id="flex-checkin-form"><label>我的通勤方向<select id="flex-direction">${list.map(x=>option(x.key,`${x.name}（±${x.flex} 分）`,state.direction)).join('')}</select></label><label>日期<input id="flex-date" type="date" value="${esc(state.date)}"></label><label>實際到班時間 x<input id="flex-arrival" type="time" value="${esc(state.arrival)}"></label><button type="submit" id="flex-checkin-submit">登記到班</button></form><div id="flex-check-live"></div>${state.message?`<p class="flex-check-saved" role="status">${esc(state.message)}</p>`:''}</div><aside class="flex-wallet"><span>目前獎勵點數</span><strong>${wallet.balance}</strong><small>點</small><button type="button" data-view="store">去兌換商品 →</button></aside></section>`;
  const method=`<section class="flex-formula" id="flex-formula"><p class="eyebrow">FORMULA / 計算方法</p><h3>建議彈性工時怎麼算？</h3>${flexMethodHtml(plan)}<p class="muted">同一份公式也收錄在「資料品質」頁。</p></section>`;
  const policy=`<section class="flex-policy"><p class="eyebrow">POLICY / 一連串的減塞設計</p><h3>政府、企業、上班族，一起錯開尖峰。</h3><ol><li><b>政府</b><span>提供歷史路況分析與各方向建議彈性工時；以「錯峰友善企業」標章、獎勵點數補助或採購加分等方式鼓勵企業參與，並用 VD 監測持續追蹤尖峰車流。</span></li><li><b>企業</b><span>依公司四個方向的建議設定彈性工時，登記員工到班時間發放點數，提供兌換商品與福利。</span></li><li><b>上班族</b><span>在彈性工時內避開尖峰核心時段到班，累積點數兌換交通、餐飲與休閒商品。</span></li><li><b>回到道路</b><span>尖峰核心時段的車流分散到前後時段；政府以監測資料檢視變化，再調整建議與獎勵。</span></li></ol></section>`;
  root.innerHTML=`<section class="flex-reward">${intro}<h3 class="flex-section-title">1. 選擇公司位置與上班時間</h3>${form}${summary}${cards}${sim}${method}${policy}<p class="flex-basis">歷史快照非即時路況；方向依 VD 測點相對公司位置劃分，不是員工實際路線。建議值是企業與政府討論的起點，需以試辦資料驗證。</p></section>`;
  live();restore(focus);
  window.flexRewardState={...plan,sectors:Object.fromEntries(list.map(x=>[x.key,{flex:x.flex,reason:x.reason,peak:x.peak?.label||null,counts:x.counts,roads:x.roads.length,chronic:x.chronic.length,window:x.window.label}]))};
 }
 // Arrival typing only refreshes the check-in result, so the time input keeps its cursor.
 function live(){
  const host=root.querySelector('#flex-check-live'),s=plan?.sectors[state.direction];if(!host||!s)return;
  const check=checkin(),done=wallet.checkedIn(state.date);
  host.innerHTML=`${arrivalBar(state.time,s.flex,state.arrival)}<p class="flex-check-result" data-points="${check?.points??0}" role="status">${check?esc(check.message):'請輸入到班時間'}${done?`　·　${esc(state.date)} 已登記過（${esc(done)} 到班），每個上班日最多 1 點`:''}</p>`;
  root.querySelector('#flex-checkin-submit').disabled=!check?.points||!!done;
 }
 function restore(id){if(id)root.querySelector('#'+id)?.focus();}
 root.addEventListener('change',e=>{
  const t=e.target;state.message='';
  if(t.id==='flex-place'){if(t.value!=='custom'){const p=places.find(p=>p.id===t.value);Object.assign(state,{place:p.id,lat:p.lat,lon:p.lon});compute();}else state.place='custom';}
  else if(t.id==='flex-time'){state.time=t.value;compute();}
  else if(t.id==='flex-radius'){state.radius=Number(t.value);compute();}
  else if(t.id==='flex-theta'){state.theta=Number(t.value);compute();}
  else if(t.id==='flex-direction')state.direction=t.value;
  else if(t.id==='flex-date')state.date=t.value;
  else return;
  render();
 });
 root.addEventListener('input',e=>{if(e.target.id!=='flex-arrival')return;state.arrival=e.target.value;state.message='';root.querySelector('.flex-check-saved')?.remove();live();});
 root.addEventListener('submit',e=>{
  e.preventDefault();
  if(e.target.id==='flex-form'){const lat=Number(root.querySelector('#flex-lat')?.value),lon=Number(root.querySelector('#flex-lon')?.value);Object.assign(state,{place:'custom',lat,lon});compute();render();}
  if(e.target.id==='flex-checkin-form'){const s=plan?.sectors[state.direction];if(!s)return;const check=checkin();if(!check)return;const r=wallet.earn({date:state.date,arrival:state.arrival,time:state.time,flex:s.flex,direction:s.name,check});state.message=r.recorded?`已登記 ${state.date} ${state.arrival} 到班，獲得 1 點！`:r.duplicate?'這天已經登記過了。':r.message;render();}
 });
 root.addEventListener('click',e=>{if(!e.target.closest('#flex-pick'))return;const message=onPick?.();if(message)root.querySelector('.flex-error').textContent=message;});
 return {render,currentPlan(){if(!plan&&!error)compute();return plan;},setPosition(p){Object.assign(state,{place:'custom',lat:p.lat,lon:p.lon});compute();},get plan(){return plan;},get state(){return {...state};}};
}

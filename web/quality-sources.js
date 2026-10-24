import { NEIHU_REGION } from './data/neihu-region.js';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=t=>Number.isFinite(Date.parse(t))?new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'未提供';
const base='https://tcgbusfs.blob.core.windows.net/blobtisv/';
export const liveSources=[
 {id:'VD',name:'VD 設備位置',use:'設備編號、座標、道路與偵測方向；供地圖測點定位。'},
 {id:'VDLive',name:'VD 分鐘車流',use:'車道速度、分車種量與觀測時間；供即時車流數值及動畫分級。'},
 {id:'Section',name:'官方發布路段',use:'SectionID、路段名稱與 LinkID 對照；供路段速率配對。'},
 {id:'LiveTraffic',name:'官方路段速率',use:'路段速度、路況分級及來源時間；有效且精確配對時使用。'}
];
const tdx='https://tdx.transportdata.tw/api/';
export const historicalSources=[
 ['GET','historical/v2/Historical/Road/Traffic/VD/City/Taipei','歷史設備與車道對照'],
 ['GET','historical/v2/Historical/Road/Traffic/Live/VD/City/Taipei','歷史逐分鐘車流的來源'],
 ['GET','historical/v2/Historical/Road/Traffic/Live/City/Taipei','歷史官方路段分級對照'],
 ['POST','basic/v2/Road/Link/LinkID','LinkID 道路資訊'],
 ['POST','basic/v2/Road/Link/Shape/Geometry/GeoJson','道路線形'],
 ['GET','basic/v2/Road/Traffic/CongestionLevel/City/Taipei','速率等級門檻'],
 ['GET','basic/v2/Road/Traffic/Section/City/Taipei','SectionID／LinkID 對照'],
 ['GET','basic/v2/Road/Traffic/Live/City/Taipei','來源整理階段使用的路況組別映射']
];
export const dataGaps=[
 {title:'09:30–10:30 與原始分鐘資料',now:'多日低速快照只有 07:00–09:30；只有彙整格，無法定位格內哪一分鐘低速。',need:'補同日期的逐分鐘原檔，延長至 10:30，保留缺漏及來源時間。',owner:'建議洽交工處／TDX 歷史資料窗口',effect:'才能檢查延後時段是否再塞，並精確核對上班前 15 分鐘。'},
 {title:'機車完整度與車道診斷',now:'公開 XML 有 M/S/L/T 車次，但沒有逐車道錯誤旗標；混合車道速度不是機車專屬速度。',need:'補車道診斷、偵測能力、實際／偵測車道對照，以及經確認可用的分車種速度。',owner:'建議洽交工處／設備資料窗口',effect:'區分零車流與漏測，避免錯估機車量或速度。'},
 {title:'橋梁、匝道與設備線形對照',now:'民權東路六段、新明路是走廊代理測點；部分 VD 方向缺歷史對照或線形。',need:'補有版本與有效日期的 VD／LinkID／SectionID 對照、橋梁實測點、合法轉向與路線旅時。',owner:'建議洽交工處；涉及國道或公路時另洽權管機關／TDX',effect:'確認量測代表範圍；目前不能把代理點當整座橋或提供保證省時的改道路線。'},
 {title:'分時車次與低速比例的日期一致性',now:'分時車次另取 10/22、10/23 CSV；目前多日快照截止 10/22，預設只能配對 10/22 的車次。',need:'補同日期、同方向、同車道的完整分車種分鐘序列與品質欄位。',owner:'公開來源補收／交工處與 TDX 資料核對',effect:'讓車次與低速比例能按共同日期比較；目前不把部分樣本擴算成整體進園總量。'},
 {title:'企業通勤條件與實際參與',now:'公司位置、上班時間由使用者輸入；東南西北只代表測點相對位置。',need:'由自願企業與員工提供彙整到班時段、常用路段、交通方式與可接受彈性範圍。',owner:'資料來自自願企業／員工，非已有的局處 API',effect:'核對推薦是否符合實際通勤；目前不能推定員工來向、參與人數或可控制車次。'},
 {title:'特殊事件與試辦效果',now:'尚未整合事故、施工、天氣等事件，也沒有可歸因的錯峰試辦資料。',need:'補事件時間／位置、試辦前後觀測、對照路段、實際採用與彙整回饋。',owner:'建議洽交通事件權管單位與氣象資料來源；試辦資料由參與者提供',effect:'辨別尖峰移轉與外在因素；歷史差異不能當成減塞或省時成效。'}
];
export function renderQualitySources(DATA,latest=null){
 const snapshot=latest||DATA.geography.inventory,mode=latest?'本頁工作階段最近收到的資料（非連線保證）':'已保存盤點（不是目前連線狀態）';
 const live=liveSources.map(s=>{const source=snapshot?.sources?.[s.id];return `<article class="api-source-card" data-feed="${s.id}"><p class="source-badge">公開 XML · 已串接</p><h3>${s.name}</h3><p>${s.use}</p><small>資料提供：臺北市交通局／交通管制工程處</small><small>${mode}：${source?.status==='PARSED'?'成功解析':source?'取得或解析失敗':'沒有紀錄'} · 來源更新 ${clock(source?.updateTime)}</small><details><summary>查看 API 位置</summary><code>GET ${base+s.id+'.xml'}</code><a href="${base+s.id+'.xml'}" target="_blank" rel="noopener noreferrer">開啟來源 ↗</a></details></article>`;}).join('');
 const catalog=historicalSources.map(([method,path,label])=>`<li><b>${label}</b><code>${method} ${tdx+path}</code></li>`).join('');
 return `<section class="quality-sources"><p class="eyebrow">SOURCES / 正在使用的資料</p><h2>API 來自哪裡？還缺什麼？</h2><p>即時監控使用臺北市公開 XML；歷史回放使用已匯入的 TDX 彙整快照。TDX 是交通部資料流通平台，不等於另一套獨立偵測器。</p><p class="source-session">${mode} · 接收時間 ${clock(snapshot?.fetchedAt)}。此頁不另行輪詢；即時觀測是否新近，請依「即時監控」的來源時間判讀。</p><div class="api-source-grid">${live}</div><p class="source-official">提供單位依據：<a href="https://data.taipei/dataset/detail?id=e57afe7f-3c9e-4f31-9208-eed859a92600" target="_blank" rel="noopener noreferrer">臺北市 VD 資料集</a>、<a href="https://data.taipei/dataset/detail?id=b5aaf33a-a6dc-4836-bce6-09986241fe11" target="_blank" rel="noopener noreferrer">臺北市道路速率資料集</a>。<a href="https://bote.gov.taipei/cp.aspx?n=8B8FFEA8353857B5" target="_blank" rel="noopener noreferrer">交工處介接說明</a>。</p>
 <details class="source-secondary"><summary>歷史 TDX、地圖與本機介接：用途及 API 位置</summary><article><h3>TDX 歷史與道路參考資料 · 已匯入快照</h3><p>取得平台：<a href="https://tdx.transportdata.tw/" target="_blank" rel="noopener noreferrer">交通部 TDX</a>；臺北市觀測與道路參考資料的供應來源依各資料集而異。此頁使用隊友彙整後匯入的檔案，沒有直接呼叫 TDX 更新。</p><p>匯入快照產生 ${clock(DATA.observations.provenance.generatedAt)}；來源版本 ${esc(DATA.observations.provenance.commit.slice(0,7))}。以下端點依匯入來源程式記錄，這次未重新驗證存取權限、配額或下載成功。</p><ul class="source-endpoints">${catalog}</ul></article><article><h3>OSM 道路底圖 · 已保存圖資</h3><p>來源：OpenStreetMap contributors，非市府局處 API。用於道路模型與名稱，不是車流觀測或已驗證的導航路線。</p><code>GET https://api.openstreetmap.org/api/0.6/map?bbox=...</code><code>https://overpass-api.de/api/interpreter</code><p>底圖合併不同批次的 OSM／Overpass 圖資，沒有單一取得時間；產製時間 ${clock(DATA.geography.roads.provenance?.generatedAt)}，不代表所有道路同時更新。<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">來源及 ODbL 授權</a>。</p></article><article><h3>內湖區界 · 官方圖資檔案</h3><p>提供單位：${esc(NEIHU_REGION.provenance.provider)}；版本 ${esc(NEIHU_REGION.provenance.boundaryVersion)}。用於篩選區界內 VD，並非即時車流 API，也不代表所有道路已有感測器。</p><a href="${esc(NEIHU_REGION.provenance.catalog)}" target="_blank" rel="noopener noreferrer">鄉鎮市區界線資料集 ↗</a></article><article><h3>公司名稱／地址搜尋 · Photon / OpenStreetMap</h3><code>POST /api/places → https://photon.komoot.io/api/</code><p>非局處 API，只協助定位公司；使用者按搜尋後才查詢，不提供車流或企業參與資料。只列目前底圖範圍內的結果，道路或區域結果會標示概略位置，須由使用者核對。查無結果不猜座標。搜尋文字在本機服務記憶體快取，有效期限一小時、服務重啟清除，不寫入檔案。</p><a href="https://github.com/komoot/photon#demo-server" target="_blank" rel="noopener noreferrer">服務來源與使用限制 ↗</a></article><article><h3>本機整合介面 · 專案自建</h3><code>GET /api/monitoring</code><p>由本機服務彙整前述四個 XML，非政府另提供的 API。即時頁每 60 秒查詢，超過 3 分鐘的觀測停用；單檔版沒有此服務。分時車次另讀已保存 CSV，不是新的 API。公司位置由使用者設定，未接公司名冊或員工通勤 API。</p></article></details>
 <h2 class="quality-gap-title">缺少哪些資料？補齊後能判斷什麼？</h2><div class="quality-gap-grid">${dataGaps.map((g,i)=>`<article data-gap="${i+1}"><h3>${g.title}</h3><p><b>目前：</b>${g.now}</p><p><b>需要補：</b>${g.need}</p><p class="gap-effect">${g.effect}</p><small>${g.owner}；尚未確認可取得。</small></article>`).join('')}</div><p class="source-official">來源與接線核對：2026-10-24。待補資料不等於已發布 API；CCTV、國道旅時與事件資料尚未接入。下方保留所選路段的原始品質統計。</p></section>`;
}

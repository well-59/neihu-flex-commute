# 內湖時間島

**目前版本：v8 3D 儀表板＋VD 位置盤點** — 內湖園區搞清楚要走的路。

- [3D 主畫面](web/traffic-island.html)：道路模型、歷史回放、路段分析、通勤時段比較、資料品質。
- VD 測點已整合至「即時監控」與「城市回放」，主導覽暫時移除獨立「VD 位置」分頁；原設備頁程式與資料保留。
- [即時監控](http://127.0.0.1:4173/traffic-island.html?view=live)：同一張 3D 地圖，以臺北市公開 VD／路段觀測更新；需本機服務與 Python 3。
- [單一 HTML 展示檔](web/traffic-island-standalone.html)：內嵌資料與程式，Three.js CDN 仍需網路。
- [2D 備援與單日補充](web/planner.html)、[五頁提案](web/proposal.html)、[官方路口調查](web/evidence/index.html)。

## 啟動

需要 Node 24；不用安裝前端套件或執行 build。

```sh
node scripts/negotiation-server.mjs
```

開啟 <http://127.0.0.1:4173/traffic-island.html>。一般靜態伺服器開啟 `web/index.html` 也會導向 3D 版。

即時監控每 60 秒向本機 `/api/monitoring` 查詢，伺服器從四份臺北市官方公開 XML 取得資料，不使用 TDX 金鑰。離開即時頁即停止輪詢；單一 HTML 與純靜態服務提供歷史回放及已保存的 VD 盤點，不提供此 API。來源超過 3 分鐘即停用；速度使用官方路段或 VD 車道加權速度，動畫為流量分級與統一 4 倍時間縮放，並非逐車追蹤。

設備數、道路名稱、路段編碼與來源 URL：[監控盤點](docs/MONITORING-INVENTORY.md)、[逐方向 CSV](docs/MONITORING-INVENTORY.csv)、[完整 JSON](docs/MONITORING-INVENTORY.json)。盤點與即時顯示是不同時間的快照，數量可能變動。重新盤點：`python3 scripts/monitoring-snapshot.py --report`。

VD 位置頁以已保存盤點為起點，也可手動更新。128 個設備中 90 個位於現有底圖內；38 個圖外設備保留清單與 OpenStreetMap 座標連結。點位保留官方 WGS84 座標，不吸附到鄰近道路；TDX 線形只依相同設備、LinkID、道路與路段方位對照，虛線不表示感測範圍。觀測時間、分鐘資料發布時間、本機接收時間分開顯示；設備每日實際啟停時段未提供。

2026-10-24 方向欄位更正：先前公開 XML 解析以 `RoadDirection` 填入 `bearing`，現改讀 `Bearing`，另保留 `roadDirection`。`RoadDirection` 表示道路方向，`Bearing` 表示局部路段方位；本批 43 筆不同，23 筆涉及既有歷史對照。依[官方欄位定義](https://thbapp.thb.gov.tw/opendata/vdinfo.aspx)修正，以免彎道路段被判成方向不符。歷史快照與使用者的下載 XML 不改動。

更新保存盤點後，執行 `node scripts/export-vd-inventory.mjs` 再執行 `node scripts/export-traffic-island.mjs`，同步設備頁與單檔。單檔含設備盤點，但不提供手動即時更新。

`negotiation-server.mjs` 是沿用的本機預覽服務名稱，也保留歷史協商頁的可選 Claude CLI 橋接；目前 3D 功能不依賴 Claude。它只監聽本機，不是公開部署用伺服器。

## 目前資料夾

| 位置 | 用途 |
|---|---|
| `web/traffic-*` | 目前 3D 介面、場景、路網、車流、單檔 |
| `web/planner*`、`web/dashboard-shell.js` | 2D 備援、觀測證據與獨立配置 |
| `web/route-evidence*`、`web/road-scene.js`、`web/planning-model.js` | 共用資料計算與地圖 |
| `web/data/`、`web/vendor/` | 現行快照、圖資、來源計算 |
| [dataset/](dataset/README.md) | 10/22、10/23 的原始收集檔；另行匯出分時車次，按日期與測點對照 |
| `web/evidence/` | 仍被現行版本使用的 2025 官方調查、原始 XLSX 與重建工具 |
| `docs/` | [3D 規格](docs/TRAFFIC-ISLAND-3D-SPEC.md)、[API 清單](docs/TDX-API-CATALOG.md)、[隊友來源紀錄](docs/TEAMMATE-INTEGRATION.md) |
| `scripts/`、`collector/` | 預覽、匯出、匯入、圖資與單日資料處理、收集工具 |
| `tests/` | 現行功能及仍使用的共用模型測試 |
| [archive/](archive/README.md) | 歷史總索引、設計／審查／改版紀錄、舊工具與測試 |
| `web/archive/pre-v8/` | 可經預覽服務開啟的舊 UI；由歷史索引統一導覽 |

`observatory.css` 仍供 2D 頁面使用；`negotiation-model.js` 仍供 `baseline-audit.js` 作舊基準一致性診斷。這些共用檔案保留在現行目錄，不能僅依名稱移除。歷史資料有現行用途，並不因日期較舊而歸檔。

## 資料界線

- 多日 VD 快照：2026-09-23–10-22；預設排除假日為 18／19 個資料日，07:00–09:30。不是即時路況。
- 園區 30 個代表方向都有底圖對照；全部盤點 81 個方向中 70 個能對應。未對應方向保留統計並提示無法定位。
- 底圖 549 個道路圖徵、400 條動畫路徑。歷史回放的車種、模型台數與速度是示意配置，未校準成流量、排隊或 OD。細目可在「資料品質」查看。
- 3D 主展示改為歷史通勤時段比較，不預設公司或駕駛參與，不估計錯峰改善。2D 備援內原有合成情境仍保留，不作為本次提案的成效證據。
- 即時分車種欄位已從公開 XML 實際取得，但沒有逐車道診斷旗標；不宣稱完整機車偵測。多日 09:30–10:30、合法轉向、真實排隊長度與實機效能仍未驗證。

## 維護與驗證

```sh
# 重新產生單一 HTML
node scripts/export-traffic-island.mjs

# 現行資料與模型測試
node --test tests/*.test.cjs tests/*.test.mjs web/evidence/tests/data-model.test.cjs

# 瀏覽器回歸：需預覽服務與專用 Chrome CDP
node tests/planner-browser.cjs
node tests/traffic-island-browser.cjs

# 即時資料解析、缺值與時間狀態；瀏覽器測試需 4173 與 Chrome CDP 9342
python3 tests/monitoring_snapshot_test.py
node tests/traffic-monitor-browser.cjs
node tests/vd-location-browser.cjs
```

3D 瀏覽器測試預設使用 `http://[::1]:9342/json`，可用 `NEIHU_3D_CDP` 指定；2D 使用 `http://127.0.0.1:9341/json`。瀏覽器測試會操作專用分頁。

資料重建工具留在 `scripts/`；`build-data.mjs` 需要本機原始收集檔，不能為整理目錄直接重跑覆寫快照。隊友匯入工具唯讀同層來源 repo；目前頁面直接使用已匯入的快照。

## 保存與歷史

整理前保存點：[b398fdd](https://github.com/well-59/neihu-flex-commute/commit/b398fddf491006649559bc7eae9e0beb13bf1a85)，位於自己的 `well-59/neihu-flex-commute`；原分支 `integrate/local-competition-materials` 已整合，保存點直接由 commit 連結存取。

- [完整開發與驗證紀錄](archive/pre-v8/docs/README-before-cleanup.md)
- [本次移動對照與原始雜湊](archive/FILE-MAP-20261024.json)
- [歷史材料索引](archive/README.md)

2026-10-24 依使用者要求整理；保留現行展示、備援與實際相依，歷史 UI 與過程資料移入歷史區。隊友 repo 與同層其他資料夾未修改。歸檔當時尚未 commit／push；其後依使用者要求，與 VD 位置盤點版本一起整合回自己的 `main`。

歸檔完成當時驗證：PASS — 72 項現行／歷史模型測試、3D 與 2D Chrome 回歸、三個歸檔 UI 初始化、首頁導向與相對連結檢查。22 項移動均有對照紀錄；當時的 3D 程式、資料與單檔內容對照保存點一致；後續 VD 與監控功能另有修改。舊版完整瀏覽器測試與實機效能未重跑。

## 2026-10-24 整合版本

本版收錄歷史材料歸檔、臺北市公開來源盤點、即時監控第一版，以及 VD 位置／方向／TDX 路段與時間對照。車流動畫後續調整依使用者要求暫停，現有第一版保留；VD 位置頁不播放車流，也不自動輪詢。

驗證紀錄：PASS — 72 項 Node 模型測試、6 項 Python 解析測試、VD 位置頁 Chrome 檢查及既有 3D 完整回歸（含手機版、單檔與錯誤備援）。單檔匯出與 Git diff 格式檢查通過。即時 API／動畫串接曾通過實際來源與瀏覽器檢查；本次方向欄位更正有專門模型／解析測試，未重新跑完整即時瀏覽器測試。資料覆蓋、合法轉向與排隊長度的限制仍依上節，不因測試通過而視為已校準。

來源檔、歷史快照與隊友 repo 保持原樣；原始下載與 API 快取留在 Git 排除的 `data/`，本次僅保存有來源時間與雜湊的公開盤點快照及展示資料。

## 分支維護方式

2026-10-24 使用者決定：本 repo 統一在 `main` 整理與開發，除非另有明確要求，不建立其他工作分支。commit／push 仍需當次或持續有效的明確授權；這項決定不代表每次修改都自動上傳。

舊概念稿、10/22–10/23 收集資料及舊生成結果已合併保存；現行畫面程式與展示資料不因本次分支整理而變更。原分支的 commit 歷史保留在 `main`，歸檔位置見 [歷史索引](archive/README.md)。舊自動開分支／PR 工具僅歸檔，不作為目前上傳流程。

## 分時路段比較

路段分析以長橫向色帶呈現：每列是一個路段測點方向，10 格分別顯示 07:00–07:15 至 09:15–09:30 的低速時間占比，固定對齊以比較同一時段。點色格留在分析頁，展開該格車次、反覆低速日數與完整度；另按明細按鈕才切地圖。手機橫捲時固定路名；同路名方向以 VD 編號區分。整段晨峰概況在 3D 版收合保留。百分比是低速分鐘／可判讀分鐘，不是平均速度、塞車車輛比例或遇到塞車機率。車次來自另存公開 CSV，與原多日低速分級的有效分鐘口徑不同，分開揭露樣本日與分母。

重建與來源限制見 [歷史收集資料](dataset/README.md)。多日快照及動畫不變；分時車次不由晨峰平均值乘以 15，也不加總為不重複進園總量。駕駛可比較歷史時段，實際改道須查看即時監控，且目前沒有替代路線的連通、合法轉向與旅時驗證。

## 動態島道路點選與分時連動

歷史城市回放可滑鼠移過或點選目前底圖道路：提示實際圖資路名、所選 15 分鐘時段與可對照的低速時間占比；點選後在同一頁下方呈現該觀測方向的 10 格色帶，切格同步右側明細。觀測範圍外的已知道路會切換全部範圍；未配對道路顯示缺資料，不沿用上一條路的數值。顏色與分析色帶採同一顯示級距；未修改車流動畫、原始觀測與路網拓樸。

目前底圖的 549 個道路圖徵、4,056 個方向小段都有點選幾何；其中 977 個小段可依既有路名、方向與線形對照觀測。這是目前底圖範圍的互動覆蓋，不代表內湖所有道路已有感測器或道路拓樸、導航轉向、觀測代表範圍已完整驗證。既有幾何對照仍含距離容許值，不能宣稱逐車道或全程旅速精度。

瀏覽器檢查：`node tests/road-inspector-browser.cjs`（專用 Chrome，預設 CDP 9345，可由 `NEIHU_3D_CDP` 指定）。包含原始方向邊覆蓋、實際滑鼠點選、有／無資料、跨範圍、時段同步、平面／高架點選分層、單檔及手機版。

## VD 測點共用圖層

城市回放與即時監控預設顯示圖內 VD，可用「VD 測點」按鈕開關。點藍色測點或補充線形可切換 LinkID／方向，查看官方座標、來源時間與該設備數值；已納入現有路段清單的測點會同步選取路段。歷史模式顯示所選日期／時段的低速時間占比，分鐘樣本時間另列；即時模式沿用 `/api/monitoring` 更新，超過 3 分鐘或基本檢查未通過時停用分鐘數值。圖層本身不增加輪詢。

已有精確 VDID／LinkID／道路／Bearing 對照、但目前未畫出的方向，補顯示經底圖邊界裁切的藍色 TDX 參考線。藍線不代表現在塞車、感測範圍或已驗證的實體道路拓樸；無線形者只留官方測點。原 VD 位置頁的手動更新也同步至共用圖層。

2026-10-24 13:15（臺北時間）重新盤點並匯出：128 個設備、90 個圖內測點；保存的 VD 分鐘樣本為 13:13，與即時頁後續重新取得的觀測分開。來源時間、雜湊與覆蓋見 [盤點](docs/MONITORING-INVENTORY.md)。原多日歷史快照與車流動畫未改動。

新增瀏覽器檢查：`node tests/vd-overlay-browser.cjs`，專用 Chrome 預設 CDP 9347，可設定 `NEIHU_3D_CDP`。涵蓋真實來源同步、方向選取、歷史／即時時間分離、過期數值停用、缺線形、開關、手機與單檔。

## 通勤時段比較（取代主展示的錯峰實驗）

2026-10-24：使用者指出人與企業的參與不可控，同意由調度合成群體改為歷史路況比較。主展示移除參與比例、四組群體與配置最佳化輸出；舊 `?view=scenario` 入口轉向通勤比較。底層舊模型保留供 2D 備援，不再由 3D 主頁求解或輸出改善數值。

比較同一路段方向的 A／B 過點時段，沿用上方日期、範圍、假日與路段選擇。各卡呈現低速時間占比、可判讀分鐘及車種車次樣本；差值只使用兩時段都有可判讀分鐘的共同日期，以百分點表示，明列兩邊有效分鐘。共同日期仍不等於同等交通條件，不宣稱因果效果。07:00–09:30 有多日快照；09:30–10:30 保留選項但明示缺資料，不外推。時段不是出發／到班時間，車次不等於不重複進園數或參與人數。

驗證指令：`node --test tests/commute-comparison.test.mjs tests/period-comparison.test.mjs`；既有 `tests/traffic-island-browser.cjs` 已將原主頁合成情境操作更新為通勤比較、缺資料與日期切換檢查。舊模型的獨立測試仍保留。`tests/commute-browser.cjs` 另驗證舊網址轉向、與原始 bins 對照、路段／日期／假日篩選及回到同一路段地圖。

# 錯峰之前 — 本地概念第一版

狀態：本地可操作原型 COMPLETED；合格內湖晨峰資料與交通效果 UNVERIFIED。未發布、未 commit、未 push。使用者授權本地製作，不代表主辦方已核可參賽作品或試辦。

## 開啟與展示

直接雙擊本目錄 `index.html`，不需要安裝套件、啟動伺服器或 API Key。將整個 `demo-v1` 資料夾一起保留。內建 JS/CSS 為本地檔案；外部來源連結只在使用者點擊時開啟。

右上角「開始兩分鐘導覽」會顯示計時與口白，手動點「下一段」控制節奏，超過兩分鐘仍保留畫面。導覽不是自動播放，也沒有完成真人兩分鐘排練。

1. 0–30 秒：觀測資料缺口；測站流量不是潛在抵達需求。
2. 30–60 秒：全合成案例，40 車次移到 08:00，最高單格需求由 160 變 140；可切換到 08:30，看到 180。
3. 60–95 秒：固定同一個「移到 08:00」方案，交換兩側背景，最高單格需求變 180。展示承接背景的重要性。
4. 95–120 秒：提出自願參與、現場確認、比較設計與停止條件；不能直接將志願者結果外推全體。

案例的單位是「假設抵達車次／15 分鐘」，全部合成。10 格共 1,100 車次，沒有道路容量、排隊或省時模型。觀測、合成與試辦建議分開呈現。

## 實際取得的公開樣本

來源： https://tcgbusfs.blob.core.windows.net/blobtisv/GetVDDATA.xml

下載於 2026-10-19；精確 UTC 時間、大小、SHA-256 見 `data/sample-manifest.json`。完整原始 XML 無損壓縮保存在 `data/vdlive-downloaded.xml.gz`，manifest 的 hash 對應解壓後 bytes。

實際解析得到 724 個 VDDevice 節點；ExchangeTime 為 `2024/11/14T16:46:02`，原欄位沒有 UTC offset。這是過時的全市候選來源樣本，尚未確認內湖設備範圍，未用於晨峰推論。TimeInterval 與 Volume 的統計語義尚未完成核驗，沒有擅自聚合。

臺北市目錄與 TDX 官方 OAS 等來源及取得狀態已列在頁面「資料清單」。TDX 僅讀公開規格，未使用會員金鑰、付費呼叫或啟動持續蒐集。捷運僅確認月份索引，未下載完整月份資料。來源資料適用授權仍須按各來源頁確認；臺北市目錄標示政府資料開放授權條款第 1 版。

## 本機 JSON 匯入契約

頁面可下載完整的合成格式範例。以下欄位必填：

- `schema`: `neihu-observation-v1`
- `unit`: `vehicles/15min`；`timezone`: `Asia/Taipei`
- `source`, `corridor`, `direction`, `aggregation`: 非空文字，各不超過 500 字。由資料準備者說明來源、單一路段與方向、完整率分母及聚合方式。
- `rows`: 1–5,000 筆，每筆 `start` 格式 `YYYY-MM-DDTHH:mm:00+08:00`，分鐘限 00/15/30/45，日期必須有效，區間含起點不含終點，不得重複。
- `volume`: 非負整數車次或 `null`；`speed`: 非負有限數值 km/h 或 `null`；`coverage`: 0–1。
- `coverage < 1` 時，volume 與 speed 都必須為 null。這是第一版保守的共同完整率契約，尚未分開流量／速度完整率。

檔案最大 2 MB；拒收 -99 等異常值、未知單位、壞日期及重複 key。零保持零，null 顯示缺值，沒有自動補齊缺列。匯入僅顯示表格，不自動變成已核驗資料；不查外部來源、不推定路段確在內湖、不判斷代表性。資料不會持久保存，重新整理即清除。

## 驗證

2026-10-19：

- PASS：`node --test tests/core.test.cjs`，三組測試包含六種情境守恆、峰值與排序反轉、並列峰、零與缺值、八類負向輸入。
- PASS：`node --check app.js`。
- PASS：Chrome headless 實際 `file://` 載入；完整四段導覽、情境按鈕、有效匯入、三類壞檔、輸入文字不被當 HTML、亂序檔案讀取、四頁 390px 無頁面水平溢出、無 JavaScript exception、無頁面 HTTP(S) 請求。
- PASS：1280px 桌面與 390px 手機截圖人工檢視。截圖是開發驗收，不代表真人發表排練。
- NOT RUN：Safari、Firefox、螢幕閱讀器、真實交通 API 歷史資料整合與現場試辦。
- Build：不適用，純靜態檔案。

瀏覽器測試使用 Node 24 內建 WebSocket，無額外套件。先自行啟動專用 Chrome debugging session（避免接到日常瀏覽器）：

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --no-default-browser-check --user-data-dir=/private/tmp/neihu-v1-chrome --remote-debugging-port=9334 about:blank
```

另一個終端機在本目錄執行 `node tests/browser.test.cjs`。測試結束會關閉這個專用 Chrome，截圖輸出至 `/private/tmp/neihu-v1-desktop.png` 及 `/private/tmp/neihu-v1-mobile.png`。

## 審查與剩餘條件

Claude A：實作前討論離線載入與背景交換，已採用本地 script 與 File API；只交換兩側背景。

獨立 Codex：經理人／交通執行角度審查後提出導覽畫面一致性及非同步匯入競態；兩項已修正，複核 PASS（合成概念第一版）。

Claude B：獨立閱讀實作，要求導覽固定比較、志願者外推限制與指標合成標示；已修正。最終複核確認三項必要修正皆已解決；Chrome 驗收由主審執行，Claude B 未獨立重跑。非阻擋建議：口白日後可再加入志願者外推限制（目前已在試辦卡呈現）。

剩餘資料需求：可用的同日期 VD 位置與方向、足夠多個平日晨峰、資料品質與統計區間、速度／排隊及現場事件；試辦需另確認權責、參與者、對照與停止門檻。第一版不能用來決定哪條路分流、企業排班或宣稱改善百分比。

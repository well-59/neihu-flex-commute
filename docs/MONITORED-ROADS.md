# 內湖現行 VD 監控道路對照

2026-10-24 補齊。此對照只陳述「有 VD 的道路方向」，不代表內湖所有道路都有監測，也不提供導航、合法轉向完整性或逐車 GPS。

## 範圍與線形

`web/monitored-roads.js` 的 `buildMonitoredSummary(inventory, history)` 依現行盤點的官方座標與內湖區多邊形分類，保留每個設備與偵測方向；不使用歷史排名的代表方向篩選。

本次基準 `docs/MONITORING-INVENTORY.json`：52 個設備、80 個方向、21 個道路名稱。80 個方向均以 VD ID、LinkID、bearing、roadName 與既存官方 TDX 線形逐筆相符，沒有以鄰近道路猜測。包含東湖路、成功路五段、成功路四段、文德路。方向完整座標範圍為 `[121.55839,25.05341,121.61609,25.08509]`。

多個設備可能觀測同一個 LinkID，仍分別保留可檢視的設備方向。新設備沒有直接參照時，僅可使用完全相同 LinkID、方向、路名且所有參照線形一致的既存幾何，並註記 `exact-link-direction`；未知線形保留為 `geometry:null`、`geometryState:unmapped`，不移至鄰近道路。

## 來源

- VD 來源及時間：`docs/MONITORING-INVENTORY.json` 與 `web/data/vd-inventory.js`。即時觀測由既有本機監控端點取得，這些已存資產不是即時觀測。
- TDX 幾何：`web/data/route-clarity.json` 的 `directions[].geometry`；原始擷取的請求 URL、時間及 SHA-256 在 `referenceSources`（2026-10-23）。本次未重新呼叫計費 TDX API，也未修改歷史觀測。
- 行政區界：內政部國土測繪中心，[資料目錄](https://data.gov.tw/dataset/7441)、[下載目錄](https://maps.nlsc.gov.tw/pro/download.jsp)。使用先前核對時保存的 `TOWN_MOI_1120317`、內湖區代碼 `63000100`、EPSG:3824 / TWD97 經緯度 1433 點多邊形，存入 `web/data/neihu-region.js`，保留下載 URL。VD 座標直接做點在多邊形內判定；來源座標與區界精度使邊界附近有誤差，52 是座標分類數，不是法律上設備管轄權判定。
- 實體道路：[OpenStreetMap API](https://api.openstreetmap.org/api/0.6/map) 及 [Overpass](https://overpass-api.de/api/interpreter)，© OpenStreetMap contributors / [ODbL](https://www.openstreetmap.org/copyright)。合併既存保留快照、2026-10-24 擷取的道路查詢與東湖小範圍原始 API 圖資；查詢的 OSM 基準時間為 `2026-10-24T04:41:52Z`。個別輸入的 SHA-256、OSM 版本時間與來源保存在 `NEIHU_ROADS.provenance.sources`。這是混合已存與新擷取資料，頂層 `retrievedAt:null` 不假裝全部曾在同一時間重新抓取。

擴展後 OSM 顯示範圍 `[121.550,25.047,121.623,25.091]`，1277 個地物（1273 個道路 LineString），包含原先缺漏的四條道路、motorway_link 與 tertiary_link 引道。來源節點 `nodeRefs` 與座標逐點對應，`tags` 保留原始道路標籤，並保留 93 個所有成員道路都存在於顯示網路的轉向限制關係。單行、汽機車通行、橋梁、隧道、layer 不因視覺建模而捨棄。資料缺少的法規與號誌仍屬未知。

保留快照可直接重建顯示資產（先複製以避免輸入檔被覆蓋）：

```sh
cp web/data/neihu-roads.osm /tmp/neihu-roads-saved.osm
python3 scripts/build-road-network.py /tmp/neihu-roads-saved.osm
```

## 對照限制

完整的官方 LinkID 線形覆蓋與 OSM 顯示表面配對是兩件事。多設備共用 LinkID 時，顯示段可保留多個候選設備 ID，但每段仍只選一個主要讀值。以更新後的保守網路比對，80 個方向中 79 個至少有一段 OSM 對應。

剩餘 `V6121A0:2000700100400A` 的 TDX 路名是「堤頂大道」，附近 OSM 高架匝道為「堤頂大道出口匝道」`way/51813000`（layer 3），同處又有相距數公尺的南京東路六段平面道路。不得因接近就把數值套在平面路；應使用明示來源的原始官方 Link 線形供點選與顯示，或另行人工確認匝道對照後新增有來源的明確映射。TDX 路線的道路分類為 2「市區快速道路」，但其線形本身沒有提供高度。

## 驗證

`node --test tests/monitored-roads.test.mjs tests/road-scene.test.cjs`：8 個測試通過，涵蓋 80/52/21 基準、四條補路、原資料不變、同 LinkID 多設備、未知線形不猜測、真實引道與逐點來源節點保留。整合的模型島、狀態色、點選及手機操作由主流程另行檢查。

## 已核對匝道名稱例外

現行 V6121A0 / LinkID 2000700100400A 的官方路名為堤頂大道，OSM source way 51813000 為堤頂大道出口匝道、layer 3。資料 adapter 只對這個 ID 保留明確 source way 對照，匹配仍須通過官方線形距離與方向條件，不將鄰近地面南京東路六段染色。包含此例外及共用 LinkID 設備後，現行 80/80 個方向可對照至實體底圖，不需要虛構平面道路備援。

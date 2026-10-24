# 隊友資料 API 位置與使用方式

記錄日期：2026-10-24。來源為隊友 repo `ed126ccf4fb8e2d79a2cbe1047509b7540167901` 的程式與隨附快照。**FACT：程式中使用的 URL／欄位；不是本輪重新呼叫成功的保證。外部 API、權限、額度及最新 schema：UNVERIFIED。**

機器可讀清單：[TDX-API-CATALOG.json](TDX-API-CATALOG.json)。改版需求與審查：[DASHBOARD-REQUIREMENTS-20261024.md](../archive/pre-v8/docs/DASHBOARD-REQUIREMENTS-20261024.md)。

隊友 repo 唯讀；不複製憑證、不在隊友目錄執行資料更新。後續下載／彙整管線只能在我方專案執行，API Token 不進瀏覽器或 Git。

## TDX 取得 Token

`POST https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token`

- 請求：grant_type=client_credentials；client_id/client_secret 只由執行環境提供
- 程式使用／預期欄位：`access_token`
- 用途與界線：只供伺服器端認證，不是交通資料
- 程式來源：[scripts/download.mjs:47](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/download.mjs#L47)

## 歷史設備與車道方向

`GET https://tdx.transportdata.tw/api/historical/v2/Historical/Road/Traffic/VD/City/Taipei`

- 請求：Dates=YYYY-MM-DD；$format=JSONL；$top=2000
- 程式使用／預期欄位：`VDID,TownName,PositionLat,PositionLon,DetectionLinks[LinkID,LaneNum,ActualLaneNum]`
- 用途與界線：依同日靜態資料建立測點、方向與車道涵蓋
- 程式來源：[scripts/download.mjs:118](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/download.mjs#L118)

## 歷史逐分鐘車流

`GET https://tdx.transportdata.tw/api/historical/v2/Historical/Road/Traffic/Live/VD/City/Taipei`

- 請求：Dates=YYYY-MM-DD；$format=JSONL；$top=2000000
- 程式使用／預期欄位：`VDID,DataCollectTime,Status,LinkFlows[].Lanes[LaneID,Speed,Occupancy,ErrorDiags,Vehicles[VehicleType,Volume]]`
- 用途與界線：分車種流量源頭；現有彙整沒有保留完整分車種序列
- 程式來源：[scripts/download.mjs:126](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/download.mjs#L126)

## 歷史官方發布路段路況

`GET https://tdx.transportdata.tw/api/historical/v2/Historical/Road/Traffic/Live/City/Taipei`

- 請求：Dates=YYYY-MM-DD；$format=JSONL；$top=3000000
- 程式使用／預期欄位：`SectionID,DataCollectTime,TravelSpeed,CongestionLevel`
- 用途與界線：與 VD 同時刻分級比對；可能同源，不是獨立政策成效
- 程式來源：[scripts/download-sections.mjs:59](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/download-sections.mjs#L59)

## 目前設備靜態資料

`GET https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/VD/City/Taipei`

- 請求：$format=JSON
- 程式使用／預期欄位：`VDs[].VDID,VDs[].DetectionLinks`
- 用途與界線：目前收集程式仍用歷史快照 VD 清單過濾；新設備需重新盤點
- 程式來源：[scripts/live-update.mjs:44](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/live-update.mjs#L44)

## 目前 VD 分鐘觀測

`GET https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/VD/City/Taipei`

- 請求：$format=JSON
- 程式使用／預期欄位：`VDLives[].VDID,DataCollectTime,LinkFlows[].Lanes[].ErrorType,Vehicles`
- 用途與界線：現有程式每分鐘輪詢；ErrorType 轉為 ErrorDiags 供共用篩選
- 程式來源：[scripts/live-update.mjs:44](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/live-update.mjs#L44)

## 臺北市速率等級門檻

`GET https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/CongestionLevel/City/Taipei`

- 請求：$format=JSON
- 程式使用／預期欄位：`CongestionLevels[CongestionLevelID,MeasureIndex,Levels[Level,LowValue,TopValue]]`
- 用途與界線：官方 A–F 門檻；以 E/F 定義壅塞是專案規則
- 程式來源：[scripts/reference.mjs:71](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/reference.mjs#L71)

## 官方發布路段對照

`GET https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Section/City/Taipei`

- 請求：$format=JSON
- 程式使用／預期欄位：`Sections[SectionID,SectionName,LinkIDs,RoadDirection,SectionLength]`
- 用途與界線：建立 SectionID 與 LinkID 對照，非任意名稱配對
- 程式來源：[scripts/reference.mjs:72](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/reference.mjs#L72)

## 官方發布路段目前路況

`GET https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/City/Taipei`

- 請求：$format=JSON
- 程式使用／預期欄位：`LiveTraffics[SectionID,TravelSpeed,CongestionLevel,CongestionLevelID,DataCollectTime]`
- 用途與界線：reference 腳本取得組別映射；現有 live-update 並未每分鐘取得此端點
- 程式來源：[scripts/reference.mjs:73](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/reference.mjs#L73)

## 官方 LinkID 路段資訊

`POST https://tdx.transportdata.tw/api/basic/v2/Road/Link/LinkID`

- 請求：$format=JSON；JSON body = LinkID 字串陣列
- 程式使用／預期欄位：`LinkID,RoadName,RoadDirection,RoadClass,StartPoint,EndPoint,Length,Version`
- 用途與界線：地圖、方向與路段範圍
- 程式來源：[scripts/reference.mjs:69](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/reference.mjs#L69)

## 官方路段 GeoJSON 線形

`POST https://tdx.transportdata.tw/api/basic/v2/Road/Link/Shape/Geometry/GeoJson`

- 請求：$format=JSON；JSON body = LinkID 字串陣列
- 程式使用／預期欄位：`features[].properties.LinkID,features[].geometry.coordinates`
- 用途與界線：經緯度次序 lon,lat；用 LinkID 映射現有地圖
- 程式來源：[scripts/reference.mjs:70](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/reference.mjs#L70)

## 道路名稱查 LinkID 集合

`GET https://tdx.transportdata.tw/api/basic/v2/Road/Link/CityRoad/Taipei/{roadName}`

- 請求：$format=JSON；roadName 需 URL encode
- 程式使用／預期欄位：`LinkID,RoadName,RoadDirection,StartPoint,EndPoint`
- 用途與界線：取得園區道路區段，勿只用名稱合併不同方向
- 程式來源：[scripts/reference.mjs:79](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/reference.mjs#L79)

## 官方門牌定位

`GET https://tdx.transportdata.tw/api/advanced/V3/Map/GeoCode/Coordinate/Address/{address}`

- 請求：$format=JSON；address 需 URL encode
- 程式使用／預期欄位：`Address,Geometry (POINT)`
- 用途與界線：園區門牌或使用者指定目的地；回傳地址仍須核對，不必綁公司
- 程式來源：[scripts/reference.mjs:93](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/reference.mjs#L93)

## 上市公司基本資料（選用）

`GET https://openapi.twse.com.tw/v1/opendata/t187ap03_L`

- 請求：無；目前為全部清單後按公司代號篩選
- 程式使用／預期欄位：`公司代號,住址,出表日期`
- 用途與界線：範本公司地址來源，不是交通需求或員工上下班證據
- 程式來源：[scripts/reference.mjs:114](https://github.com/zach0627/neihu-route-clarity/blob/ed126ccf4fb8e2d79a2cbe1047509b7540167901/scripts/reference.mjs#L114)

## 快照、原始檔與串接現況

| 項目 | 隊友 repo 內容／查得現況 | 我方如何延續 |
| --- | --- | --- |
| `data/dashboard.json` | 2026-10-23T13:02:50.190Z 產生；56 設備、84 方向、30 園區代表方向；21 / 22 日 | 先用可追溯歷史回放；全路段與代表路段分層 |
| `data/reference.json` | 81 Link metadata、81 線形、50 發布路段、7 組門檻、92 門牌查詢結果（不是全部採用） | 保留幾何、組別、版本及來源；不能把 81 線形稱為 81 完整量測路段 |
| `research/` | 本機 clone 不存在；快照保存來源 URL／hash，但沒有原始分鐘內容 | 取得原檔或在我方重新下載，才能重建分車種／時間擴展 |
| `data/live.json` | 本機 clone 不存在；不是有程式就已有即時資料 | 無即時資料時保持歷史模式／缺資料狀態 |
| `scripts/live-update.mjs` | 每分鐘收集 VD，形成近 15 分鐘判讀；現有輸出主要是速度／等級／低速比例 | 必須增保存汽機車量、品質及觀測時間；目前不輸出分車種流量序列 |
| `.github/workflows/pages.yml:20` | 晨峰排程收集→測試→建置→發布；受排程與執行時間影響 | 尚未驗證執行；不可宣稱固定低延遲或全天串流 |

## API 之外的範圍依據

- 園區門牌：[臺北市商業處範圍說明](https://tcooc-co.gov.taipei/News_Content.aspx?n=71C48CD9E02C4FE2&s=15F2700A9201DA0C&sms=14CD04DB05B73A14)，依隊友 `config/park-boundary.json` 保存文字及解析規則。由門牌＋幾何推導的 60 公尺範圍是專案方法，不是官方交通影響邊界。
- 假日：`config/holidays.json` 的人事行政總處日曆來源；所選 21 日含 09/25、09/28、10/09 三假日。排除後 18 / 19 日。公司實際工作日不必然等於政府日曆。
- 高快速道路、匝道與跨橋完整量測：本輪 catalog 不擅自新增未查過的 API；隊友現有排名排除快速道路，此部分仍需另盤點。

## 更新與品質契約（PROPOSED）

1. 設備、Link、Section、門檻與幾何保留版本與有效日期；分鐘觀測使用同日有效映射。
2. 觀測、接收、彙整三個時間分開。定期重新盤點 VD 清單，避免 live 永遠只抓歷史快照的舊設備。
3. 以 `VDID × LinkID × 方向 × LaneID × VehicleType × DataCollectTime` 留存源頭粒度；聚合前排除重複／衝突，不補零。
4. 歷史 `ErrorDiags` 與即時 `ErrorType` 需用實際回應驗證映射；缺值、零車流、無效速度分開。
5. 收到原始資料才可生成汽機車分鐘／十五分鐘量；S/L/T 的命名需清楚，不把小型車直接稱私人通勤汽車。混合車道速度不標成機車速度。
6. 同 LinkID 選代表；不同 LinkID 也可能重複量到同一車，沿線不能加成不重複入園總量。
7. 延伸 09:30–10:30、早晚／全天需改下載篩選、時間格、rolling warmup、期望分鐘與即時顯示規則，不只是畫面多加幾格。
8. 下載依來源合約處理分頁／筆數上限、重試、配額；HTTP 成功不等於時間完整，檔案 hash 不等於感測正確。

## 車種代碼的外部格式佐證

2026-10-24 查閱[公路局 VD 動態格式說明](https://thbapp.thb.gov.tw/opendata/vd1.aspx)：M 為機車、S 小型車、L 大型車、T 聯結車；另列車道分鐘速度與車種分鐘量。此格式佐證代碼，不代表每一個 TDX 測點皆完整量測機車。

原快照 `sample.dynamic` 也有 `Vehicles[].Speed` 欄位，但單筆樣本不能證明完整時序或可用性；新版須保留原值、無車與異常代碼後再檢核，不能將 0 車的 0 速度當有效機車速度。

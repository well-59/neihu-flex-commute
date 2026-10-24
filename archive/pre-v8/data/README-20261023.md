# 收集資料

由 `collector/collect.mjs` 每分鐘抓取臺北市 VDLive / LiveTraffic，`collector/publish-data.mjs` 自動上傳。
只保留內湖範圍（緯度 25.040–25.100、經度 121.555–121.640）的資料列；全臺北原始 XML 留在收集電腦上。

| 日期 | 收到的分鐘數 | 錯誤 | 跳過 |
|---|---|---|---|
| 2026-10-22 | 226 | 0 | 0 |
| 2026-10-23 | 226 | 0 | 0 |

- `csv/YYYY-MM-DD_vd.csv.gz`：每分鐘、每支 VD、每車道一列（速度、佔有率、四種車流量）。
- `csv/YYYY-MM-DD_section.csv.gz`：每分鐘、每個路段一列（旅行時間、速度、壅塞等級）。
- `static/`：當天的 VD 位置與路段資料。

重建頁面資料：把 `csv/`、`static/` 解壓到 `data/` 底下，再執行 `node scripts/build-data.mjs`。

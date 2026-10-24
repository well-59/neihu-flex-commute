# 隊友專案整合紀錄

使用者授權：下載、檢查並整合 `https://github.com/zach0627/neihu-route-clarity`。來源版本 `ed126ccf4fb8e2d79a2cbe1047509b7540167901`，commit 時間 2026-10-23T22:32:31+08:00。clone 位於同層 `../neihu-route-clarity`，保留獨立 Git history，未修改隊友來源、commit、push 或公開部署。

## COMPLETED：本機資料與畫面整合

- 主入口仍為 `web/planner.html`。新多日證據置於三走廊比較之前，顯示車流量／E/F 低速比例 Top 10、10 個十五分鐘格、逐日相同時段比例。路段名稱、方向與測點 ID 一起呈現，避免同名道路不同測點混淆。
- 匯入 84 個方向的逐日彙整，依原計算選 30 個入園／園區內代表方向。同 LinkID 不加總沿線測點。車流為所有車種合計，並非汽車專屬。
- 快照期間 2026-09-23–10-22，22 個週一至週五日期中取得 21 日。09/24 缺失。新頁預設排除快照標示的 09/25、09/28、10/09 假日，因此使用 18 / 19 日；可取消排除並重現隊友原排名。
- 點路段／時段、日期、排序、假日開關都重新計算。顯示有效分鐘、預期分鐘、缺日與沒有官方發布路段可對照的限制。末格 09:15–09:30 明示不能判斷之後是否解除。
- 同測點 VQBUL20 東向可以跳到既有 G1 單日比較；不把不同來源的數字混合。未替其他點猜測映射。
- JSON 匯出新增 `multiDayEvidence`，含來源 commit、原始快照 SHA-256、篩選條件、排名、選取時段與逐日分母；實際政策效果維持 `null`。

## 重現方式與來源

```sh
node scripts/import-route-clarity.mjs ../neihu-route-clarity
```

此腳本只讀本機隊友 checkout 的公開 `data/dashboard.json`、`lib/ranking.mjs`、`lib/dashboard.mjs`；不讀憑證、不呼叫 API。資料輸出為 `web/data/route-clarity.json`（約 857 KB），保留必要方向、幾何、逐日值與來源紀錄，移除範本公司、單筆車種例子及重複排名。原檔雜湊記於 provenance。

`web/vendor/route-clarity/{ranking,dashboard}.js` 保留隊友的原計算，只改 import 副檔名並附來源版本註解。新增 `route-evidence-model.js` 負責一致性驗證、日期篩選及逐日格證據；`route-evidence.js` 負責現有頁面接線。沒有導入 React 或 Vite 到既有 buildless 專案。

## 查得的優點與不沿用的推論

1. **可延續**：有效分鐘分母、品質篩選、LinkID 代表點、方向／幾何判定、分時低速比例、多日與假日比較。這些比只看一天或合成移車更能定位要研究的問題。
2. **不能把最後低速格當上班時間**：`lib/flex.mjs` 的 `recommendDirection` 以最後一個過半 E/F 格的結束時間推算彈性到班。仍缺過點至公司的旅時；09:30 截止也可能是右截尾，而非實際解除。未整合這個建議公式或指定公司的要求。
3. **道路範圍有缺口**：快照排名不含市區快速道路；隊友也未納入國道。園區門牌與幾何的 60 公尺判定是專案規則，非官方認證的交通範圍。不能宣稱已完成題目三橋路或高快速道路整合。
4. **不是獨立效益驗證**：官方發布路段可使用相同 VD；依同批資料選出的五分鐘平滑窗口與官方一致度，不等於另日獨立交通效益驗證。畫面不使用該一致度背書政策。
5. **車種／時間不可補猜**：逐日快照沒有完整分車種分時量，不可由單筆 `example` 推整日汽機車比例；多日資料只到 09:30，不補零至 10:30，也不拼接舊單日數列充作同口徑多日樣本。

## 驗證與實際數字

- **PASS：隊友 78 項 Node tests。** 最初直接指定 Node 24 仍讓 hook 子程序使用系統 Node 18，兩項 hook 測試失敗；改為整個命令 PATH 使用 Node 24 後 78 項通過，未改測試或來源。
- **PASS：本專案 36 項 targeted tests。** 指令：`node --test tests/route-evidence.test.mjs tests/evidence-windows.test.cjs tests/planning.test.cjs tests/baseline-audit.test.cjs tests/road-scene.test.cjs web/evidence/tests/data-model.test.cjs`。新增覆蓋原快照數字、缺日、假日、代表點不重複、真零／缺值、右邊界、篡改格數拒算與輸入不可變。
- **PASS：Chrome 整合檢查。** `tests/planner-browser.cjs`，Node 24、既有預覽 4173／CDP 9341；排名、100 個色格、日期與假日重算、缺日空狀態、最後時格、G1 連動、匯出、既有三走廊與合成配置、1440px／390px、無 JS exception。首次測試錯把切換排序視為自動改選第一名；確認產品保留仍在 Top 10 的選取，測試改為先明確選第一列。視覺檢查另發現 grid 內容被面板裁切，修正 min-width 與手機欄寬並增加內容邊界 assertion。
- 含假日：民權東路六段東向 95,015 / 2,142 = 44.3581 輛／有效分鐘；陽光街東向 E/F 2,112 / 2,147 = 98.3698%。排除三假日後，前者 45.5783 輛／有效分鐘、後者 99.1107%。僅代表通過品質篩選的樣本，不能推成全期完整量或全內湖最塞排名。
- **UNVERIFIED / NOT RUN**：TDX 原始分鐘重新下載與逐筆稽核、隊友 React 完整 build／離線版、即時排程、09:30 後多日資料、Safari／Firefox、旅時／承接容量／實際錯峰效果。Git 下載與來源計算可用，不代表外部 API 本輪重新驗證。

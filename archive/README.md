# 歷史材料索引

目前版本請見 [3D 儀表板](../web/traffic-island.html) 與 [專案說明](../README.md)。本目錄保存過程，不代表最新資料、設計或驗證結論。

## 2026-10-24 歸檔（pre-v8）

整理前完整版本保存在自己 repo 的 [b398fdd](https://github.com/well-59/neihu-flex-commute/commit/b398fddf491006649559bc7eae9e0beb13bf1a85)。[移動清單](FILE-MAP-20261024.json) 記錄原路徑、新路徑與原始 SHA-256；為維持引用，相對連結及少數共享相依路徑已調整，Git 保存原始版本。

| 類別 | 位置與用途 |
|---|---|
| 完整改版紀錄 | [原 README](pre-v8/docs/README-before-cleanup.md)，保留當時敘述、證據與未驗證狀態 |
| 舊概念／整合 | [DESIGN](pre-v8/docs/DESIGN.md)、[INTEGRATION](pre-v8/docs/INTEGRATION.md) |
| 過程需求／審查 | [需求盤點](pre-v8/docs/DASHBOARD-REQUIREMENTS-20261024.md)、[Claude 審查](pre-v8/docs/CLAUDE-REVIEW-20261024.md) |
| 舊首頁與 UI | [原版試算](../web/archive/pre-v8/index.html)、[晨峰共議頁](../web/archive/pre-v8/observatory.html)、[協商實驗室](../web/archive/pre-v8/negotiation.html) |
| 歷史測試 | `pre-v8/tests/`：不列入現行主測試；瀏覽器測試保存原版本前提，若需重現應在保存點的獨立 checkout 執行 |
| 樣本產生器 | `pre-v8/scripts/make-sample-data.mjs`：只保存歷史工具；不要用它覆寫目前實測快照 |

舊 UI 放在 `web/archive/pre-v8/`，是為了讓本機預覽仍能開啟；它們共用現行保留的歷史快照、樣式或診斷模型，不是完全凍結的獨立部署。完整凍結版本請使用上述 Git 保存點。

仍可單獨執行的歷史模型測試：

```sh
node --test archive/pre-v8/tests/observatory.test.cjs
```

## 更早的準備材料（原樣保留）

- [討論歷史](discussion-history.md)：10/17 起的接續紀錄，不代表現在已採納。
- [行前準備](preparation-brief-20261019.html)、[參考 Dashboard](reference-dashboard-20261019.html)。
- [demo-v1](demo-v1/README.md)：早期導覽原型與過時樣本。
- [收斂前單檔](neihu-dashboard-before-focus.html)、`preview.png`、`comparison-preview.png`。

目前仍使用的官方調查、原始 XLSX 與重建工具保留在 [web/evidence](../web/evidence/README.md)，不因資料年份較舊而移走。

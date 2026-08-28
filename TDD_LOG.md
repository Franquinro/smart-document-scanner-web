# TDD 執行紀錄

本檔只記錄實際執行的命令與結果，不以推測輸出代替。

## RED — 2026-08-28

命令：`npm test`

結果：**預期失敗**（exit code 1）。Node 測試載入 `tests/geometry.test.js` 後回報 `ERR_MODULE_NOT_FOUND`，因為測試所要求的 `geometry.js` 尚未實作。TAP 摘要：tests 1、pass 0、fail 1；duration 193.2396 ms。

## 邊界規則 RED — 2026-08-28

在加入保守邊界需求後，先修改測試再執行 `npm test`。結果：**預期失敗**（exit code 1）；`high-confidence color mask still requires manual adjustment when multiple corners touch edges` 的 actual 為 `false`、expected 為 `true`。TAP 摘要：tests 11、pass 10、fail 1；duration 249.9124 ms。

## GREEN — 2026-08-28

命令：`npm test`

結果：**通過**（exit code 0）。TAP 摘要：tests 11、pass 11、fail 0；duration 286.934 ms。此輪已包含高信心色彩候選的多角點邊界保守規則，以及單一角點／單一邊的允許條件。

## 真實照片候選規則 RED → GREEN — 2026-08-28

真實照片顯示內部黑框的 Canny 分數可能高於紙張色彩候選，因此先新增「較大且可信的 LAB 紙張候選優先於較小內框」測試。第一次 `npm test` 預期失敗（exit code 1），原因為 `chooseDetectionCandidate` 尚未提供；TAP：tests 1、pass 0、fail 1。實作後完整測試通過。

## 最終驗證 — 2026-08-28

- `npm test`：exit code 0；tests 13、pass 13、fail 0；duration 383.2525 ms。
- `node --check app.js && node --check scanner.js && node --check geometry.js`：exit code 0，無語法錯誤。
- `python -m http.server 4173 --bind 127.0.0.1` 後以 curl 讀取首頁：HTTP 200、`text/html`、3364 bytes。
- 實際瀏覽器：OpenCV 顯示「已就緒」。兩張本機 fixture 均完成偵測、透視與增強；輸入皆為 1108×1477，輸出分別為 1107×1405 與 1107×1408。兩張均選用 `lab-paper-mask` 且因紙角／多邊接觸被誠實標示 `needsManual=true`（信心 75% 與 98%）。
- fixture 數量 2；`.gitignore` 包含 `tests/fixtures/real/`，且專案未建立 `.git` 目錄，故照片不可能處於 git tracked 狀態。

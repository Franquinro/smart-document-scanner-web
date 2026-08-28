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

## 效能優化 RED → GREEN — 2026-08-28

依序先加入行為測試並確認預期失敗，再做最小實作：

- 預覽解析度限制：RED 為找不到 `performance.js`。
- RAF pointermove 合併：RED 為缺少 `createRafCoalescer`。
- 200ms 拉桿 debounce：RED 為缺少 `createDebouncedTask`。
- generation gate：RED 為缺少 `createGenerationGate`。
- 透視基底快取：RED 為缺少 `getCachedValue`。
- 原始解析度匯出：RED 為缺少 `getExportMaxDimension`。
- LAB 向量化：RED 成功抓到原本透過 `ucharPtr` 逐像素執行的雙層迴圈。
- RAF 取消：RED 為 `schedule.cancel is not a function`。

第一輪完整 GREEN：`npm test` exit code 0；tests 21、pass 21、fail 0；duration 211.7606 ms。

## 效能優化最終驗證 — 2026-08-28

- `npm test`：exit code 0；tests 21、pass 21、fail 0；duration 185.0278 ms。
- `node --check app.js`、`scanner.js`、`geometry.js`、`performance.js`：全部 exit code 0。
- `git diff --check`：通過，僅有 Git 的 LF→CRLF 提示，無 whitespace error。
- 真實文件照片仍由 `.gitignore:5:tests/fixtures/real/` 排除；`git ls-files 'tests/fixtures/real/*'` 為空。
- 本機 HTTP：首頁與 `performance.js` 均回應 200。

優化後真實瀏覽器結果（同一台電腦、相同兩張 1108×1477 圖片）：

| 操作 | 優化後 |
|---|---:|
| 圖片 1：加入＋偵測＋預覽 | 1300.0 ms |
| 圖片 2：加入＋偵測＋預覽 | 631.2 ms |
| 圖片 2：重新自動偵測＋預覽 | 618.4 ms |
| 12 次拖角事件合併至最終預覽 | 234.8 ms；預覽寫回 1 次 |
| 12 次拉桿 input 合併至預覽 | 422.4 ms；預覽寫回 1 次 |
| 兩頁 300 DPI PDF 產生 | 1023.1 ms；2 頁、926086 bytes |

- 一般預覽實測為 755～756 × 960 px，不再產生 2600px 互動預覽。
- JPG 以 1107×1405 原始處理尺寸產生，不是下載 756×960 的互動預覽；實測 520.9 ms。
- PDF 兩頁皆以 1107×1405 處理，`jsPDF` 產生 2 頁、926086-byte ArrayBuffer。
- 圖片 1：`lab-paper-mask`、信心 75%、正確標示需手動調整。
- 圖片 2：`lab-paper-mask`、信心 98%、正確標示需手動調整；拖角後切換為手動幾何。
- 操作完成後 `busy.hidden === true`，錯誤提示為空，OpenCV 顯示「OpenCV 已就緒」。

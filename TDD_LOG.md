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

## 三頁 PDF 反推角點回歸 RED → GREEN — 2026-08-31

使用者提供三張原圖與其三頁 PDF 成品。PDF 無文字層，因此將每頁轉為影像，以 SIFT 特徵與 RANSAC homography 從成品頁面四角反推原圖正確 TL/TR/BR/BL。三頁分別取得 1504／138／1562 個 RANSAC inliers，中位重投影誤差 0.4135／0.4727／0.3807 px，足以作為本機真實回歸基準；原圖、PDF、渲染頁及診斷輸出全部置於被忽略的 `tests/fixtures/real/`。

根因不是四邊形評分本身，而是先前把「中性亮紙遮罩」與「背景色差遮罩」直接 OR 後才做 closing。第二張紅桌照片的亮背景雜點因此與紙張相連，錯把左下角拉到影像邊界；只調大 opening 核心會讓第三張幾乎滿版、邊緣破損的文件完全失去候選。

RED／GREEN 實際結果：

- 初始真實瀏覽器回歸：第 1／2／3 頁平均角點誤差為 0.74／24.67／2.23 px；第 2 頁失敗。
- `npm test` 首次新增形態學策略測試：exit code 1，`geometry.paperMaskMorphology is not a function`；tests 22、pass 21、fail 1。
- 兩輪單純放大 opening 的真實瀏覽器測試仍失敗，並確認過度 opening 會使第 3 頁退回 `fallback-inset`，因此停止門檻微調並改為分離遮罩架構。
- 分離 LAB 中性紙張與背景色差候選後，真實瀏覽器 GREEN：第 1／2／3 頁平均角點誤差 1.41／2.01／2.23 px，全部低於 5 px 門檻。
- 新版三頁輸出尺寸為 1107×1404、1049×1375、1257×1302；視覺檢查確認紙邊與 PDF 成品一致，沒有把內部表格黑框誤作紙張外框。
- 完整 `npm test`：tests 22、pass 22、fail 0；`scanner.js`、`geometry.js` 語法檢查通過；實際瀏覽器 console 0 error。

## 手機連續拍攝與預覽導覽 RED → GREEN — 2026-09-01

- 先建立 `tests/mobile-workflow.test.js`，執行 `node --test tests/mobile-workflow.test.js` 得到預期 RED：`ERR_MODULE_NOT_FOUND`，因為 `mobile-workflow.js` 尚不存在；tests 1、pass 0、fail 1。
- 最小實作檔名清理、連續拍攝流水號、手機匯入後是否開啟編輯器，以及 File System Access API 選擇邏輯後，同一命令 GREEN：tests 4、pass 4、fail 0。
- 完整 `npm test`：tests 26、pass 26、fail 0；`app.js`、`mobile-workflow.js` 語法檢查與 `git diff --check` 通過。
- 真實瀏覽器以 390px iframe 驗證：加入照片後顯示處理完成的 JPEG data URL 預覽、編輯器維持關閉；點預覽後才顯示四角編輯器、檔名與偵測信心。鉛筆改名同步更新標題與列表，非法 `:` 轉為 `_`。
- 以模擬 `showSaveFilePicker()` 驗證匯出：建議檔名 `測試_文件.pdf`，實際寫入一次 `application/pdf` Blob 並關閉 writable；無錯誤且 busy 正常復原。

## 中斷後可靠性修正 RED → GREEN — 2026-09-01

- 先新增匯出頁序列一致性與 `FileSystemWritableFileStream` 成功／失敗清理測試，再執行 `node --test tests/mobile-workflow.test.js`。結果為預期 RED（exit code 1）：`mobile-workflow.js` 尚未匯出 `isPageSequenceCurrent`，tests 1、pass 0、fail 1；duration 118.1591 ms。
- 最小實作後，同一命令 GREEN（exit code 0）：tests 8、pass 8、fail 0；duration 120.2989 ms。成功路徑依序 `write`、`close`；`write` 或 `close` 失敗時會等待 `abort`、不重試 `close`，且保留原始錯誤。
- `app.js` 以頁面 ID 順序與不可變的角點／設定快照產生 PDF；匯出期間停用或攔截加入、選頁、排序、刪除、旋轉、拖角、改名及影像設定，並取消過期選頁／預覽 generation。
- 相機關閉改為先對仍開啟的 `<dialog>` 呼叫 `close()`，再停止媒體 tracks；單張拍攝只有在 `addFiles()` 回報成功加入後才增加流水號。逐檔匯入個別清理由批次內層 `try/catch` 處理，失敗檔案的 object URL 與 bitmap 會釋放，其餘檔案繼續處理。
- 最終完整 `npm test`：exit code 0；tests 30、pass 30、fail 0；最後一次重跑 duration 256.686 ms。`app.js`、`scanner.js`、`geometry.js`、`performance.js`、`mobile-workflow.js` 的 `node --check` 全部通過；staged 與 unstaged 的 `git diff --check` 均無 whitespace error。

## 相機開啟取消 generation 競態 RED → GREEN — 2026-09-01

- RED 命令：`node --test tests/mobile-workflow.test.js`。結果為預期失敗（exit code 1）：`SyntaxError: The requested module '../mobile-workflow.js' does not provide an export named 'createCameraOpenGate'`；tests 1、pass 0、fail 1；duration 102.2107 ms。
- GREEN 命令：`node --test tests/mobile-workflow.test.js`。結果成功（exit code 0）：tests 9、pass 9、fail 0；duration 185.631 ms。新增測試確認新 generation 會使舊 token 失效、`cancel()` 會使 pending token 失效，且 exporting 時不得採用已取得的 stream。
- 最終 GREEN：`npm test` 成功（exit code 0）：tests 31、pass 31、fail 0；duration 319.3681 ms。`node --check app.js` 與 `node --check mobile-workflow.js` 均為 exit code 0。

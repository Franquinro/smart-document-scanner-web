# 頁淨・智慧文件掃描器

可直接部署到 GitHub Pages 等靜態主機的純前端智慧文件掃描器。照片透過 File API 載入，所有偵測、透視、調整與 PDF 編碼都在使用者的瀏覽器記憶體中完成，**不會上傳照片**，也沒有後端或分析服務。

## 功能

- 拖放或多選 JPG / PNG / WebP；縮圖選取、拖曳排序、上移／下移、旋轉與刪除。
- OpenCV.js 多候選文件偵測：
  - 固定亮／低色偏紙張遮罩；
  - 影像邊框 LAB 中位數取樣與背景色差遮罩；
  - 兩種 LAB 證據分開做 opening／closing 和輪廓候選，避免亮桌面雜點把紙張黏到影像邊界；
  - 兩組弱 Canny（28/95、55/165）；
  - 每種訊號取多個輪廓，以五種 `epsilon` 近似四邊形；
  - 依覆蓋率、凸性、角度、對邊一致性、角點分離、邊緣支援與邊界接觸評分。
- 回傳並顯示 `corners`、`confidence`、`method`、`needsManual`；低信心不會假裝成功。
- 原圖座標透明四角控制環、連線及 32px 多點命中範圍，拖曳即時更新透視預覽。
- 彩色／灰階／文件黑白、灰度、亮度、對比、飽和度、色溫、降噪、銳化、白紙去灰及重設。
- 單頁 JPG；多頁 PDF、檔名與 150 / 300 / 600 DPI。
- OpenCV 載入、處理中與錯誤狀態；OpenCV `Mat` 統一以 `try/finally` 釋放。
- 效能保護：互動預覽限制為桌面 960px／手機 640px，拖角採 640px／480px 快速預覽；pointermove 以 RAF 合併、拉桿以 200ms debounce 合併，並使用 generation gate 與透視／增強快取避免過期或重複運算。
- JPG／PDF 匯出會重新使用原始來源解析度處理，不會直接輸出低解析度互動預覽。
- 響應式繁體中文桌面／手機介面。
- 手機可在 HTTPS 網站內開啟後鏡頭連續拍攝；每張照片會立即自動偵測、透視與增強，先顯示完成預覽，點預覽圖才開啟四角編輯器。不支援 `getUserMedia()` 時改用系統相機選取器。
- 編輯器頂部顯示目前頁面檔名，鉛筆按鈕可重新命名；非法檔名字元會自動替換。
- Chromium 類瀏覽器會在匯出 PDF 前開啟原生儲存位置選擇器；不支援 File System Access API 的 iOS Safari、Firefox 等瀏覽器，保留標準下載／分享面板。

## 邊界安全限制

文件角落靠近影像邊界時，紙張可能其實延伸到畫面之外。為避免高信心色彩遮罩誤裁，本專案採保守規則：

- **兩個以上角點貼近邊界，一律標示「需手動調整」**。
- 候選同時接觸兩條相鄰邊，或接觸三條以上影像邊，一律需要手動確認。
- 只有單一角點輕觸單一邊、其他幾何良好，且 LAB／紙張遮罩信心至少 0.86 時，才可能接受自動結果。

這是刻意的安全取捨；照片沒有拍到的紙角無法由傳統影像處理可靠還原。使用者應拖曳透明控制環至可見的實際紙角。

## 本機執行

瀏覽器的 ES module 需要 HTTP 來源，請勿直接以 `file://` 開啟：

```bash
npm run serve
# 開啟 http://localhost:4173
```

也可使用任一靜態伺服器。OpenCV.js 與 jsPDF 預設由 CDN 載入；首次使用需要網路。若需完全離線，可下載兩個庫並將 `index.html` 的 `<script src>` 改成本機相對路徑。

## 測試

```bash
npm test
```

使用 Node 內建 `node:test`，不需安裝測試依賴。31 項測試涵蓋點排序、面積、四邊形 metrics／score、低信心與邊界接觸規則、輸出尺寸與縮放、紙張遮罩形態學、預覽尺寸、RAF／debounce 合併、generation gate、快取、原始解析度匯出、LAB 遮罩向量化、手機預覽導覽、連續拍攝檔名、相機開啟取消 gate、PDF 儲存方式選擇、匯出頁序列鎖定，以及 writable 成功／失敗清理。實際 RED / GREEN 命令與輸出摘要見 [`TDD_LOG.md`](TDD_LOG.md)。

## 靜態部署

整個資料夾即為靜態站根目錄，入口是 `index.html`，不需要建置。原始碼發布於 [powertalk1-glitch/smart-document-scanner-web](https://github.com/powertalk1-glitch/smart-document-scanner-web)，正式網站為 [GitHub Pages](https://powertalk1-glitch.github.io/smart-document-scanner-web/)。網站需允許連線至 `docs.opencv.org` 與 `cdn.jsdelivr.net` 以載入 OpenCV.js 和 jsPDF。

## 真實照片與隱私

人工驗證照片只可置於 `tests/fixtures/real/`。此路徑已由 `.gitignore` 排除，請勿提交含個資的原始照片。發布前仍應用 `git status` 再確認。

## 已知限制

- 傳統輪廓偵測可能受反光、紙張與背景同色、遮擋或紙角出框影響；介面會在不可靠時要求手動調整。
- 600 DPI 多頁輸出需要較多瀏覽器記憶體，行動裝置建議使用 150 或 300 DPI。
- PDF 是影像型 PDF，未包含 OCR 文字層。
- 純網頁無法強制所有瀏覽器開放任意資料夾。支援 `showSaveFilePicker()` 的安全來源可選擇檔名與位置；其他瀏覽器由作業系統的下載或分享機制決定位置。

## 授權

MIT，見 [`LICENSE`](LICENSE)。OpenCV.js 與 jsPDF 依各自授權由 CDN 提供。

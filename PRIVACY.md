# OnePixelOkGoGo — Privacy Policy
Last updated: 2026-04-30

## English

OnePixelOkGoGo ("the extension") is a pixel-perfect design overlay tool that
runs entirely in the user's browser.

### What we collect
**Nothing.** The extension does not collect, transmit, sell, or share any
personal data. We do not use analytics, telemetry, tracking, or any kind of
remote logging.

### What is stored locally
The following data is stored ONLY on the user's own device via
`chrome.storage.local` (or `chrome.storage.session` where applicable):
- User-provided design mockup images (as base64 dataURL)
- Layer settings: position, scale, opacity, lock/visibility state
- Guide settings: position, axis, color, style, lock/visibility state

This data never leaves the user's device. It is scoped per browser tab and
is removed when the user clears extension data via Chrome settings.

### Permissions explained
- `activeTab` — inject the floating panel and overlay only on the currently
  active tab when the user clicks the toolbar icon.
- `storage` / `unlimitedStorage` — persist layers and guides locally so they
  survive page reloads.
- `clipboardRead` — let the user paste a screenshot from their clipboard as
  a new layer, only when they trigger paste action explicitly.
- `<all_urls>` host access — required to render the overlay on any web page
  the user wants to compare against. No page content is read or transmitted.

### Third parties
We do not share data with anyone. There is no backend server. There is no
external service.

### Contact
For questions or issues, please open an issue on the project's GitHub
repository.

---

## 繁體中文

OnePixelOkGoGo（「本擴充功能」）是一款 pixel-perfect 設計稿對位工具，
完全在使用者瀏覽器本機運作。

### 我們收集什麼
**沒有。** 本擴充功能不收集、不傳送、不販售、不分享任何個人資料。
我們不使用 analytics、telemetry、tracking 或任何形式的遠端紀錄。

### 本機儲存的內容
以下資料**僅**儲存在使用者自己的裝置上（透過 `chrome.storage.local`）：
- 使用者上傳的設計稿圖片（base64 dataURL 格式）
- 圖層設定：位置、縮放、透明度、鎖定 / 顯示狀態
- 輔助線設定：位置、方向、顏色、樣式、鎖定 / 顯示狀態

這些資料絕不會離開使用者裝置。資料以分頁為單位儲存，使用者可從 Chrome
設定中清除擴充功能資料。

### 權限說明
- `activeTab`：使用者點擊工具列圖示時，僅於當前分頁注入浮動面板與疊圖。
- `storage` / `unlimitedStorage`：將圖層與輔助線儲存在本機，重新載入後仍保留。
- `clipboardRead`：使用者主動按「Paste」或執行 ⌘V/Ctrl+V 時讀取剪貼簿圖片，
  不會在背景持續監聽。
- `<all_urls>` 網站存取：為了在任何網頁上渲染疊圖以供視覺比對。
  我們不讀取網頁內容、不傳送任何資料。

### 第三方
我們不與任何第三方分享資料。沒有後端伺服器，沒有外部服務。

### 聯絡方式
如有問題，請至本專案 GitHub repository 開 issue。

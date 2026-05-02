# OnePixelOkGoGo

> one-pixel-ok-gogo overlay & smart guides — right inside your browser.

[English](README-en.md) · [繁體中文](README-zh-TW.md) · [日本語](README-ja.md) · [Français](README-fr.md)

> 把設計稿圖直接疊在網頁上，用眼睛、用拖曳、用方向鍵對到完全一致。

![Hero](../screenshots/hero.png)

---

## 為什麼要用？

切版時最常聽到設計師說「再差 2px」「間距不對」「字體偏了一點」。
這個工具讓你把設計稿圖直接疊到網頁上，**用眼睛、用拖曳、用方向鍵**對到完全一致為止。

| 痛點 | 解法 |
|------|------|
| Figma 跟瀏覽器來回切，肉眼比對 | **半透明圖層直接疊在網頁上** |
| 不知道間距是不是 8 的倍數 | **拖兩條輔助線，自動算間距** |
| 多個區塊要對位，一個一個切換很煩 | **多圖層、可獨立顯示/鎖定** |
| 縮放 / 移動圖層要打開 Figma | **快捷鍵 1px / 10px 微調** |

## 主要功能

### 1. 圖層（Layers）疊圖

![Layers](../screenshots/layers.png)

- 上傳 / 貼上 / 拖入圖檔（單次最多 50 張）
- 透明度、縮放、X/Y 座標即時調整
- **5 方位定位**：上下左右中，一鍵對齊到目前視窗
- **拖曳 + 方向鍵** 微調（1px / Shift+10px）
- 個別圖層 **顯示 / 鎖定 / 刪除**

### 2. 輔助線（Guides）標距

![Guides](../screenshots/guides.png)

- 一鍵新增 **水平 / 垂直** 輔助線
- **直接拖曳** 線條調整位置
- **同方向多條線時自動標示間距**（↕ 80px / ↔ 120px）
- 全域樣式：粗度 / 樣式（虛線、實線、點線、雙線）/ 顏色
- **Show / Lock** 切換顯示與鎖定，避免誤動

### 3. 浮動面板

![Panel](../screenshots/panel.png)

- 注入網頁的 **可拖曳側邊面板**
- 切換 **Layers / Guides** 兩個 tab
- 不擋住操作：可以移到任意位置

## 快捷鍵

| 鍵 | 動作 |
|----|------|
| **⌥⌘S / Alt+Ctrl+S**（在 Guides tab）| 切換輔助線顯示 |
| **⌥⌘C / Alt+Ctrl+C**（在 Guides tab）| 切換輔助線鎖定 |
| **⌥S / Alt+S** | 切換目前圖層顯示 |
| **⌥C / Alt+C** | 切換目前圖層鎖定 |
| **↑ ↓ ← →** | 圖層位移 1px |
| **Shift + ↑↓←→** | 圖層位移 10px |

## 安裝

> 已在 Chrome Web Store 上架 — 一鍵安裝：

[**OnePixelOkGoGo — Chrome Web Store**](https://chromewebstore.google.com/detail/onepixelokgogo/mgojihpngfjnhidaeoeedjbkcegddcdc)

或者用「載入未封裝項目」方式安裝：

1. 把整個 repo 下載 / clone 到本機
2. 開 Chrome → 網址列輸入 `chrome://extensions`
3. 右上角開啟「**開發人員模式**」
4. 點「**載入未封裝項目**」→ 選擇本專案資料夾
5. 釘選圖示到工具列即可

## 快速上手

1. 點工具列的 **OnePixelOkGoGo 圖示** → 浮動面板出現在頁面右上
2. 在 **Layers** tab 把設計稿圖貼上 / 拖入
3. 透明度拉到 50%，按 ↑↓←→ 對齊到網頁
4. 切到 **Guides** tab，按「+ Horizontal」新增水平線，拖到要量的位置
5. 再加一條，**自動顯示兩條線之間的間距**

![Quickstart](../screenshots/quickstart.gif)

## 適合誰用

- **前端工程師**：切版對稿、locale 對齊、RWD 微調
- **UI/UX 設計師**：驗收頁面是否符合設計
- **QA**：截圖比對、視覺回歸 bug 重現
- **內容編輯**：確認排版、margin 是否一致

## 路況圖

- [ ] 多輔助線群組（命名 / 切換）
- [ ] 匯出 / 匯入輔助線設定
- [ ] 鎖定圖層長寬比
- [ ] 對齊輔助線（snap to guide）
- [x] 上架 Chrome Web Store

## 贊助 / 支持

如果這個工具有幫到你，請我喝杯咖啡 🙏

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/P5P01YOURH)

## 反饋

歡迎 issue、PR、或私訊作者。

---

[← 回上一頁](README.md)
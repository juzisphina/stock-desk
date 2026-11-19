# Stock Desk 盯盤台

免費的美股看盤網站，放在 GitHub Pages 上，不需要自己的伺服器。

**功能**

| 功能 | 怎麼實現 | 更新方式 |
|---|---|---|
| 全美股代號搜尋（Ctrl/⌘ + K） | `data/symbols.json`（約 1.2 萬隻美股和 ETF） | 每天自動更新 |
| 專業 K 線圖 + RSI + MACD | TradingView 免費嵌入元件 | 即時（部分行情延遲 15 分鐘） |
| 技術分析儀表板、即時報價、漲跌榜、財報資料 | TradingView 元件 | 即時 |
| 全市場類股熱力圖（標普 / 納指 / 道指 / 全美股） | TradingView 元件 | 即時 |
| 個股新聞 + 市場頭條 | TradingView 元件 | 即時 |
| 自選股 | 儲存在瀏覽器裡；可「同步到日報」 | 手動 |
| **AI 日報**：每隻自選股的新聞情緒、RSI/MACD 訊號、風險提示 | GitHub Actions + Google Gemini | 工作日台灣時間 12:00 自動，或手動執行 |
| 日報發到信箱 | GitHub Actions + Gmail | 跟日報一起 |

## 第一次設定（約 10 分鐘，都在 GitHub 網頁上點）

### 1. 開啟 AI（Gemini，免費）
1. 開啟 <https://aistudio.google.com/apikey>，用 Google 帳號登入，點 **Create API key**，複製。
2. 在 GitHub 開啟這個儲存庫 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `GEMINI_API_KEY`  Value: 剛才複製的 key（有多把就用英文逗號隔開）

不設定也能用：日報裡只有行情和新聞，沒有 AI 點評。

### 2. 讓日報發到信箱（可選）
1. 用一個 Gmail 帳號，先開啟「兩步驗證」，然後開啟 <https://myaccount.google.com/apppasswords> 產生一個「應用程式密碼」（16 位）。
2. 同樣在 Secrets 裡新增：
   - `MAIL_USERNAME`：這個 Gmail 地址
   - `MAIL_PASSWORD`：16 位應用程式密碼（不是 Gmail 登入密碼）
   - `MAIL_TO`（可選）：收件人，多個用英文逗號隔開；不填就發給自己

Secrets 是加密儲存的，別人看不到，也不會出現在網站上。

### 3. 選日報關注的股票
- 方法 A：在「我的自選」點 **＋ 新增**（或在任何股票上點 ☆ 加入自選） → 點「同步到日報」→ 在開啟的 GitHub 頁面全選、貼上、點 **Commit changes**。
- 方法 B：直接在 GitHub 上編輯 `watchlist.json`。

格式是 `交易所:代號`，例如 `NASDAQ:AAPL`、`NYSE:BRK.B`，最多 30 檔。

### 4. 馬上產生一份日報（手動更新）
儲存庫 → **Actions** → 左邊 **daily-report** → **Run workflow**。約 1 分鐘後網站「AI 日報」就會出現新的一天（網頁可能要再等 1 分鐘重新整理）。

## 網頁上的「⚙ AI 設定」（用自己的金鑰隨時點評）
1. 點股票名稱旁「🤖 AI 點評」右邊的 **⚙** → 輸入密碼 → 填 Gemini 金鑰（可以填多把，每行一把；一把的免費額度用完會自動換下一把）→ **加密儲存**。
2. 之後在任何股票上點 **🤖 AI 點評**：Gemini 會先上網搜尋這檔股票的最新新聞再點評，並附上來源連結。
3. 如果某天的日報沒有 AI 點評，日報上方會有按鈕「用我的金鑰產生這份日報的 AI 點評」。

- 金鑰用密碼加密後只存在**這台裝置的瀏覽器**裡，不會上傳；換手機或電腦要重新填一次。
- 這裡的金鑰只給網頁用。每天中午的自動日報和寄信，用的是 GitHub Secrets 裡的 `GEMINI_API_KEY`（也可以填多把，用英文逗號隔開）。
- 模型選「自動」就好：新申請的金鑰只能用新模型，舊金鑰常常只有舊模型的免費額度，網站會自動找能用的那個。

## 換時間
改 `.github/workflows/daily-report.yml` 裡的 `cron: '0 4 * * 1-5'`（這是 UTC 時間，`0 4` = 台灣 12:00；週一到週五）。
GitHub 的定時任務可能晚幾分鐘；儲存庫 60 天沒有任何提交時 GitHub 會暫停定時任務（每天的日報提交會讓它保持執行）。

## 換 AI 模型
Settings → Secrets and variables → Actions → **Variables** → 新增 `GEMINI_MODEL`（預設 `auto`：自動依序試 gemini-flash-latest、gemini-3.8-flash、gemini-2.5-flash…）。

## 注意
- 儲存庫是公開的（免費 GitHub Pages 需要），所以產生的日報內容別人也能看到；金鑰和信箱都在 Secrets 裡，不公開。
- 所有內容僅供參考，不構成投資建議。

## 開發
```bash
npm run check     # 語法檢查 + 單元測試（無依賴）
npm run report    # 本地產生日報（可設 GEMINI_API_KEY）
npm run symbols   # 更新股票代號表
```

> 改了 `style.css` / `zh.js` / `app.js` / `ai.js` 後，請把 `index.html` 裡這些檔名後面的 `?v=` 數字改新（例如日期時間），瀏覽器才會馬上抓新版本。

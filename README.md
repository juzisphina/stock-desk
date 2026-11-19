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
   - Name: `GEMINI_API_KEY`  Value: 剛才複製的 key

不設定也能用：日報裡只有行情和新聞，沒有 AI 點評。

### 2. 讓日報發到信箱（可選）
1. 用一個 Gmail 帳號，先開啟「兩步驗證」，然後開啟 <https://myaccount.google.com/apppasswords> 產生一個「應用程式密碼」（16 位）。
2. 同樣在 Secrets 裡新增：
   - `MAIL_USERNAME`：這個 Gmail 地址
   - `MAIL_PASSWORD`：16 位應用程式密碼（不是 Gmail 登入密碼）
   - `MAIL_TO`（可選）：收件人，多個用英文逗號隔開；不填就發給自己

Secrets 是加密儲存的，別人看不到，也不會出現在網站上。

### 3. 選日報關注的股票
- 方法 A：網站上點 ☆ 加自選 → 點「同步到日報」→ 在開啟的 GitHub 頁面全選、貼上、點 **Commit changes**。
- 方法 B：直接在 GitHub 上編輯 `watchlist.json`。

格式是 `交易所:代號`，例如 `NASDAQ:AAPL`、`NYSE:BRK.B`，最多 30 檔。

### 4. 馬上產生一份日報（手動更新）
儲存庫 → **Actions** → 左邊 **daily-report** → **Run workflow**。約 1 分鐘後網站「AI 日報」就會出現新的一天（網頁可能要再等 1 分鐘重新整理）。

## 換時間
改 `.github/workflows/daily-report.yml` 裡的 `cron: '0 4 * * 1-5'`（這是 UTC 時間，`0 4` = 台灣 12:00；週一到週五）。
GitHub 的定時任務可能晚幾分鐘；儲存庫 60 天沒有任何提交時 GitHub 會暫停定時任務（每天的日報提交會讓它保持執行）。

## 換 AI 模型
Settings → Secrets and variables → Actions → **Variables** → 新增 `GEMINI_MODEL`（預設 `gemini-2.5-flash`）。

## 注意
- 儲存庫是公開的（免費 GitHub Pages 需要），所以產生的日報內容別人也能看到；金鑰和信箱都在 Secrets 裡，不公開。
- 所有內容僅供參考，不構成投資建議。

## 開發
```bash
npm run check     # 語法檢查 + 單元測試（無依賴）
npm run report    # 本地產生日報（可設 GEMINI_API_KEY）
npm run symbols   # 更新股票代號表
```

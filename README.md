# Stock Desk 盯盘台

免费的美股看盘网站，放在 GitHub Pages 上，不需要自己的服务器。

**功能**

| 功能 | 怎么实现 | 更新方式 |
|---|---|---|
| 全美股代码搜索（Ctrl/⌘ + K） | `data/symbols.json`（约 1.2 万只美股和 ETF） | 每天自动刷新 |
| 专业 K 线图 + RSI + MACD | TradingView 免费嵌入组件 | 实时（部分行情延迟 15 分钟） |
| 技术分析仪表盘、实时报价、涨跌榜、财报数据 | TradingView 组件 | 实时 |
| 全市场板块热力图（标普 / 纳指 / 道指 / 全美股） | TradingView 组件 | 实时 |
| 个股新闻 + 市场头条 | TradingView 组件 | 实时 |
| 自选股 | 保存在浏览器里；可「同步到日报」 | 手动 |
| **AI 日报**：每只自选股的新闻情绪、RSI/MACD 信号、风险提示 | GitHub Actions + Google Gemini | 工作日北京时间 12:00 自动，或手动运行 |
| 日报发到邮箱 | GitHub Actions + Gmail | 跟日报一起 |

## 第一次设置（约 10 分钟，都在 GitHub 网页上点）

### 1. 打开 AI（Gemini，免费）
1. 打开 <https://aistudio.google.com/apikey>，用 Google 账号登录，点 **Create API key**，复制。
2. 在 GitHub 打开这个仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**
   - Name: `GEMINI_API_KEY`  Value: 刚才复制的 key

不设置也能用：日报里只有行情和新闻，没有 AI 点评。

### 2. 让日报发到邮箱（可选）
1. 用一个 Gmail 账号，先开启「两步验证」，然后打开 <https://myaccount.google.com/apppasswords> 生成一个「应用专用密码」（16 位）。
2. 同样在 Secrets 里添加：
   - `MAIL_USERNAME`：这个 Gmail 地址
   - `MAIL_PASSWORD`：16 位应用专用密码（不是 Gmail 登录密码）
   - `MAIL_TO`（可选）：收件人，多个用英文逗号隔开；不填就发给自己

Secrets 是加密保存的，别人看不到，也不会出现在网站上。

### 3. 选日报关注的股票
- 方法 A：网站上点 ☆ 加自选 → 点「同步到日报」→ 在打开的 GitHub 页面全选、粘贴、点 **Commit changes**。
- 方法 B：直接在 GitHub 上编辑 `watchlist.json`。

格式是 `交易所:代码`，例如 `NASDAQ:AAPL`、`NYSE:BRK.B`，最多 30 只。

### 4. 马上生成一份日报（手动更新）
仓库 → **Actions** → 左边 **daily-report** → **Run workflow**。约 1 分钟后网站「AI 日报」就会出现新的一天（网页可能要再等 1 分钟刷新）。

## 换时间
改 `.github/workflows/daily-report.yml` 里的 `cron: '0 4 * * 1-5'`（这是 UTC 时间，`0 4` = 北京 12:00；周一到周五）。
GitHub 的定时任务可能晚几分钟；仓库 60 天没有任何提交时 GitHub 会暂停定时任务（每天的日报提交会让它保持运行）。

## 换 AI 模型
Settings → Secrets and variables → Actions → **Variables** → 新建 `GEMINI_MODEL`（默认 `gemini-2.5-flash`）。

## 注意
- 仓库是公开的（免费 GitHub Pages 需要），所以生成的日报内容别人也能看到；密钥和邮箱都在 Secrets 里，不公开。
- 所有内容仅供参考，不构成投资建议。

## 开发
```bash
npm run check     # 语法检查 + 单元测试（无依赖）
npm run report    # 本地生成日报（可设 GEMINI_API_KEY）
npm run symbols   # 刷新股票代码表
```

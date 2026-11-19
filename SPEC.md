# Stock Desk — SPEC

A friend's free US-stock desk, inspired by the "OpenStock" short (TradingView + AI daily report), hosted on GitHub Pages with no server.

## Constraints
- Static site only (GitHub Pages). Zero npm dependencies.
- Live data: TradingView embed widgets (client side). Scheduled data: GitHub Actions writes JSON into `data/`.
- Secrets (Gemini key, Gmail app password) only in GitHub Actions secrets.

## Acceptance
1. Search any US ticker or company name (Ctrl/⌘K, `/`), Enter loads it; unknown tickers still open via TradingView.
2. Chart with RSI + MACD, symbol info, technical gauge, symbol news, financials follow the current symbol; URL hash `#EXCH:SYM` is shareable.
3. Heatmap (S&P / NDX / DJI / all US), market news, movers, ticker tape.
4. Watchlist in localStorage (default from `watchlist.json`), quotes widget, "sync to report" opens the GitHub editor with JSON copied.
5. Workflow (weekdays 04:00 UTC + manual) builds `data/reports/<date>.json` with price, 1d/5d/1m change, RSI, MACD trend, Yahoo headlines; with `GEMINI_API_KEY` adds overview + per-stock sentiment/score/summary; commits; emails via SMTP when mail secrets exist.
6. Works at 375 px width without horizontal scroll.

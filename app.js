'use strict';
// Stock Desk — static page. Live data comes from TradingView widgets; AI reports from data/reports/*.json
// (written once a day by the GitHub Action in .github/workflows/daily-report.yml).

const LOCALE = 'zh_TW';
const THEME = 'dark';
const LS_KEY = 'stockdesk.watch.v1';
const DEFAULT_SYMBOL = 'NASDAQ:NVDA';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let current = DEFAULT_SYMBOL;
let watch = [];

/* ---------- TradingView widget helper ---------- */
function tv(el, name, config) {
  // TradingView overwrites the container's inline size, so build a fresh inner container
  // and keep the fixed height on the outer element (set in style.css).
  el.innerHTML = '<div class="tradingview-widget-container" style="height:100%;width:100%"><div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div></div>';
  const box = el.firstChild;
  const s = document.createElement('script');
  s.src = `https://s3.tradingview.com/external-embedding/embed-widget-${name}.js`;
  s.async = true;
  s.type = 'text/javascript';
  s.textContent = JSON.stringify(config);
  box.appendChild(s);
}

function normSymbol(raw) {
  const s = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
  return s;
}

/* ---------- symbol-dependent widgets ---------- */
function loadSymbol(sym, push = true) {
  current = normSymbol(sym) || DEFAULT_SYMBOL;
  $('curSym').textContent = current;
  if ($('aiOut')) $('aiOut').hidden = true;
  $('newsSym').textContent = current;
  document.title = `${current} · Stock Desk 盯盤台`;
  if (push && location.hash.slice(1) !== current) history.replaceState(null, '', '#' + current);

  tv($('info'), 'symbol-info', { symbol: current, width: '100%', locale: LOCALE, colorTheme: THEME, isTransparent: true });
  tv($('chart'), 'advanced-chart', {
    autosize: true, symbol: current, interval: 'D', timezone: 'Asia/Taipei', theme: THEME, style: '1',
    locale: LOCALE, allow_symbol_change: true, calendar: false, hide_side_toolbar: false,
    studies: ['STD;RSI', 'STD;MACD'], support_host: 'https://www.tradingview.com',
  });
  tv($('ta'), 'technical-analysis', {
    interval: '1D', width: '100%', height: '100%', isTransparent: true, symbol: current,
    showIntervalTabs: true, displayMode: 'single', locale: LOCALE, colorTheme: THEME,
  });
  tv($('newsSymW'), 'timeline', {
    feedMode: 'symbol', symbol: current, isTransparent: true, displayMode: 'regular',
    width: '100%', height: '100%', colorTheme: THEME, locale: LOCALE,
  });
  tv($('fin'), 'financials', {
    isTransparent: true, largeChartUrl: '', displayMode: 'regular', width: '100%', height: '100%',
    colorTheme: THEME, symbol: current, locale: LOCALE,
  });
  renderWatch();
}

/* ---------- static widgets ---------- */
function loadStatic() {
  tv($('tape'), 'ticker-tape', {
    symbols: [
      { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
      { proName: 'FOREXCOM:NSXUSD', title: 'Nasdaq 100' },
      { proName: 'FOREXCOM:DJI', title: 'Dow 30' },
      { proName: 'NASDAQ:NVDA', title: 'NVDA' },
      { proName: 'NASDAQ:TSLA', title: 'TSLA' },
      { proName: 'NASDAQ:AAPL', title: 'AAPL' },
      { proName: 'NASDAQ:MSFT', title: 'MSFT' },
      { proName: 'NASDAQ:GOOGL', title: 'GOOGL' },
      { proName: 'NASDAQ:AMZN', title: 'AMZN' },
      { proName: 'NASDAQ:META', title: 'META' },
      { proName: 'BITSTAMP:BTCUSD', title: 'BTC' },
    ],
    showSymbolLogo: true, isTransparent: true, displayMode: 'adaptive', colorTheme: THEME, locale: LOCALE,
  });
  loadHeat();
  tv($('newsAll'), 'timeline', {
    feedMode: 'market', market: 'stock', isTransparent: true, displayMode: 'regular',
    width: '100%', height: '100%', colorTheme: THEME, locale: LOCALE,
  });
  tv($('hot'), 'hotlists', {
    colorTheme: THEME, dateRange: '1D', exchange: 'US', showChart: true, locale: LOCALE,
    largeChartUrl: '', isTransparent: true, showSymbolLogo: true, showFloatingTooltip: false,
    width: '100%', height: '100%',
  });
}

function loadHeat() {
  tv($('heat'), 'stock-heatmap', {
    exchanges: [], dataSource: $('heatSrc').value, grouping: 'sector', blockSize: 'market_cap_basic',
    blockColor: 'change', locale: LOCALE, symbolUrl: '', colorTheme: THEME, hasTopBar: true,
    isDataSetEnabled: true, isZoomEnabled: true, hasSymbolTooltip: true, isMonoSize: false,
    width: '100%', height: '100%',
  });
}

/* ---------- watchlist (this browser) ---------- */
function saveWatch() { try { localStorage.setItem(LS_KEY, JSON.stringify(watch)); } catch {} }

async function initWatch() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (Array.isArray(saved)) { watch = saved; return; }
  } catch {}
  try {
    const r = await fetch('watchlist.json', { cache: 'no-cache' });
    const j = await r.json();
    watch = (j.symbols || []).map(normSymbol).filter(Boolean);
  } catch { watch = ['NASDAQ:NVDA', 'NASDAQ:TSLA', 'NASDAQ:AAPL']; }
}

function renderWatch() {
  const chips = $('chips');
  chips.innerHTML = watch.length ? '' : '<span class="empty">還沒有自選股，點上面的 ☆ 加入</span>';
  for (const s of watch) {
    const c = document.createElement('span');
    c.className = 'chip' + (s === current ? ' cur' : '');
    c.innerHTML = `${esc(s.split(':').pop())}<button class="x" type="button" aria-label="移除 ${esc(s)}">×</button>`;
    c.title = s;
    c.addEventListener('click', (e) => {
      if (e.target.classList.contains('x')) { watch = watch.filter((x) => x !== s); saveWatch(); renderWatch(); renderQuotes(); return; }
      loadSymbol(s); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    chips.appendChild(c);
  }
  const on = watch.includes(current);
  $('starBtn').textContent = on ? '★ 已在自選' : '☆ 加入自選';
  $('starBtn').classList.toggle('on', on);
}

let quotesKey = '';
function renderQuotes() {
  const key = watch.join(',');
  if (key === quotesKey) return;
  quotesKey = key;
  if (!watch.length) { $('quotes').innerHTML = '<p class="empty">自選為空</p>'; return; }
  tv($('quotes'), 'market-quotes', {
    width: '100%', height: '100%', symbolsGroups: [{ name: '自選 Watchlist', symbols: watch.map((s) => ({ name: s, displayName: s.split(':').pop() })) }],
    showSymbolLogo: true, isTransparent: true, colorTheme: THEME, locale: LOCALE,
  });
}

function repoInfo() {
  // username.github.io/repo/ → {owner, repo}
  const m = location.hostname.match(/^([^.]+)\.github\.io$/i);
  if (!m) return null;
  const repo = location.pathname.split('/').filter(Boolean)[0] || `${m[1]}.github.io`;
  return { owner: m[1], repo };
}

async function syncWatch() {
  const json = JSON.stringify({ symbols: watch }, null, 2) + '\n';
  try { await navigator.clipboard.writeText(json); } catch {}
  const info = repoInfo();
  if (info) {
    toast('已複製自選列表 → 在開啟的 GitHub 頁面裡全選貼上，然後點 Commit');
    window.open(`https://github.com/${info.owner}/${info.repo}/edit/main/watchlist.json`, '_blank', 'noopener');
  } else {
    toast('已複製自選列表（本地預覽時無法開啟 GitHub）');
  }
}

/* ---------- search (Ctrl/⌘ K) ---------- */
let symbols = null;
let results = [];
let sel = 0;

async function ensureSymbols() {
  if (symbols) return;
  try {
    const r = await fetch('data/symbols.json');
    symbols = (await r.json()).list;
  } catch { symbols = []; }
}

function searchSymbols(q) {
  q = q.trim().toUpperCase();
  if (!q) return [];
  if (q.includes(':')) return [[q.split(':')[1], q.split(':')[0], '直接開啟']];
  const exact = [], prefix = [], name = [];
  for (const row of symbols) {
    const [s, , n] = row;
    if (s === q) exact.push(row);
    else if (s.startsWith(q)) prefix.push(row);
    else if (q.length >= 2 && n.toUpperCase().includes(q)) name.push(row);
    if (exact.length + prefix.length + name.length > 400) break;
  }
  prefix.sort((a, b) => a[0].length - b[0].length);
  const out = [...exact, ...prefix, ...name].slice(0, 30);
  if (!exact.length && /^[A-Z.\-]{1,6}$/.test(q)) out.push([q, '', '直接用 TradingView 開啟']);
  return out;
}

function drawResults() {
  $('results').innerHTML = results.map((r, i) =>
    `<li class="${i === sel ? 'sel' : ''}" data-i="${i}"><span class="sym">${esc(r[0])}</span><span class="ex">${esc(r[1])}</span><span class="nm">${esc(r[2])}</span></li>`
  ).join('') || '<li class="empty">輸入代號或公司英文名</li>';
  const li = $('results').querySelector('.sel');
  if (li) li.scrollIntoView({ block: 'nearest' });
}

function pick(i) {
  const r = results[i];
  if (!r) return;
  closeSearch();
  loadSymbol(r[1] ? `${r[1]}:${r[0]}` : r[0]);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function openSearch() {
  $('search').hidden = false;
  $('q').value = '';
  results = []; sel = 0; drawResults();
  $('q').focus();
  await ensureSymbols();
}
function closeSearch() { $('search').hidden = true; }

/* ---------- AI report ---------- */
const pct = (v) => (v == null || !isFinite(v)) ? '–' : `<span class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`;
const SENT = { '利多': 'b-up', '偏多': 'b-up', '中性': 'b-flat', '偏空': 'b-down', '利空': 'b-down' };

async function initReports() {
  let idx;
  try { idx = await (await fetch('data/reports/index.json', { cache: 'no-cache' })).json(); } catch { idx = { dates: [] }; }
  const dates = idx.dates || [];
  if (!dates.length) { $('report').innerHTML = '<p class="empty">還沒有日報。每天中午 12 點（台灣時間）自動產生，也可以在 GitHub 的 Actions 頁面手動執行。</p>'; $('reportDate').hidden = true; return; }
  $('reportDate').innerHTML = dates.map((d) => `<option>${esc(d)}</option>`).join('');
  $('reportDate').onchange = () => showReport($('reportDate').value);
  showReport(dates[0]);
}

async function showReport(date) {
  $('report').innerHTML = '<p class="muted">載入中…</p>';
  let rep;
  try { rep = await (await fetch(`data/reports/${date}.json`, { cache: 'no-cache' })).json(); }
  catch { $('report').innerHTML = '<p class="empty">讀取失敗</p>'; return; }
  renderReport(rep);
}

function renderReport(rep) {
  const when = rep.generatedAt ? new Date(rep.generatedAt).toLocaleString('zh-TW', { hour12: false }) : '';
  let html = `<p class="meta">${esc(rep.date)} · 產生於 ${esc(when)} · ${rep.ai ? 'AI：' + esc(rep.model) : '未配置 AI（只有行情資料）'}</p>`;
  if (rep.overview) html += `<div class="overview">${esc(rep.overview)}</div>`;
  if (!rep.ai) html += '<p><button class="btn ghost" id="aiReportBtn" type="button">🤖 用我的金鑰產生這份日報的 AI 點評</button></p>';
  window.currentReport = rep;
  html += '<div class="rep-grid">';
  for (const s of rep.stocks || []) {
    const score = Math.max(0, Math.min(100, Number(s.score ?? 50)));
    const color = score >= 60 ? 'var(--green)' : score <= 40 ? 'var(--red)' : 'var(--amber)';
    html += `<article class="stock">
      <div class="stock-top"><button type="button" data-sym="${esc(s.symbol)}">${esc(s.symbol.split(':').pop())}</button>
        ${s.sentiment ? `<span class="badge ${SENT[s.sentiment] || 'b-flat'}">${esc(s.sentiment)}</span>` : ''}</div>
      ${s.error ? `<p class="empty">資料取得失敗：${esc(s.error)}</p>` : `
      <div class="nums"><span>$${s.price != null ? s.price.toFixed(2) : '–'}</span><span>1日 ${pct(s.chg1d)}</span><span>5日 ${pct(s.chg5d)}</span><span>1月 ${pct(s.chg1m)}</span></div>
      <div class="nums"><span>RSI ${s.rsi != null ? s.rsi.toFixed(1) : '–'}</span><span>MACD ${esc(s.macdTrend || '–')}</span></div>`}
      ${s.sentiment ? `<div class="bar" title="情緒分 ${score}"><i style="width:${score}%;background:${color}"></i></div>` : ''}
      ${s.summary ? `<p>${esc(s.summary)}</p>` : ''}
      ${(s.news || []).length ? `<ul>${s.news.slice(0, 4).map((n) => `<li><a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a></li>`).join('')}</ul>` : ''}
    </article>`;
  }
  html += '</div>';
  $('report').innerHTML = html;
  $('report').querySelectorAll('button[data-sym]').forEach((b) => b.onclick = () => { loadSymbol(b.dataset.sym); window.scrollTo({ top: 0, behavior: 'smooth' }); });
}

/* ---------- misc ---------- */
let toastT;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3500);
}

function bind() {
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  $('kbdHint').textContent = isMac ? '⌘ K' : 'Ctrl K';
  $('openSearch').onclick = openSearch;
  $('search').addEventListener('click', (e) => { if (e.target === $('search')) closeSearch(); });
  $('q').addEventListener('input', async () => { await ensureSymbols(); results = searchSymbols($('q').value); sel = 0; drawResults(); });
  $('q').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, results.length - 1); drawResults(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); drawResults(); e.preventDefault(); }
    else if (e.key === 'Enter') { pick(sel); e.preventDefault(); }
  });
  $('results').addEventListener('click', (e) => { const li = e.target.closest('li[data-i]'); if (li) pick(+li.dataset.i); });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    else if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openSearch(); }
    else if (e.key === 'Escape' && !$('search').hidden) closeSearch();
    else if (e.key === 'Escape' && !$('aiModal').hidden) $('aiModal').hidden = true;
  });
  $('starBtn').onclick = () => {
    watch = watch.includes(current) ? watch.filter((x) => x !== current) : [...watch, current];
    saveWatch(); renderWatch(); renderQuotes();
  };
  $('copyLink').onclick = async () => {
    try { await navigator.clipboard.writeText(location.href); toast('連結已複製'); } catch { toast(location.href); }
  };
  $('syncWatch').onclick = syncWatch;
  $('heatSrc').onchange = loadHeat;
  window.addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (h && h !== current && !h.endsWith('-sec')) loadSymbol(h, false); });
}

(async function main() {
  bind();
  await initWatch();
  const h = decodeURIComponent(location.hash.slice(1));
  loadSymbol(h && !h.endsWith('-sec') ? h : DEFAULT_SYMBOL);
  loadStatic();
  renderQuotes();
  initReports();
})();

// Pure helpers for the daily report (no network, no fs) — unit-tested in tests/lib.test.mjs.

export function toYahoo(sym) {
  return String(sym).split(':').pop().trim().toUpperCase().replace(/\./g, '-');
}

export function ema(values, n) {
  const k = 2 / (n + 1);
  const out = [];
  let prev;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

// Wilder's RSI
export function rsi(closes, n = 14) {
  if (closes.length <= n) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  gain /= n; loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  if (loss === 0) return 100;
  return 100 - 100 / (1 + gain / loss);
}

export function macd(closes, fast = 12, slow = 26, sig = 9) {
  if (closes.length < slow + sig) return null;
  const f = ema(closes, fast), s = ema(closes, slow);
  const line = f.map((v, i) => v - s[i]);
  const signal = ema(line, sig);
  const hist = line.map((v, i) => v - signal[i]);
  const last = hist.length - 1;
  return { macd: line[last], signal: signal[last], hist: hist[last], prevHist: hist[last - 1] };
}

export function macdTrend(m) {
  if (!m) return null;
  if (m.hist > 0 && m.prevHist <= 0) return '金叉';
  if (m.hist < 0 && m.prevHist >= 0) return '死叉';
  if (m.hist > 0) return m.hist > m.prevHist ? '多头增强' : '多头减弱';
  return m.hist < m.prevHist ? '空头增强' : '空头减弱';
}

const change = (a, b) => (a != null && b ? ((a - b) / b) * 100 : null);

export function summarize(closes) {
  const c = closes.filter((v) => v != null && isFinite(v));
  if (c.length < 2) return null;
  const last = c[c.length - 1];
  const m = macd(c);
  const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
  return {
    price: round(last),
    chg1d: round(change(last, c[c.length - 2])),
    chg5d: round(change(last, c[c.length - 6])),
    chg1m: round(change(last, c[c.length - 22])),
    rsi: round(rsi(c), 1),
    macdHist: round(m?.hist, 3),
    macdTrend: macdTrend(m),
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
export function decode(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&(amp|lt|gt|quot|apos|#39);/g, (_, e) => ENT[e])
    .trim();
}

export function parseRss(xml, max = 6) {
  const items = [];
  for (const m of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const get = (tag) => { const r = m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return r ? decode(r[1]) : ''; };
    const title = get('title');
    const link = get('link');
    if (!title || !/^https?:\/\//.test(link)) continue;
    const d = new Date(get('pubDate'));
    items.push({ title, link, date: isNaN(d) ? null : d.toISOString() });
    if (items.length >= max) break;
  }
  return items;
}

export function buildPrompt(stocks, date) {
  const lines = stocks.filter((s) => !s.error).map((s) => {
    const news = (s.news || []).map((n) => `    - ${n.title}`).join('\n') || '    - (无新闻)';
    return `## ${s.symbol}\n价格 ${s.price}，1日 ${s.chg1d}%，5日 ${s.chg5d}%，1月 ${s.chg1m}%，RSI ${s.rsi}，MACD ${s.macdTrend}\n最新新闻标题：\n${news}`;
  }).join('\n\n');
  return `你是一名谨慎、客观的美股分析助理。今天是 ${date}。下面是用户自选股的行情、技术指标和最新新闻标题。
请用简体中文输出 JSON（不要 markdown 代码块），格式：
{"overview":"3-5 句话总结今天整体情况和最值得注意的事","stocks":[{"symbol":"与输入完全相同的代码","sentiment":"利好|偏多|中性|偏空|利空","score":0-100 的整数（50 为中性）,"summary":"2-3 句话：新闻情绪 + 技术面要点 + 需要留意的风险"}]}
要求：只根据给出的数据判断，不编造数字；不要给买卖建议。

${lines}`;
}

const SENTS = ['利好', '偏多', '中性', '偏空', '利空'];
export function parseAi(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI 没有返回 JSON');
  const j = JSON.parse(t.slice(a, b + 1));
  const stocks = Array.isArray(j.stocks) ? j.stocks : [];
  return {
    overview: String(j.overview || ''),
    stocks: stocks.map((s) => ({
      symbol: String(s.symbol || '').toUpperCase(),
      sentiment: SENTS.includes(s.sentiment) ? s.sentiment : '中性',
      score: Math.max(0, Math.min(100, Math.round(Number(s.score) || 50))),
      summary: String(s.summary || ''),
    })),
  };
}

const escHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtPct = (v) => (v == null ? '–' : `<span style="color:${v >= 0 ? '#16a34a' : '#dc2626'}">${v >= 0 ? '+' : ''}${v.toFixed(2)}%</span>`);

export function renderEmail(rep, siteUrl = '') {
  const rows = rep.stocks.map((s) => `
    <tr><td style="padding:10px;border-bottom:1px solid #e5e7eb;vertical-align:top">
      <b style="font-family:monospace;font-size:15px">${escHtml(s.symbol)}</b>
      ${s.sentiment ? ` <span style="font-size:12px;background:#f1f5f9;border-radius:9px;padding:1px 8px">${escHtml(s.sentiment)} ${s.score ?? ''}</span>` : ''}<br>
      ${s.error ? `<span style="color:#dc2626">数据获取失败</span>` : `<span style="font-family:monospace;font-size:13px">$${s.price} · 1日 ${fmtPct(s.chg1d)} · 5日 ${fmtPct(s.chg5d)} · RSI ${s.rsi ?? '–'} · MACD ${escHtml(s.macdTrend ?? '–')}</span>`}
      ${s.summary ? `<p style="margin:6px 0">${escHtml(s.summary)}</p>` : ''}
      ${(s.news || []).slice(0, 3).map((n) => `<div style="font-size:13px">· <a href="${escHtml(n.link)}">${escHtml(n.title)}</a></div>`).join('')}
    </td></tr>`).join('');
  return `<!doctype html><html><body style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#111;max-width:680px;margin:auto">
  <h2>📈 自选股 AI 日报 · ${escHtml(rep.date)}</h2>
  ${rep.overview ? `<p style="background:#f0fdf4;border-left:3px solid #16a34a;padding:10px 12px;white-space:pre-wrap">${escHtml(rep.overview)}</p>` : '<p>（未配置 Gemini，只有行情数据）</p>'}
  <table style="width:100%;border-collapse:collapse">${rows}</table>
  ${siteUrl ? `<p><a href="${escHtml(siteUrl)}#ai-sec">在网站上查看完整日报 →</a></p>` : ''}
  <p style="color:#6b7280;font-size:12px">由 AI 自动生成，仅供参考，不构成投资建议。</p>
  </body></html>`;
}

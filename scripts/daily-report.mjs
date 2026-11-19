// Builds data/reports/<date>.json (+ index.json) and out/email.html.
// Run: node scripts/daily-report.mjs   (GEMINI_API_KEY optional — without it the report has data only)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { appendFileSync } from 'node:fs';
import { toYahoo, summarize, parseRss, buildPrompt, parseAi, renderEmail } from './lib.mjs';

const ROOT = new URL('..', import.meta.url);
const env = process.env;
const DATA_DIR = new URL(env.DATA_DIR ? env.DATA_DIR.replace(/\/?$/, '/') : 'data/', ROOT);
const OUT_DIR = new URL('out/', ROOT);
const UA = { 'User-Agent': 'Mozilla/5.0 (stock-desk daily report)' };
const MODEL = env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_BASE = env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
const TZ = env.REPORT_TZ || 'Asia/Shanghai';
const KEEP = 90;

const date = env.REPORT_DATE || new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchStock(symbol) {
  const y = toYahoo(symbol);
  const out = { symbol };
  try {
    const j = await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(y)}?range=6mo&interval=1d`);
    const res = j.chart?.result?.[0];
    const closes = res?.indicators?.quote?.[0]?.close || [];
    const s = summarize(closes);
    if (!s) throw new Error('没有价格数据');
    Object.assign(out, s);
  } catch (e) {
    out.error = `行情：${e.message}`;
  }
  try {
    const r = await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(y)}&region=US&lang=en-US`, { headers: UA });
    out.news = r.ok ? parseRss(await r.text(), 6) : [];
  } catch { out.news = []; }
  return out;
}

async function askGemini(prompt) {
  const r = await fetch(`${GEMINI_BASE}/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, responseMimeType: 'application/json' },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${j.error?.message || ''}`);
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return parseAi(text);
}

async function main() {
  const wl = JSON.parse(await readFile(new URL('watchlist.json', ROOT), 'utf8'));
  const symbols = [...new Set((wl.symbols || []).map((s) => String(s).trim().toUpperCase()).filter(Boolean))].slice(0, 30);
  if (!symbols.length) throw new Error('watchlist.json 里没有股票');

  const stocks = [];
  for (const s of symbols) { stocks.push(await fetchStock(s)); await sleep(400); }
  const report = { date, generatedAt: new Date().toISOString(), ai: false, model: null, overview: '', stocks, errors: [] };

  if (env.GEMINI_API_KEY) {
    try {
      const ai = await askGemini(buildPrompt(stocks, date));
      const bySym = new Map(ai.stocks.map((s) => [s.symbol, s]));
      for (const s of stocks) {
        const a = bySym.get(s.symbol) || bySym.get(s.symbol.split(':').pop());
        if (a) Object.assign(s, { sentiment: a.sentiment, score: a.score, summary: a.summary });
      }
      Object.assign(report, { ai: true, model: MODEL, overview: ai.overview });
    } catch (e) {
      report.errors.push(String(e.message || e));
      console.error('AI failed:', e.message);
    }
  }

  const repDir = new URL('reports/', DATA_DIR);
  await mkdir(repDir, { recursive: true });
  await writeFile(new URL(`${date}.json`, repDir), JSON.stringify(report, null, 2) + '\n');

  const idxUrl = new URL('index.json', repDir);
  const idx = existsSync(idxUrl) ? JSON.parse(await readFile(idxUrl, 'utf8')) : { dates: [] };
  idx.dates = [...new Set([date, ...(idx.dates || [])])].sort().reverse().slice(0, KEEP);
  await writeFile(idxUrl, JSON.stringify(idx, null, 2) + '\n');

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(new URL('email.html', OUT_DIR), renderEmail(report, env.SITE_URL || ''));
  const subject = `📈 自选股 AI 日报 ${date}`;
  await writeFile(new URL('subject.txt', OUT_DIR), subject);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `subject=${subject}\n`);

  const ok = stocks.filter((s) => !s.error).length;
  console.log(`Report ${date}: ${ok}/${stocks.length} stocks, AI=${report.ai}${report.errors.length ? ' errors=' + report.errors.join('; ') : ''}`);
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });

import test from 'node:test';
import assert from 'node:assert/strict';
import { toYahoo, rsi, macd, macdTrend, summarize, parseRss, parseAi, buildPrompt, renderEmail } from '../scripts/lib.mjs';

test('toYahoo strips exchange and maps class shares', () => {
  assert.equal(toYahoo('NASDAQ:AAPL'), 'AAPL');
  assert.equal(toYahoo('NYSE:BRK.B'), 'BRK-B');
  assert.equal(toYahoo('tsla'), 'TSLA');
});

test('rsi: all gains → 100, all losses → 0, flat-ish in middle', () => {
  const up = Array.from({ length: 30 }, (_, i) => 100 + i);
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  assert.equal(rsi(up), 100);
  assert.equal(rsi(down), 0);
  const zig = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 ? 1 : -1));
  assert.ok(Math.abs(rsi(zig) - 50) < 5);
  assert.equal(rsi([1, 2, 3]), null);
});

test('macd sign follows trend and detects cross', () => {
  const up = Array.from({ length: 60 }, (_, i) => 100 + i);
  assert.ok(macd(up).macd > 0);
  const vshape = [...Array.from({ length: 50 }, (_, i) => 200 - i * 2), ...Array.from({ length: 6 }, (_, i) => 102 + i * 8)];
  const m = macd(vshape);
  assert.ok(['黃金交叉', '多頭增強', '空頭減弱'].includes(macdTrend(m)));
  assert.equal(macdTrend({ hist: 1, prevHist: -1 }), '黃金交叉');
  assert.equal(macdTrend({ hist: -1, prevHist: 1 }), '死亡交叉');
});

test('summarize computes changes and skips nulls', () => {
  const closes = Array.from({ length: 40 }, (_, i) => 100 + i);
  closes.splice(10, 0, null);
  const s = summarize(closes);
  assert.equal(s.price, 139);
  assert.equal(s.chg1d, Math.round(((139 - 138) / 138) * 10000) / 100);
  assert.equal(s.chg5d, Math.round(((139 - 134) / 134) * 10000) / 100);
  assert.equal(s.rsi, 100);
});

test('parseRss reads items, decodes entities, drops bad links', () => {
  const xml = `<rss><channel><item><title>Apple &amp; Nvidia rise</title><link>https://x.com/a</link><pubDate>Tue, 18 Nov 2025 10:00:00 +0000</pubDate></item>
  <item><title><![CDATA[Second <b>one</b>]]></title><link>https://x.com/b</link></item>
  <item><title>bad</title><link>javascript:alert(1)</link></item></channel></rss>`;
  const items = parseRss(xml);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Apple & Nvidia rise');
  assert.equal(items[0].date, '2025-11-18T10:00:00.000Z');
  assert.equal(items[1].title, 'Second <b>one</b>');
});

test('parseAi tolerates code fences and clamps values', () => {
  const r = parseAi('```json\n{"overview":"ok","stocks":[{"symbol":"nasdaq:aapl","sentiment":"大漲","score":140,"summary":"s"}]}\n```');
  assert.equal(r.overview, 'ok');
  assert.deepEqual(r.stocks[0], { symbol: 'NASDAQ:AAPL', sentiment: '中性', score: 100, summary: 's' });
  assert.throws(() => parseAi('no json here'));
});

test('prompt and email include stocks and escape html', () => {
  const stocks = [{ symbol: 'NASDAQ:AAPL', price: 1, chg1d: 1, chg5d: 1, chg1m: 1, rsi: 50, macdTrend: '黃金交叉', news: [{ title: '<script>x</script>', link: 'https://a' }] }];
  assert.match(buildPrompt(stocks, '2026-01-01'), /NASDAQ:AAPL/);
  const html = renderEmail({ date: '2026-01-01', overview: '', stocks }, 'https://u.github.io/r/');
  assert.ok(!html.includes('<script>x'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /#ai-sec/);
});

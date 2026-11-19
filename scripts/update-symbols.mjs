// Refreshes data/symbols.json from Nasdaq Trader's public symbol directory (all US-listed stocks & ETFs).
import { writeFile } from 'node:fs/promises';

const BASE = 'https://www.nasdaqtrader.com/dynamic/SymDir/';
const OTHER_EX = { N: 'NYSE', A: 'AMEX', P: 'AMEX', Z: 'CBOE', V: 'IEX' };

function cleanName(n) {
  return n.replace(/\s+-\s+.*$/, '')
    .replace(/\b(Common Stock|Ordinary Shares|Common Shares|American Depositary Shares?)\b.*$/i, '')
    .replace(/[,\s]+$/, '').trim();
}

async function get(file) {
  const r = await fetch(BASE + file);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  return (await r.text()).trim().split(/\r?\n/).slice(1, -1).map((l) => l.split('|')); // drop header + "File Creation Time" footer
}

const list = [];
for (const [sym, name, , test] of await get('nasdaqlisted.txt')) {
  if (test === 'Y' || !/^[A-Z.]+$/.test(sym)) continue;
  list.push([sym, 'NASDAQ', cleanName(name)]);
}
for (const [sym, name, ex, , , , test] of await get('otherlisted.txt')) {
  if (test === 'Y' || !/^[A-Z.]+$/.test(sym) || !OTHER_EX[ex]) continue;
  list.push([sym, OTHER_EX[ex], cleanName(name)]);
}
if (list.length < 3000) throw new Error(`only ${list.length} symbols — refusing to overwrite`);
list.sort((a, b) => a[0].localeCompare(b[0]));
await writeFile(new URL('../data/symbols.json', import.meta.url), JSON.stringify({ updated: new Date().toISOString().slice(0, 10), list }) + '\n');
console.log(`symbols.json: ${list.length} symbols`);

'use strict';
// In-browser AI: Gemini keys are encrypted with the user's password (PBKDF2 + AES-GCM) and kept only in
// this browser's localStorage. The repo only holds a PBKDF2 hash of the password (used to unlock the form).

const AI_STORE = 'stockdesk.ai.v1';
const GATE_SALT = 'stockdesk-gate-v1';
const GATE_HASH = '6feb7d4a19e72737f4aa009061f8bb4d39edfe0066ff20bd15a6adfa205decea';
const ITER = 200000;
const GEMINI = () => window.STOCKDESK_GEMINI_BASE || 'https://generativelanguage.googleapis.com';
const FALLBACK_MODEL = 'gemini-2.5-flash-lite';

const te = new TextEncoder();
const b64 = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

let aiPw = null;      // password, kept in memory only for this tab
let aiKeys = [];      // decrypted keys, memory only
let pendingAfterUnlock = null;

async function pwBase(pw) { return crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits', 'deriveKey']); }
async function checkPw(pw) {
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: te.encode(GATE_SALT), iterations: ITER }, await pwBase(pw), 256);
  return hex(bits) === GATE_HASH;
}
async function aesKey(pw, salt) {
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, await pwBase(pw), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function readStore() { try { return JSON.parse(localStorage.getItem(AI_STORE) || 'null'); } catch { return null; } }
function aiModel() { return readStore()?.model || 'gemini-2.5-flash'; }

async function saveKeys(keys, model) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(aiPw, salt), te.encode(JSON.stringify(keys)));
  localStorage.setItem(AI_STORE, JSON.stringify({ v: 1, salt: b64(salt), iv: b64(iv), ct: b64(ct), model, n: keys.length }));
}
async function loadKeys() {
  const st = readStore();
  if (!st?.ct) return [];
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(st.iv) }, await aesKey(aiPw, unb64(st.salt)), unb64(st.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}
const mask = (k) => k.length > 10 ? `${k.slice(0, 6)}…${k.slice(-4)}` : '••••';

/* ---------- modal ---------- */
function openAi(after) {
  pendingAfterUnlock = after || null;
  $('aiModal').hidden = false;
  $('aiMsg').textContent = '';
  if (aiPw) { showForm(); return; }
  $('aiLock').hidden = false; $('aiForm').hidden = true;
  $('aiLockMsg').textContent = after ? '要使用 AI 點評，請先輸入密碼。' : '';
  $('aiPw').value = ''; $('aiPw').focus();
}
function showForm() {
  $('aiLock').hidden = true; $('aiForm').hidden = false;
  $('aiKeys').value = aiKeys.join('\n');
  $('aiModel').value = aiModel();
  $('aiMsg').className = 'small';
  $('aiMsg').textContent = aiKeys.length ? `已儲存 ${aiKeys.length} 把金鑰。` : '還沒有金鑰。到 https://aistudio.google.com/apikey 免費申請。';
}

$('aiLock').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('aiPw').value;
  $('aiLockMsg').textContent = '檢查中…';
  if (!(await checkPw(pw))) { $('aiLockMsg').textContent = '密碼錯誤'; return; }
  aiPw = pw;
  try { aiKeys = await loadKeys(); } catch { aiKeys = []; $('aiLockMsg').textContent = '舊資料無法解密，請重新填寫金鑰'; }
  const after = pendingAfterUnlock; pendingAfterUnlock = null;
  if (after && aiKeys.length) { $('aiModal').hidden = true; after(); return; }
  showForm();
  if (after) { $('aiMsg').className = 'small err'; $('aiMsg').textContent = '請先填寫並儲存金鑰。'; }
});

const parseKeyInput = () => [...new Set($('aiKeys').value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))];

$('aiSave').onclick = async () => {
  const keys = parseKeyInput();
  await saveKeys(keys, $('aiModel').value);
  aiKeys = keys;
  $('aiMsg').className = 'small ok';
  $('aiMsg').textContent = `已加密儲存 ${keys.length} 把金鑰（只在這台裝置）。`;
};
$('aiClear').onclick = () => {
  if (!confirm('確定清除這台裝置上儲存的所有金鑰？')) return;
  localStorage.removeItem(AI_STORE); aiKeys = []; $('aiKeys').value = '';
  $('aiMsg').className = 'small'; $('aiMsg').textContent = '已清除。';
};
$('aiTest').onclick = async () => {
  const keys = parseKeyInput();
  if (!keys.length) { $('aiMsg').textContent = '請先填寫金鑰'; return; }
  $('aiMsg').className = 'small'; $('aiMsg').textContent = '測試中…';
  const lines = [];
  for (const k of keys) {
    try {
      const r = await fetch(`${GEMINI()}/v1beta/models/${$('aiModel').value}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
        body: JSON.stringify({ contents: [{ parts: [{ text: '只回覆 OK' }] }] }),
      });
      const j = await r.json().catch(() => ({}));
      lines.push(`${mask(k)}：${r.ok ? '✓ 可用' : r.status === 429 ? '⚠ 今天額度用完' : '✗ ' + (j.error?.message || r.status).toString().slice(0, 80)}`);
    } catch (e) { lines.push(`${mask(k)}：✗ 連線失敗`); }
  }
  $('aiMsg').innerHTML = lines.map(esc).join('<br>');
};
$('aiSettings').onclick = () => openAi();
$('aiClose').onclick = () => { $('aiModal').hidden = true; };
$('aiModal').addEventListener('click', (e) => { if (e.target === $('aiModal')) $('aiModal').hidden = true; });

/* ---------- Gemini call with key rotation + model fallback ---------- */
async function gemini(body) {
  if (!aiKeys.length) throw new Error('沒有金鑰');
  const models = [...new Set([aiModel(), FALLBACK_MODEL])];
  let last = '';
  for (const model of models) {
    for (const k of aiKeys) {
      const r = await fetch(`${GEMINI()}/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return { j, model };
      last = `${r.status} ${j.error?.message || ''}`;
      if (![429, 500, 503].includes(r.status)) throw new Error(last); // bad key / bad request: stop
    }
  }
  throw new Error(`所有金鑰都暫時不能用（${last.slice(0, 120)}）`);
}

function withKeys(fn) {
  if (aiPw && aiKeys.length) return fn();
  openAi(fn);
}

function mdLite(text) {
  const lines = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').split('\n');
  let html = '', inList = false;
  for (const raw of lines) {
    const l = raw.trim();
    const li = l.match(/^[-*•]\s+(.*)/) || l.match(/^\d+[.)]\s+(.*)/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${li[1]}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (!l) continue;
    const h = l.match(/^#{1,4}\s+(.*)/);
    html += h ? `<p><b>${h[1]}</b></p>` : `<p>${l}</p>`;
  }
  return html + (inList ? '</ul>' : '');
}

/* ---------- AI comment on the current symbol (uses Google Search for fresh news) ---------- */
async function aiStock() {
  const sym = current;
  const out = $('aiOut');
  out.hidden = false;
  out.innerHTML = `<p class="muted">🤖 正在用 Gemini 搜尋 ${esc(sym)} 的最新消息並分析…（約 10–30 秒）</p>`;
  const known = (window.currentReport?.stocks || []).find((s) => s.symbol === sym && !s.error);
  const data = known ? `\n已知數據（${window.currentReport.date}）：價格 ${known.price}，1日 ${known.chg1d}%，5日 ${known.chg5d}%，1月 ${known.chg1m}%，RSI ${known.rsi}，MACD ${known.macdTrend}。` : '';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  const prompt = `今天是 ${today}。請先用 Google 搜尋美股 ${sym}（股票代號 ${sym.split(':').pop()}）最近一週的重要新聞，然後用繁體中文（台灣用語）寫一段簡短點評：${data}
1. 一句話結論，並標出情緒：利多 / 偏多 / 中性 / 偏空 / 利空
2. 3 則最重要的新聞重點（每則一行）
3. 技術面或股價走勢觀察
4. 需要留意的風險
不要給買賣建議，不要編造數字；不確定就說不確定。總長 250 字以內。`;
  try {
    const { j, model } = await gemini({ contents: [{ role: 'user', parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.4 } });
    if (sym !== current) return;
    const c = j.candidates?.[0];
    const text = c?.content?.parts?.map((p) => p.text || '').join('') || '（沒有回覆）';
    const srcs = (c?.groundingMetadata?.groundingChunks || []).map((g) => g.web).filter((w) => w?.uri).slice(0, 6);
    out.innerHTML = `<p class="small muted">🤖 ${esc(sym)} · ${esc(model)} · 僅供參考，不構成投資建議 <button class="btn tiny ghost" type="button" id="aiOutClose">收起</button></p>${mdLite(text)}`
      + (srcs.length ? `<p class="src">來源：${srcs.map((w) => `<a href="${esc(w.uri)}" target="_blank" rel="noopener">${esc(w.title || '連結')}</a>`).join('')}</p>` : '');
    $('aiOutClose').onclick = () => { out.hidden = true; };
  } catch (e) {
    out.innerHTML = `<p class="err">AI 點評失敗：${esc(e.message)}</p>`;
  }
}

/* ---------- AI for a data-only daily report ---------- */
async function aiReport() {
  const rep = window.currentReport;
  const btn = $('aiReportBtn');
  if (!rep || !btn) return;
  btn.disabled = true; btn.textContent = '🤖 AI 分析中…（約 10–30 秒）';
  try {
    const { buildPrompt, parseAi } = await import('./scripts/lib.mjs');
    const { j, model } = await gemini({ contents: [{ role: 'user', parts: [{ text: buildPrompt(rep.stocks, rep.date) }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } });
    const ai = parseAi(j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '');
    const bySym = new Map(ai.stocks.map((s) => [s.symbol, s]));
    const merged = { ...rep, ai: true, model: model + '（瀏覽器產生，未存檔）', overview: ai.overview,
      stocks: rep.stocks.map((s) => ({ ...s, ...(bySym.get(s.symbol) || bySym.get(s.symbol.split(':').pop()) || {}) })) };
    renderReport(merged);
  } catch (e) {
    btn.disabled = false; btn.textContent = '🤖 再試一次';
    toast('AI 失敗：' + e.message);
  }
}

$('aiStock').onclick = () => withKeys(aiStock);
$('report').addEventListener('click', (e) => { if (e.target.id === 'aiReportBtn') withKeys(aiReport); });

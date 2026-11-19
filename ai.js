'use strict';
// In-browser AI: Gemini keys are encrypted with the user's password (PBKDF2 + AES-GCM) and kept only in
// this browser's localStorage. The repo only holds a PBKDF2 hash of the password (used to unlock the form).

const AI_STORE = 'stockdesk.ai.v1';
const GATE_SALT = 'stockdesk-gate-v1';
const GATE_HASH = '6feb7d4a19e72737f4aa009061f8bb4d39edfe0066ff20bd15a6adfa205decea';
const ITER = 200000;
const GEMINI = () => window.STOCKDESK_GEMINI_BASE || 'https://generativelanguage.googleapis.com';
// Fallback order if Google's model list can't be read. Normally the list comes from the key itself.
const AUTO_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-flash-lite-latest'];
const MAX_TRIES = 10;
const MODEL_STORE = 'stockdesk.models.v1'; // { models: [...ranked], working: 'name' } — not secret

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
function aiModel() { return readStore()?.model || 'auto'; }
function modelInfo() { try { return JSON.parse(localStorage.getItem(MODEL_STORE) || '{}'); } catch { return {}; } }
function setModelInfo(patch) { try { localStorage.setItem(MODEL_STORE, JSON.stringify({ ...modelInfo(), ...patch })); } catch {} }
let workingModel = modelInfo().working || null; // last model that answered
function modelChain(pick = aiModel()) {
  return [...new Set([pick === 'auto' ? null : pick, workingModel, ...(modelInfo().models || []), ...AUTO_MODELS].filter(Boolean))];
}
// Ask Google which models this key can see, ranked for free use (rankModels in scripts/lib.mjs).
async function listModels(key) {
  const r = await fetch(`${GEMINI()}/v1beta/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || String(r.status)), { status: r.status });
  const { rankModels } = await import('./scripts/lib.mjs');
  return rankModels(j.models || []);
}
function fillModelSelect(models, pick) {
  const opts = ['<option value="auto">自動（推薦：依金鑰自動挑能用的模型）</option>']
    .concat(models.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`));
  $('aiModel').innerHTML = opts.join('');
  $('aiModel').value = models.includes(pick) ? pick : 'auto';
}
const keyProblem = (status, msg) => status === 401 || status === 403 || (status === 400 && /api key/i.test(msg));

// Try each key × model until one answers. Returns { j, model, key }.
async function callGemini(keys, models, body, { timeout = 45000, onTry } = {}) {
  const errs = [];
  for (const k of keys) {
    for (const model of models) {
      onTry?.(k, model);
      let r, j;
      try {
        r = await fetch(`${GEMINI()}/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k }, body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
        });
        j = await r.json().catch(() => ({}));
      } catch (e) {
        if (e.name === 'TimeoutError') { errs.push({ k, model, status: 0, msg: '逾時' }); continue; }
        errs.push({ k, model, status: 0, msg: '連線失敗' }); break;
      }
      if (r.ok) return { j, model, key: k };
      const msg = j.error?.message || '';
      errs.push({ k, model, status: r.status, msg });
      if (keyProblem(r.status, msg)) break; // this key is bad: skip its other models
      if (errs.filter((x) => x.k === k).length >= MAX_TRIES) break;
    }
  }
  const e = new Error(explain(errs));
  e.errs = errs;
  throw e;
}
function explain(errs) {
  if (!errs.length) return '沒有金鑰';
  if (errs.every((x) => keyProblem(x.status, x.msg))) return '金鑰無效，請到 ⚙ AI 設定檢查';
  if (errs.every((x) => x.status === 429 || x.status === 404 || keyProblem(x.status, x.msg))) return '這些金鑰今天能用的免費額度都用完了（或模型已不開放），明天再試或多加一把金鑰';
  const l = errs[errs.length - 1];
  return `${l.status} ${l.msg}`.slice(0, 160);
}

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
  fillModelSelect(modelInfo().models || [], aiModel());
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
  if (!(modelInfo().models || []).length && keys[0]) { try { const m = await listModels(keys[0]); setModelInfo({ models: m }); fillModelSelect(m, $('aiModel').value); } catch {} }
  $('aiMsg').className = 'small ok';
  $('aiMsg').textContent = `已加密儲存 ${keys.length} 把金鑰（只在這台裝置）。`;
};
$('aiClear').onclick = () => {
  if (!confirm('確定清除這台裝置上儲存的所有金鑰？')) return;
  localStorage.removeItem(AI_STORE); aiKeys = []; $('aiKeys').value = '';
  $('aiMsg').className = 'small'; $('aiMsg').textContent = '已清除。';
};
// Probe one key: ask every candidate model at once (short timeout) and keep the best-ranked one that answers.
async function probeKey(k, models, onProgress) {
  const cands = models.slice(0, 16);
  let done = 0;
  const results = await Promise.all(cands.map(async (m) => {
    try {
      const { model } = await callGemini([k], [m], { contents: [{ parts: [{ text: '只回覆 OK' }] }] }, { timeout: 15000 });
      return model;
    } catch { return null; } finally { onProgress(++done, cands.length); }
  }));
  return results.filter(Boolean);
}
$('aiTest').onclick = async () => {
  const keys = parseKeyInput();
  if (!keys.length) { $('aiMsg').textContent = '請先填寫金鑰'; return; }
  $('aiTest').disabled = true;
  $('aiMsg').className = 'small';
  const lines = [];
  const show = (extra = '') => { $('aiMsg').innerHTML = lines.map(esc).join('<br>') + (extra ? (lines.length ? '<br>' : '') + esc(extra).replace(/&lt;br&gt;/g, '<br>') : ''); };
  let all = [], ok = [];
  const prog = keys.map(() => '查詢模型中…');
  const tick = () => show(keys.map((k, i) => `第 ${i + 1} 把：${prog[i]}`).join('<br>'));
  tick();
  // all keys at once; each key probes its models in parallel (≤ ~20 s even if some models hang)
  const rows = await Promise.all(keys.map(async (k, i) => {
    let models = [];
    try { models = await listModels(k); } catch (e) { return `${mask(k)}：✗ ${keyProblem(e.status, e.message) ? '金鑰無效' : String(e.message).slice(0, 80)}`; }
    all = [...new Set([...all, ...models])];
    const working = await probeKey(k, models, (d, n) => { prog[i] = `試用模型 ${d}/${n}…`; tick(); });
    if (!working.length) return `${mask(k)}：✗ 找到 ${models.length} 個模型，但現在都沒有免費額度或太忙，請稍後再試`;
    ok = [...new Set([...ok, ...working])];
    return `${mask(k)}：✓ 可用，自動選用 ${working[0]}（${working.length} 個模型可用：${working.slice(0, 4).join('、')}${working.length > 4 ? '…' : ''}）`;
  }));
  lines.push(...rows);
  if (all.length) {
    const { rankModels } = await import('./scripts/lib.mjs');
    // models that answered go first, in rank order; the rest stay as later fallbacks
    const ranked = rankModels(all);
    const order = [...ranked.filter((m) => ok.includes(m)), ...ranked.filter((m) => !ok.includes(m))];
    workingModel = ok.length ? order[0] : workingModel;
    setModelInfo({ models: order, working: workingModel });
    fillModelSelect(order, $('aiModel').value);
  }
  $('aiTest').disabled = false;
  show('按「加密儲存」保存。');
};
$('aiSettings').onclick = () => openAi();
$('aiClose').onclick = () => { $('aiModal').hidden = true; };
$('aiModal').addEventListener('click', (e) => { if (e.target === $('aiModal')) $('aiModal').hidden = true; });

/* ---------- Gemini call with key rotation + model fallback ---------- */
async function gemini(body) {
  if (!aiKeys.length) throw new Error('沒有金鑰');
  if (!(modelInfo().models || []).length) { try { setModelInfo({ models: await listModels(aiKeys[0]) }); } catch {} }
  const res = await callGemini(aiKeys, modelChain(), body);
  if (res.model !== workingModel) { workingModel = res.model; setModelInfo({ working: res.model }); }
  return res;
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

/* ---------- AI comment on the current symbol ----------
   Tries Gemini with Google Search (fresh news). Many free keys have no search quota, so on failure it
   answers without search, using the daily report's numbers + headlines when the stock is in it. */
async function aiStock() {
  const sym = current;
  const out = $('aiOut');
  out.hidden = false;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  const known = (window.currentReport?.stocks || []).find((s) => s.symbol === sym && !s.error);
  const data = known ? `
已知數據（${window.currentReport.date}）：價格 ${known.price}，1日 ${known.chg1d}%，5日 ${known.chg5d}%，1月 ${known.chg1m}%，RSI ${known.rsi}，MACD ${known.macdTrend}。` : '';
  const heads = known?.news?.length ? `
最新新聞標題：
${known.news.slice(0, 6).map((n) => '- ' + n.title).join(String.fromCharCode(10))}` : '';
  const ask = `用繁體中文（台灣用語）寫一段簡短點評：
1. 一句話結論，並標出情緒：利多 / 偏多 / 中性 / 偏空 / 利空
2. 3 則最重要的新聞重點（每則一行）
3. 技術面或股價走勢觀察
4. 需要留意的風險
不要給買賣建議，不要編造數字；不確定就說不確定。總長 250 字以內。`;
  const withSearch = `今天是 ${today}。請先用 Google 搜尋美股 ${sym}（股票代號 ${sym.split(':').pop()}）最近一週的重要新聞，然後${ask}${data}`;
  const noSearch = `今天是 ${today}。你現在無法上網搜尋。請根據下面提供的資料（如果有）和你已知的背景，對美股 ${sym}（股票代號 ${sym.split(':').pop()}）${ask}
如果沒有提供新聞標題，第 2 點請改寫「公司近況背景」，並清楚說明資訊可能不是最新。${data}${heads}`;
  const say = (html) => { if (sym === current) out.innerHTML = html; };
  let res = null, searched = false;
  if (modelInfo().noSearchDay !== today) {
    say(`<p class="muted">🤖 正在用 Gemini 上網搜尋 ${esc(sym)} 的最新消息並分析…（約 10–30 秒）</p>`);
    try {
      res = await callGemini(aiKeys, modelChain().slice(0, 4), { contents: [{ role: 'user', parts: [{ text: withSearch }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.4 } });
      searched = true;
    } catch { setModelInfo({ noSearchDay: today }); }
  }
  try {
    if (!res) {
      say(`<p class="muted">🤖 正在分析 ${esc(sym)}…（這把金鑰今天沒有「上網搜尋」額度，改用日報資料分析）</p>`);
      res = await gemini({ contents: [{ role: 'user', parts: [{ text: noSearch }] }], generationConfig: { temperature: 0.4 } });
    } else if (res.model !== workingModel) { workingModel = res.model; setModelInfo({ working: res.model }); }
    const c = res.j.candidates?.[0];
    const text = c?.content?.parts?.map((p) => p.text || '').join('') || '（沒有回覆）';
    const srcs = (c?.groundingMetadata?.groundingChunks || []).map((g) => g.web).filter((w) => w?.uri).slice(0, 6);
    const note = searched ? '' : `<p class="small muted">⚠ 沒有即時上網搜尋${known ? '，新聞依據是今天日報抓到的標題' : '，內容可能不是最新'}。</p>`;
    say(`<p class="small muted">🤖 ${esc(sym)} · ${esc(res.model)} · 僅供參考，不構成投資建議 <button class="btn tiny ghost" type="button" id="aiOutClose">收起</button></p>${note}${mdLite(text)}`
      + (srcs.length ? `<p class="src">來源：${srcs.map((w) => `<a href="${esc(w.uri)}" target="_blank" rel="noopener">${esc(w.title || '連結')}</a>`).join('')}</p>` : ''));
    if ($('aiOutClose')) $('aiOutClose').onclick = () => { out.hidden = true; };
  } catch (e) {
    say(`<p class="err">AI 點評失敗：${esc(e.message)}</p>`);
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

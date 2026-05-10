// Backend bridge — talks to Apps Script webhook (deployed separately).
// All Drive + Gemini operations happen on Google's servers, bypassing NetFree.

const API_URL = localStorage.getItem('NEWSLETTER_API') ||
  'https://script.google.com/macros/s/REPLACE_WITH_DEPLOYMENT_ID/exec';
const API_TOKEN = localStorage.getItem('NEWSLETTER_TOKEN') || 'BHT_NEWSLETTER_2026';

async function api(action, params = {}) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('token', API_TOKEN);
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'object') url.searchParams.set(k, JSON.stringify(v));
    else url.searchParams.set(k, String(v));
  }
  const r = await fetch(url, { method: 'GET', mode: 'cors' });
  return r.json();
}

async function apiPost(action, body) {
  const url = `${API_URL}?action=${encodeURIComponent(action)}&token=${encodeURIComponent(API_TOKEN)}`;
  const r = await fetch(url, {
    method: 'POST', mode: 'cors',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Settings panel: lets the user paste their deployment URL once
function ensureApiConfigured() {
  if (API_URL.includes('REPLACE_WITH')) {
    const url = prompt('הזן את כתובת ה-Apps Script שלך (DEPLOYMENT_URL):');
    if (url) { localStorage.setItem('NEWSLETTER_API', url); location.reload(); }
    return false;
  }
  return true;
}

// Toast helper
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.className = `toast-msg toast-${type}`;
  t.textContent = msg;
  t.style.cssText = `position:fixed; bottom:20px; right:20px; padding:.8rem 1.2rem;
    border-radius:8px; background:${type==='error'?'#c0392b':type==='success'?'#27ae60':'#3498db'};
    color:#fff; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,.2);`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

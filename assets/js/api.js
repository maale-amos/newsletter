// LocalStorage-first data layer for maale-newsletter.
// All data lives in browser localStorage. Optional sync to GitHub repo
// (committed JSON files) for cross-device read-only sharing.
//
// No Apps Script. No backend. Works offline.

const STORAGE_KEY = 'maale_newsletter';
const REPO_OWNER = 'maale-amos';
const REPO_NAME = 'newsletter';
const DATA_PATH_ARTICLES = 'data/articles.json';
const DATA_PATH_PHOTOS = 'data/photos.json';

let _data = null;

function loadStored() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}
function saveStored() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_data)); } catch {}
}

async function fetchJson(path) {
  try {
    const r = await fetch(path + '?t=' + Date.now());
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function loadData() {
  const stored = loadStored();
  const [articlesSeed, photosSeed] = await Promise.all([
    fetchJson(DATA_PATH_ARTICLES),
    fetchJson(DATA_PATH_PHOTOS),
  ]);
  _data = {
    articles: stored.articles || (articlesSeed && articlesSeed.articles) || [],
    photos:   stored.photos   || (photosSeed && photosSeed.photos)     || [],
    settings: stored.settings || {},
  };
  saveStored();
  return _data;
}

function getArticles() { return _data.articles; }
function getArticle(id) { return _data.articles.find(a => a.id === id); }
function saveArticle(article) {
  if (!article.id) article.id = 'a_' + Date.now();
  article.modified = new Date().toISOString();
  const i = _data.articles.findIndex(a => a.id === article.id);
  if (i >= 0) _data.articles[i] = article;
  else _data.articles.unshift(article);
  saveStored();
  return article;
}
function deleteArticle(id) {
  _data.articles = _data.articles.filter(a => a.id !== id);
  saveStored();
}

function getPhotos() { return _data.photos; }
function savePhoto(photo) {
  if (!photo.id) photo.id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  photo.created = photo.created || new Date().toISOString();
  _data.photos.unshift(photo);
  saveStored();
  return photo;
}
function deletePhoto(id) {
  _data.photos = _data.photos.filter(p => p.id !== id);
  saveStored();
}

// Toast helper
function toast(msg, type = 'info') {
  const t = document.createElement('div');
  t.textContent = msg;
  t.style.cssText = `position:fixed;bottom:20px;right:20px;padding:.8rem 1.2rem;
    border-radius:8px;background:${type==='error'?'#c0392b':type==='success'?'#27ae60':'#3498db'};
    color:#fff;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.2);font-family:Heebo,sans-serif`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Optional: Gemini direct (user's own API key, saved to localStorage)
async function geminiAssist(prompt, text) {
  const key = _data.settings.geminiKey || prompt_('הזן Gemini API key (חד-פעמי, נשמר מקומית):');
  if (!key) return null;
  if (!_data.settings.geminiKey) {
    _data.settings.geminiKey = key;
    saveStored();
  }
  const fullPrompt = prompt + '\n\n' + text;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${key}`,
      { method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }] }) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    return j.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) {
    toast('שגיאת AI: ' + e.message, 'error');
    return null;
  }
}
function prompt_(msg) { return prompt(msg); }

// PDF export via browser print (most reliable, no library)
function exportPdf(title, html) {
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@400;700;900&family=Heebo:wght@400;700&display=swap" rel="stylesheet">
<style>
body{font-family:'Frank Ruhl Libre',serif;max-width:800px;margin:2rem auto;padding:2rem;line-height:1.85;font-size:16pt;color:#222}
h1{font-size:28pt;border-bottom:2px solid #c9a66b;padding-bottom:.5rem}
img{max-width:100%;border-radius:8px}
@media print { body{margin:0;padding:1cm} }
</style></head><body>
<h1>${title}</h1>
${html}
<script>setTimeout(()=>window.print(), 500);<\/script>
</body></html>`);
}

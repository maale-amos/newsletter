let currentId = new URLSearchParams(location.search).get('id') || null;
let lastAi = '';
let saveTimer = null;

function format(cmd, val = null) {
  document.execCommand(cmd, false, val);
  document.getElementById('body').focus();
}
function insertImagePlaceholder() {
  const url = prompt('הדבק כתובת תמונה:');
  if (url) format('insertImage', url);
}

async function init() {
  await loadData();
  // If launched with ?seed=1 — pre-fill from a suggestion stashed in localStorage
  if (new URLSearchParams(location.search).get('seed') === '1') {
    try {
      const seed = JSON.parse(localStorage.getItem('newsletter_seed') || '{}');
      if (seed && seed.title) {
        document.getElementById('title').value = seed.title;
        document.getElementById('category').value = seed.category || '';
        document.getElementById('body').innerHTML =
          (seed.outline ? '<h3>תוכן עניינים מוצע</h3>' + seed.outline : '') +
          (seed.draft ? '<hr>' + seed.draft : '');
        localStorage.removeItem('newsletter_seed');
        toast('טעון מהצעת AI', 'info');
      }
    } catch {}
  }
  if (currentId) {
    const a = getArticle(currentId);
    if (a) {
      document.getElementById('title').value = a.title || '';
      document.getElementById('category').value = a.category || '';
      document.getElementById('body').innerHTML = a.body || '';
    }
  }
}

async function saveArticleNow() {
  const status = document.getElementById('saveStatus');
  status.textContent = 'שומר...';
  const article = {
    id: currentId,
    title: document.getElementById('title').value,
    category: document.getElementById('category').value,
    body: document.getElementById('body').innerHTML,
    preview: document.getElementById('body').innerText.substring(0, 200),
    author: 'יוסף',
  };
  const saved = saveArticle(article);
  if (!currentId) {
    currentId = saved.id;
    history.replaceState(null, '', `editor.html?id=${saved.id}`);
  }
  status.textContent = 'נשמר ב-' + new Date().toLocaleTimeString('he-IL');
  toast('נשמר מקומית', 'success');
}

['title', 'category'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveArticleNow, 5000);
  });
});
document.getElementById('body').addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveArticleNow, 5000);
});

async function aiAction(kind) {
  const modal = new bootstrap.Modal(document.getElementById('aiModal'));
  const result = document.getElementById('aiResult');
  result.innerHTML = '<div class="spinner-border"></div> חושב...';
  modal.show();
  const text = document.getElementById('body').innerText;
  const prompts = {
    proofread: 'הגה את הטקסט הבא בעברית מדוקדקת. תקן שגיאות כתיב ודקדוק. החזר רק את הטקסט המתוקן:',
    shorten: 'קצר את הטקסט הבא לכ-50% מאורכו, סגנון תורני-קהילתי. החזר רק טקסט:',
    expand: 'הרחב את הטקסט הבא והוסף פרטים. סגנון תורני-קהילתי לעיתון יישוב. החזר רק טקסט:',
    suggest_photos: 'הצע 5 רעיונות לאילוסטרציה לכתבה הבאה. רשימה ממוספרת. כל הצעה ב-2 משפטים:',
    catchy_title: 'הצע 5 כותרות קליטות לכתבה הבאה. רק הכותרות, אחת בשורה:',
  };
  lastAi = await geminiAssist(prompts[kind] || prompts.proofread, text);
  if (lastAi) {
    result.innerHTML = `<div style="white-space:pre-wrap;font-family:'Frank Ruhl Libre',serif;line-height:1.8">${lastAi.replace(/</g, '&lt;')}</div>`;
  } else {
    result.innerHTML = '<div class="text-danger">לא הצלחתי להפעיל את ה-AI. ודא שהזנת Gemini API key.</div>';
  }
}

function applyAi() {
  if (!lastAi) return;
  if (confirm('להחליף את גוף הכתבה?')) {
    document.getElementById('body').innerText = lastAi;
    bootstrap.Modal.getInstance(document.getElementById('aiModal')).hide();
    saveArticleNow();
  }
}

function exportPDF() {
  exportPdf(document.getElementById('title').value || 'כתבה',
            document.getElementById('body').innerHTML);
}

// Backwards-compat alias used by HTML buttons
window.saveArticle = saveArticleNow;

init();

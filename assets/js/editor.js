let currentArticleId = new URLSearchParams(location.search).get('id') || null;
let lastAiResult = '';
let saveTimer = null;

function format(cmd, val = null) {
  document.execCommand(cmd, false, val);
  document.getElementById('body').focus();
}

function insertImagePlaceholder() {
  const url = prompt('הדבק כתובת תמונה (או העלה דרך בנק התמונות):');
  if (url) format('insertImage', url);
}

async function loadArticle() {
  if (!currentArticleId) return;
  const r = await api('getArticle', { id: currentArticleId });
  if (r.ok && r.article) {
    document.getElementById('title').value = r.article.title || '';
    document.getElementById('category').value = r.article.category || '';
    document.getElementById('body').innerHTML = r.article.body || '';
  }
}

async function saveArticle() {
  if (!ensureApiConfigured()) return;
  const status = document.getElementById('saveStatus');
  status.textContent = 'שומר...';
  const data = {
    id: currentArticleId,
    title: document.getElementById('title').value,
    category: document.getElementById('category').value,
    body: document.getElementById('body').innerHTML,
  };
  const r = await apiPost('saveArticle', data);
  if (r.ok) {
    if (r.id && !currentArticleId) {
      currentArticleId = r.id;
      history.replaceState(null, '', `editor.html?id=${r.id}`);
    }
    status.textContent = `נשמר ב-${new Date().toLocaleTimeString('he-IL')}`;
    toast('נשמר ל-Drive', 'success');
  } else {
    status.textContent = 'שגיאה בשמירה';
    toast('שגיאה: ' + (r.error || ''), 'error');
  }
}

// Auto-save every 30 seconds while typing
['title', 'category'].forEach(id => {
  document.getElementById(id).addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveArticle, 30000);
  });
});
document.getElementById('body').addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveArticle, 30000);
});

async function aiAction(kind) {
  const modal = new bootstrap.Modal(document.getElementById('aiModal'));
  const result = document.getElementById('aiResult');
  result.innerHTML = '<div class="spinner-border"></div> חושב...';
  modal.show();
  try {
    const text = document.getElementById('body').innerText;
    const r = await apiPost('aiAssist', { kind, text, title: document.getElementById('title').value });
    if (r.ok) {
      lastAiResult = r.result || '';
      if (kind === 'to_audio' && r.audio_url) {
        result.innerHTML = `<p>הקובץ עלה לשלוחה 3 ונשלח צינתוק.</p><audio controls src="${r.audio_url}"></audio>`;
      } else {
        result.innerHTML = `<div style="white-space:pre-wrap; font-family:'Frank Ruhl Libre',serif">${lastAiResult}</div>`;
      }
    } else {
      result.innerHTML = `<div class="text-danger">שגיאה: ${r.error}</div>`;
    }
  } catch (e) {
    result.innerHTML = `<div class="text-danger">${e.message}</div>`;
  }
}

function applyAi() {
  if (!lastAiResult) return;
  if (confirm('להחליף את גוף הכתבה בהצעת ה-AI?')) {
    document.getElementById('body').innerText = lastAiResult;
    bootstrap.Modal.getInstance(document.getElementById('aiModal')).hide();
    saveArticle();
  }
}

async function exportPDF() {
  toast('מייצר PDF...', 'info');
  const r = await apiPost('exportPdf', {
    id: currentArticleId,
    title: document.getElementById('title').value,
    body: document.getElementById('body').innerHTML,
  });
  if (r.ok && r.url) {
    window.open(r.url, '_blank');
  } else {
    toast('שגיאה ב-PDF', 'error');
  }
}

loadArticle();

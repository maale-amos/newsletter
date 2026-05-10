async function loadFeed() {
  try {
    const r = await fetch('data/feed.json?t=' + Date.now());
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function loadSuggestions() {
  try {
    const r = await fetch('data/suggestions.json?t=' + Date.now());
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

function timeAgoHe(ts) {
  if (!ts) return '';
  const d = (Date.now()/1000) - ts;
  if (d < 60) return 'עכשיו';
  if (d < 3600) return `לפני ${Math.floor(d/60)} דקות`;
  if (d < 86400) return `לפני ${Math.floor(d/3600)} שעות`;
  return `לפני ${Math.floor(d/86400)} ימים`;
}

function renderFeed(items) {
  const el = document.getElementById('liveFeed');
  if (!items || !items.length) {
    el.innerHTML = '<div class="text-muted text-center py-3">אין נתונים. שירות הסינכרון אולי לא רץ.</div>';
    return;
  }
  el.innerHTML = items.slice(0, 60).map(it => {
    const tagsHtml = (it.tags || []).slice(0, 4).map(t =>
      `<span class="tag-chip" style="font-size:10px;padding:1px 8px;cursor:default">${t}</span>`).join(' ');
    const linksHtml = (it.links || []).map(l =>
      `<a href="${l.url}" target="_blank" class="badge bg-secondary text-decoration-none">${l.kind}</a>`).join(' ');
    const catColor = {
      'כתבה': '#e94560', 'תמונות': '#9b59b6', 'מסמך': '#3498db',
      'שאלה': '#f39c12', 'תיאום': '#27ae60', 'אחר': '#95a5a6',
    }[it.category] || '#95a5a6';
    return `
      <div class="feed-item border-bottom py-2">
        <div class="d-flex justify-content-between align-items-start mb-1">
          <span class="badge" style="background:${catColor}">${it.category || '—'}</span>
          <small class="text-muted">${timeAgoHe(it.time)}</small>
        </div>
        <div class="small">${(it.summary || it.text || '').replace(/</g,'&lt;').substring(0, 200)}</div>
        ${tagsHtml ? `<div class="mt-1">${tagsHtml}</div>` : ''}
        ${linksHtml ? `<div class="mt-1">${linksHtml}</div>` : ''}
      </div>`;
  }).join('');
}

function renderSuggestions(suggestions) {
  const el = document.getElementById('suggestions');
  if (!suggestions || !suggestions.length) {
    el.innerHTML = '<div class="text-muted small text-center">אין הצעות עדיין. נמתין שתצטבר פעילות בקבוצה.</div>';
    return;
  }
  el.innerHTML = suggestions.slice(0, 8).map((s, i) => `
    <div class="suggestion-card mb-2 p-3 border rounded">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <h6 class="mb-1">${s.title || 'הצעה ' + (i+1)}</h6>
          <div class="small text-muted">${s.angle || ''}</div>
          ${s.based_on ? `<div class="small text-muted mt-1"><i class="bi bi-link-45deg"></i> מבוסס על: ${s.based_on}</div>` : ''}
        </div>
        <button class="btn btn-sm btn-success" onclick="useSuggestion(${i})"><i class="bi bi-arrow-left"></i> כתוב</button>
      </div>
    </div>
  `).join('');
  window._suggestions = suggestions;
}

function useSuggestion(i) {
  const s = window._suggestions[i];
  // Stash in localStorage so editor can pick it up
  localStorage.setItem('newsletter_seed', JSON.stringify(s));
  location.href = 'editor.html?seed=1';
}

function renderStats(items, suggestions) {
  const today = new Date().setHours(0,0,0,0)/1000;
  const todayCount = (items || []).filter(it => it.time >= today).length;
  const totalCount = (items || []).length;
  const suggestionCount = (suggestions || []).length;
  document.getElementById('statsRow').innerHTML = `
    <div class="col-md-3 col-6">
      <div class="card text-center"><div class="card-body">
        <div class="display-6 fw-bold text-primary">${todayCount}</div>
        <div class="small text-muted">פעילות היום</div>
      </div></div>
    </div>
    <div class="col-md-3 col-6">
      <div class="card text-center"><div class="card-body">
        <div class="display-6 fw-bold text-success">${totalCount}</div>
        <div class="small text-muted">פריטים בארכיון</div>
      </div></div>
    </div>
    <div class="col-md-3 col-6">
      <div class="card text-center"><div class="card-body">
        <div class="display-6 fw-bold text-warning">${suggestionCount}</div>
        <div class="small text-muted">הצעות לכתבות</div>
      </div></div>
    </div>
    <div class="col-md-3 col-6">
      <div class="card text-center"><div class="card-body">
        <div class="display-6 fw-bold text-danger">${getArticles().length}</div>
        <div class="small text-muted">כתבות בעריכה</div>
      </div></div>
    </div>
  `;
}

function renderArticles() {
  const list = document.getElementById('articlesList');
  const articles = getArticles();
  if (!articles.length) {
    list.innerHTML = '<div class="text-muted text-center py-3">אין כתבות בעריכה. <a href="editor.html">כתוב חדש</a></div>';
    return;
  }
  list.innerHTML = articles.slice(0, 6).map(a => `
    <a href="editor.html?id=${a.id}" class="d-block border-bottom p-3 text-decoration-none text-dark article-row">
      <div class="d-flex justify-content-between">
        <div>
          <div class="fw-bold">${a.title || 'ללא כותרת'}</div>
          <div class="small text-muted">${a.category || 'כללי'} · ${new Date(a.modified || a.created).toLocaleDateString('he-IL')}</div>
        </div>
        <i class="bi bi-chevron-left text-muted"></i>
      </div>
    </a>
  `).join('');
}

document.getElementById('feedSearch').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.feed-item').forEach(it => {
    it.style.display = it.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});

async function init() {
  await loadData();
  const feed = await loadFeed();
  const suggestions = await loadSuggestions();
  const items = feed?.items || [];
  const sgs = suggestions?.suggestions || [];
  renderStats(items, sgs);
  renderFeed(items);
  renderSuggestions(sgs);
  renderArticles();
  if (feed?.updated) {
    document.getElementById('lastSync').textContent = `סנכרון: ${feed.updated.replace('T',' ')}`;
  } else {
    document.getElementById('lastSync').textContent = 'לא סונכרן עדיין';
  }
}

init();
setInterval(init, 60000);  // refresh every minute

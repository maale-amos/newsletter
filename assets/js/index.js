async function loadArticles() {
  const list = document.getElementById('articlesList');
  if (!ensureApiConfigured()) return;
  try {
    const r = await api('listArticles');
    if (!r.ok) throw new Error(r.error || 'load failed');
    const articles = r.articles || [];
    if (!articles.length) {
      list.innerHTML = '<div class="col-12 text-center text-muted py-5"><i class="bi bi-file-earmark-text" style="font-size:3rem"></i><div class="mt-2">אין כתבות עדיין. <a href="editor.html">צור כתבה ראשונה</a></div></div>';
      return;
    }
    list.innerHTML = articles.map(a => `
      <div class="col-md-6 col-lg-4">
        <a href="editor.html?id=${encodeURIComponent(a.id)}" class="text-decoration-none text-dark">
          <div class="card article-card h-100">
            <div class="card-body">
              <span class="badge bg-secondary mb-2">${a.category || 'כללי'}</span>
              <h5 class="card-title">${a.title || 'ללא כותרת'}</h5>
              <p class="card-text text-muted small">${(a.preview || '').substring(0, 120)}...</p>
              <div class="meta d-flex justify-content-between">
                <span><i class="bi bi-person"></i> ${a.author || 'אנונימי'}</span>
                <span>${a.modified || ''}</span>
              </div>
            </div>
          </div>
        </a>
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<div class="col-12 text-center text-danger py-5">${e.message}</div>`;
  }
}

document.getElementById('searchBox').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.article-card').forEach(card => {
    const txt = card.textContent.toLowerCase();
    card.parentElement.parentElement.style.display = txt.includes(q) ? '' : 'none';
  });
});

loadArticles();

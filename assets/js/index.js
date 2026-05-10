async function render() {
  const list = document.getElementById('articlesList');
  await loadData();
  const articles = getArticles();
  if (!articles.length) {
    list.innerHTML = `<div class="col-12 text-center text-muted py-5">
      <i class="bi bi-file-earmark-text" style="font-size:3rem"></i>
      <div class="mt-2">אין כתבות עדיין. <a href="editor.html">צור כתבה ראשונה</a></div>
    </div>`;
    return;
  }
  list.innerHTML = articles.map(a => `
    <div class="col-md-6 col-lg-4">
      <a href="editor.html?id=${encodeURIComponent(a.id)}" class="text-decoration-none text-dark">
        <div class="card article-card h-100">
          <div class="card-body">
            <span class="badge bg-secondary mb-2">${a.category || 'כללי'}</span>
            <h5 class="card-title">${a.title || 'ללא כותרת'}</h5>
            <p class="card-text text-muted small">${(a.preview || (a.body || '').replace(/<[^>]+>/g,' ')).substring(0, 140)}...</p>
            <div class="meta d-flex justify-content-between mt-2">
              <span><i class="bi bi-person"></i> ${a.author || 'אנונימי'}</span>
              <span>${new Date(a.modified || a.created || Date.now()).toLocaleDateString('he-IL')}</span>
            </div>
          </div>
        </div>
      </a>
    </div>
  `).join('');
}

document.getElementById('searchBox').addEventListener('input', e => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll('.article-card').forEach(card => {
    const txt = card.textContent.toLowerCase();
    card.parentElement.parentElement.style.display = txt.includes(q) ? '' : 'none';
  });
});

render();

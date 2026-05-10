let allPhotos = [];
let activeTags = new Set();

async function loadPhotos() {
  if (!ensureApiConfigured()) return;
  const r = await api('listPhotos');
  if (!r.ok) { toast('שגיאת טעינה', 'error'); return; }
  allPhotos = r.photos || [];
  // Build tag chips
  const tagSet = new Set();
  allPhotos.forEach(p => (p.tags || []).forEach(t => tagSet.add(t)));
  const filtersEl = document.getElementById('tagFilters');
  filtersEl.innerHTML = [...tagSet].slice(0, 30).map(t =>
    `<span class="tag-chip" onclick="toggleTag('${t}')">${t}</span>`).join('');
  filterPhotos();
}

function toggleTag(t) {
  if (activeTags.has(t)) activeTags.delete(t);
  else activeTags.add(t);
  document.querySelectorAll('.tag-chip').forEach(c => {
    c.classList.toggle('active', activeTags.has(c.textContent));
  });
  filterPhotos();
}

function filterPhotos() {
  const q = (document.getElementById('photoSearch').value || '').toLowerCase();
  const sort = document.getElementById('sortBy').value;
  let list = allPhotos.slice();
  if (q) list = list.filter(p => (p.tags || []).some(t => t.includes(q)) ||
    (p.caption || '').toLowerCase().includes(q));
  if (activeTags.size) list = list.filter(p => (p.tags || []).some(t => activeTags.has(t)));
  list.sort((a, b) => sort === 'newest' ? b.created - a.created : a.created - b.created);

  const g = document.getElementById('gallery');
  if (!list.length) {
    g.innerHTML = '<div class="col-12 text-center text-muted py-5">אין תמונות</div>';
    return;
  }
  g.innerHTML = list.map(p => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="photo-tile" style="background-image:url('${p.thumb || p.url}')" onclick="window.open('${p.url}','_blank')">
        <div class="overlay">${(p.tags || []).slice(0, 2).join(' · ')}</div>
      </div>
    </div>
  `).join('');
}

async function uploadPhotos(files) {
  if (!files.length) return;
  const progress = document.getElementById('uploadProgress');
  progress.innerHTML = `<div class="alert alert-info">מעלה ${files.length} תמונות...</div>`;
  let done = 0;
  for (const file of files) {
    try {
      const b64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      await apiPost('uploadPhoto', { name: file.name, type: file.type, data_b64: b64 });
      done++;
      progress.innerHTML = `<div class="alert alert-info">העלתה ${done}/${files.length}...</div>`;
    } catch (e) {
      console.error(e);
    }
  }
  progress.innerHTML = `<div class="alert alert-success">הועלו ${done}/${files.length} תמונות. תיוג AI ירוץ ברקע.</div>`;
  setTimeout(() => { progress.innerHTML = ''; loadPhotos(); }, 3000);
}

document.getElementById('photoSearch').addEventListener('input', filterPhotos);
loadPhotos();

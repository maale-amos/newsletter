async function init() {
  await loadData();
  render();
}

function render() {
  const q = (document.getElementById('photoSearch').value || '').toLowerCase();
  const sort = document.getElementById('sortBy').value;
  let list = getPhotos().slice();
  if (q) list = list.filter(p => (p.tags || []).some(t => t.includes(q)) ||
    (p.caption || '').toLowerCase().includes(q));
  list.sort((a, b) => {
    const ta = new Date(a.created).getTime();
    const tb = new Date(b.created).getTime();
    return sort === 'newest' ? tb - ta : ta - tb;
  });
  const g = document.getElementById('gallery');
  if (!list.length) {
    g.innerHTML = '<div class="col-12 text-center text-muted py-5">אין תמונות</div>';
    return;
  }
  g.innerHTML = list.map(p => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="photo-tile" style="background-image:url('${p.thumb || p.data || p.url}')" onclick="openPhoto('${p.id}')">
        <div class="overlay">${(p.tags || []).slice(0, 2).join(' · ')}</div>
      </div>
    </div>
  `).join('');
}

function openPhoto(id) {
  const p = getPhotos().find(x => x.id === id);
  if (!p) return;
  const w = window.open();
  w.document.write(`<img src="${p.data || p.url}" style="max-width:100%;height:auto"><br>${p.caption||''}`);
}

async function uploadPhotos(files) {
  if (!files.length) return;
  const progress = document.getElementById('uploadProgress');
  progress.innerHTML = `<div class="alert alert-info">מעלה ${files.length} תמונות...</div>`;
  let done = 0;
  for (const file of files) {
    try {
      // Resize for storage efficiency: max 1200px on longest edge
      const dataUrl = await resizeAndEncode(file, 1200);
      const thumb = await resizeAndEncode(file, 400);
      const tags = prompt(`תגים ל-${file.name} (מופרדים בפסיק, ENTER לדלג):`, '');
      savePhoto({
        name: file.name,
        caption: '',
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        data: dataUrl,
        thumb: thumb,
      });
      done++;
      progress.innerHTML = `<div class="alert alert-info">העלתה ${done}/${files.length}...</div>`;
    } catch (e) {
      console.error(e);
    }
  }
  progress.innerHTML = `<div class="alert alert-success">הועלו ${done}/${files.length} תמונות.</div>`;
  setTimeout(() => { progress.innerHTML = ''; render(); }, 2500);
}

function resizeAndEncode(file, maxDim) {
  return new Promise((res, rej) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = e => { img.src = e.target.result; };
    reader.onerror = rej;
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h);
        w = Math.round(w * scale);
        h = Math.round(h * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      res(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = rej;
    reader.readAsDataURL(file);
  });
}

document.getElementById('photoSearch').addEventListener('input', render);
document.getElementById('sortBy').addEventListener('change', render);
init();

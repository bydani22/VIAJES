// ---- State ----
const state = {
  places: [],   // { name, link }
  photos: []    // { name, dataUrl }
};

// ---- Places ----
const placesList = document.getElementById('placesList');
const placeNameInput = document.getElementById('placeName');
const placeLinkInput = document.getElementById('placeLink');

function renderPlaces() {
  placesList.innerHTML = '';
  state.places.forEach((place, i) => {
    const chip = document.createElement('span');
    chip.className = 'place-chip';
    chip.innerHTML = `${escapeHtml(place.name)} <button type="button" aria-label="Eliminar">×</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      state.places.splice(i, 1);
      renderPlaces();
    });
    placesList.appendChild(chip);
  });
}

document.getElementById('addPlaceBtn').addEventListener('click', () => {
  const name = placeNameInput.value.trim();
  const link = placeLinkInput.value.trim();
  if (!name) return;
  state.places.push({ name, link });
  placeNameInput.value = '';
  placeLinkInput.value = '';
  placeNameInput.focus();
  renderPlaces();
});

// ---- Photos ----
const dropzone = document.getElementById('dropzone');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');

dropzone.addEventListener('click', () => photoInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('dragover'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
dropzone.addEventListener('drop', e => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
photoInput.addEventListener('change', e => handleFiles(e.target.files));

// Límite orientativo de peso total del archivo final (en bytes)
const MAX_TOTAL_BYTES = 20 * 1024 * 1024; // 20 MB
// Lado máximo (en px) al que se redimensiona cada foto antes de incrustarla
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.72;

function handleFiles(fileList) {
  [...fileList].forEach(file => {
    if (!file.type.startsWith('image/')) return;
    compressImage(file, MAX_DIMENSION, JPEG_QUALITY).then(dataUrl => {
      state.photos.push({ name: file.name, dataUrl });
      renderPhotoPreview();
    });
  });
}

// Redimensiona y recomprime una imagen en el propio navegador, devolviendo un dataURL en JPEG.
// Esto es lo que evita que el HTML final pese lo mismo que las fotos originales del móvil.
function compressImage(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) {
          height = Math.round(height * (maxDimension / width));
          width = maxDimension;
        } else if (height > maxDimension) {
          width = Math.round(width * (maxDimension / height));
          height = maxDimension;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Tamaño aproximado en bytes de un dataURL base64
function dataUrlSize(dataUrl) {
  const base64 = dataUrl.split(',')[1] || '';
  return Math.round(base64.length * 0.75);
}

function renderPhotoPreview() {
  photoPreview.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb';
    const img = document.createElement('img');
    img.src = photo.dataUrl;
    img.alt = photo.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-remove';
    remove.setAttribute('aria-label', 'Quitar foto');
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.photos.splice(i, 1);
      renderPhotoPreview();
    });
    wrap.appendChild(img);
    wrap.appendChild(remove);
    photoPreview.appendChild(wrap);
  });
  renderSizeCounter();
}

function renderSizeCounter() {
  const counter = document.getElementById('sizeCounter');
  if (!counter) return;
  if (state.photos.length === 0) {
    counter.textContent = '';
    return;
  }
  const totalBytes = state.photos.reduce((sum, p) => sum + dataUrlSize(p.dataUrl), 0);
  const mb = (totalBytes / (1024 * 1024)).toFixed(1);
  const limitMb = (MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(0);
  counter.textContent = `Peso aproximado: ${mb} MB de ${limitMb} MB`;
  counter.classList.toggle('over-limit', totalBytes > MAX_TOTAL_BYTES);
}

// ---- Slug auto-fill ----
const tripNameInput = document.getElementById('tripName');
const tripSlugInput = document.getElementById('tripSlug');
let slugTouched = false;
tripSlugInput.addEventListener('input', () => { slugTouched = true; });
tripNameInput.addEventListener('input', () => {
  if (slugTouched) return;
  tripSlugInput.value = slugify(tripNameInput.value);
});

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- Generate ----
document.getElementById('generateBtn').addEventListener('click', () => {
  const statusMsg = document.getElementById('statusMsg');
  const name = tripNameInput.value.trim();
  const slug = tripSlugInput.value.trim() || slugify(name);
  const date = document.getElementById('tripDate').value.trim();
  const description = document.getElementById('tripDescription').value.trim();

  if (!name) {
    statusMsg.textContent = 'Ponle un nombre al viaje antes de generar la página.';
    return;
  }
  if (state.photos.length === 0) {
    statusMsg.textContent = 'Sube al menos una foto antes de generar la página.';
    return;
  }

  const totalBytes = state.photos.reduce((sum, p) => sum + dataUrlSize(p.dataUrl), 0);
  if (totalBytes > MAX_TOTAL_BYTES) {
    const mb = (totalBytes / (1024 * 1024)).toFixed(1);
    statusMsg.textContent = `El archivo pesará ~${mb} MB, por encima del límite. Quita alguna foto o vuelve a intentarlo (se comprimen automáticamente, pero muchas fotos siguen sumando).`;
    return;
  }

  const html = buildTripPage({ name, date, description, places: state.places, photos: state.photos });
  downloadFile(`${slug || 'viaje'}.html`, html);
  statusMsg.textContent = `Listo. Descargado como "${slug || 'viaje'}.html" — renómbralo a index.html dentro de la carpeta "${slug || 'tu-viaje'}/" de tu repositorio.`;
});

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Builds a fully self-contained HTML page (fonts, styles, photos and places all inline)
function buildTripPage({ name, date, description, places, photos }) {
  const stampColors = ['#b3402f', '#2c4a52'];

  const placesHtml = places.map((p, i) => {
    const color = stampColors[i % 2];
    const rotate = (i % 2 === 0 ? -2 : 2) + (i % 3);
    const inner = p.link
      ? `<a href="${escapeAttr(p.link)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`
      : escapeHtml(p.name);
    return `<span class="stamp" style="--stamp-color:${color}; transform: rotate(${rotate}deg);">${inner}</span>`;
  }).join('\n');

  const galleryHtml = photos.map((photo, i) =>
    `<img src="${photo.dataUrl}" alt="Foto ${i + 1} de ${escapeAttr(name)}" loading="lazy" onclick="openLightbox(${i})">`
  ).join('\n');

  const lightboxSources = JSON.stringify(photos.map(p => p.dataUrl));

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(name)}</title>
<meta name="description" content="${escapeAttr(description).slice(0, 160)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>
  :root {
    --paper: #f6f1e4;
    --ink: #202b26;
    --ink-soft: #4b5a54;
    --gold: #c9a13b;
    --line: #d8cdb2;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:'Inter',sans-serif; line-height:1.6; }
  h1 { font-family:'Fraunces', serif; }
  .hero { background:var(--ink); color:var(--paper); padding:64px 24px 48px; text-align:center; position:relative; }
  .hero::before { content:""; position:absolute; inset:10px; border:1px solid rgba(246,241,228,0.25); border-radius:4px; pointer-events:none; }
  .eyebrow { font-family:'Space Mono', monospace; text-transform:uppercase; letter-spacing:.14em; font-size:12px; color:var(--gold); margin:0 0 10px; }
  .hero h1 { font-size:clamp(30px,6vw,46px); margin:0 0 8px; }
  .hero .date { font-family:'Space Mono', monospace; font-size:13px; color:rgba(246,241,228,0.75); }
  main { max-width:760px; margin:0 auto; padding:36px 24px 80px; }
  .description { font-size:16px; color:var(--ink-soft); margin-bottom:32px; }
  h2 { font-family:'Fraunces', serif; font-size:20px; margin:0 0 14px; }
  .stamps { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:40px; }
  .stamp {
    --stamp-color:#2c4a52;
    font-family:'Space Mono', monospace; font-size:12.5px; text-transform:uppercase; letter-spacing:.03em;
    border:1.5px dashed var(--stamp-color); color:var(--stamp-color);
    border-radius:999px; padding:7px 14px; display:inline-block;
  }
  .stamp a { color:inherit; text-decoration:none; border-bottom:1px dotted currentColor; }
  .gallery { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px,1fr)); gap:10px; }
  .gallery img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px; border:1px solid var(--line); cursor:zoom-in; }
  #lightbox { display:none; position:fixed; inset:0; background:rgba(16,20,18,0.92); z-index:10; align-items:center; justify-content:center; flex-direction:column; padding:24px; }
  #lightbox.open { display:flex; }
  #lightbox img { max-width:min(900px,92vw); max-height:78vh; border-radius:10px; }
  #lightbox .nav { display:flex; gap:24px; margin-top:18px; }
  #lightbox button { background:none; border:1px solid rgba(246,241,228,0.4); color:var(--paper); font-family:'Space Mono',monospace; padding:8px 16px; border-radius:999px; cursor:pointer; }
  #lightbox button:hover { background:rgba(246,241,228,0.12); }
  footer { text-align:center; font-family:'Space Mono', monospace; font-size:11px; color:var(--ink-soft); padding:24px; }
</style>
</head>
<body>

<div class="hero">
  <p class="eyebrow">Cuaderno de viaje</p>
  <h1>${escapeHtml(name)}</h1>
  ${date ? `<p class="date">${escapeHtml(date)}</p>` : ''}
</div>

<main>
  ${description ? `<p class="description">${escapeHtml(description)}</p>` : ''}

  ${places.length ? `<h2>Lugares visitados</h2>
  <div class="stamps">
    ${placesHtml}
  </div>` : ''}

  <h2>Galería</h2>
  <div class="gallery">
    ${galleryHtml}
  </div>
</main>

<div id="lightbox">
  <img id="lightboxImg" src="" alt="">
  <div class="nav">
    <button onclick="stepLightbox(-1)">‹ Anterior</button>
    <button onclick="closeLightbox()">Cerrar</button>
    <button onclick="stepLightbox(1)">Siguiente ›</button>
  </div>
</div>

<footer>Generado con el creador de viajes NFC</footer>

<script>
  const photos = ${lightboxSources};
  let current = 0;
  function openLightbox(i) {
    current = i;
    document.getElementById('lightboxImg').src = photos[current];
    document.getElementById('lightbox').classList.add('open');
  }
  function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
  }
  function stepLightbox(delta) {
    current = (current + delta + photos.length) % photos.length;
    document.getElementById('lightboxImg').src = photos[current];
  }
  document.getElementById('lightbox').addEventListener('click', e => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
  document.addEventListener('keydown', e => {
    if (!document.getElementById('lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  });
<\/script>
</body>
</html>`;
}

function escapeAttr(str) {
  return (str || '').replace(/"/g, '&quot;');
}

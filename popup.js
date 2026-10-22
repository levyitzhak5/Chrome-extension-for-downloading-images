document.addEventListener('DOMContentLoaded', () => {
  const nameFormatInput = document.getElementById('nameFormat');
  const onlyVisibleCb = document.getElementById('onlyVisible');
  const convertJpegCb = document.getElementById('convertJpeg');
  const minSizeSelect = document.getElementById('minSize');
  const scanBtn = document.getElementById('scanBtn');
  const downloadBtn = document.getElementById('downloadBtn');
  const selectAllBtn = document.getElementById('selectAllBtn');
  const deselectAllBtn = document.getElementById('deselectAllBtn');
  const statusEl = document.getElementById('status');
  const previewEl = document.getElementById('preview');
  const previewNamesEl = document.getElementById('previewNames');
  const imageSection = document.getElementById('imageSection');
  const imageList = document.getElementById('imageList');
  const imageCount = document.getElementById('imageCount');

  /** @type {{url: string, type: string|null, selected: boolean}[]} */
  let collectedImages = [];

  // Restore last used settings
  chrome.storage.local.get(['nameFormat', 'minSize', 'convertJpeg'], (data) => {
    if (data?.nameFormat) {
      nameFormatInput.value = data.nameFormat;
    }
    if (data?.minSize !== undefined && data.minSize !== null) {
      minSizeSelect.value = String(data.minSize);
    }
    if (data?.convertJpeg !== undefined) {
      convertJpegCb.checked = Boolean(data.convertJpeg);
    }
  });

  nameFormatInput.addEventListener('input', () => {
    const val = nameFormatInput.value.trim() || 'image';
    chrome.storage.local.set({ nameFormat: val });
    updatePreview();
  });

  minSizeSelect.addEventListener('change', () => {
    chrome.storage.local.set({ minSize: parseInt(minSizeSelect.value, 10) || 0 });
  });

  convertJpegCb.addEventListener('change', () => {
    chrome.storage.local.set({ convertJpeg: convertJpegCb.checked });
  });

  function updatePreview() {
    const base = (nameFormatInput.value.trim() || 'image').replace(/[\\/:*?"<>|]/g, '_');
    const ext = convertJpegCb.checked ? '.jpg' : '.jpg';
    // First image has no numeric suffix, subsequent ones are _2, _3, _4...
    previewNamesEl.textContent = `${base}${ext} , ${base}_2${ext} , ${base}_3${ext} ...`;
    previewEl.style.display = 'block';
  }
  updatePreview();

  convertJpegCb.addEventListener('change', updatePreview);

  function setStatus(msg, type = '') {
    statusEl.textContent = msg;
    statusEl.className = type;
  }

  function selectedCount() {
    return collectedImages.filter((img) => img.selected).length;
  }

  function updateDownloadButton() {
    const n = selectedCount();
    downloadBtn.disabled = n === 0;
    downloadBtn.textContent = n === 0
      ? 'הורד תמונות מסומנות'
      : `הורד ${n} תמונות מסומנות`;
  }

  function updateCountLabel() {
    const total = collectedImages.length;
    const sel = selectedCount();
    imageCount.textContent = total === 0
      ? 'לא נמצאו תמונות'
      : `${sel} מתוך ${total} מסומנות`;
  }

  function renderImageList() {
    imageList.innerHTML = '';

    collectedImages.forEach((img, index) => {
      const item = document.createElement('div');
      item.className = 'image-item' + (img.selected ? ' selected' : '');
      item.dataset.index = String(index);

      const thumb = document.createElement('img');
      thumb.src = img.url;
      thumb.alt = '';
      thumb.loading = 'lazy';
      thumb.referrerPolicy = 'no-referrer';
      thumb.onerror = () => {
        thumb.style.opacity = '0.3';
      };

      const check = document.createElement('div');
      check.className = 'check';

      const idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = String(index + 1);

      item.appendChild(thumb);
      item.appendChild(check);
      item.appendChild(idx);

      item.addEventListener('click', () => {
        img.selected = !img.selected;
        item.classList.toggle('selected', img.selected);
        updateCountLabel();
        updateDownloadButton();
      });

      imageList.appendChild(item);
    });

    imageSection.style.display = collectedImages.length > 0 ? 'block' : 'none';
    updateCountLabel();
    updateDownloadButton();
  }

  async function requestImages() {
    const onlyVisible = onlyVisibleCb.checked;
    const minSize = parseInt(minSizeSelect.value, 10) || 0;
    const convertJpeg = convertJpegCb.checked;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('לא נמצא לשונית פעילה');
    }

    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, {
        action: 'collectImages',
        onlyVisible,
        minSize,
        convertJpeg
      });
    } catch (_) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      response = await chrome.tabs.sendMessage(tab.id, {
        action: 'collectImages',
        onlyVisible,
        minSize,
        convertJpeg
      });
    }

    if (!response?.ok) {
      throw new Error(response?.error || 'שגיאה באיסוף תמונות');
    }

    return response.images || [];
  }

  scanBtn.addEventListener('click', async () => {
    scanBtn.disabled = true;
    downloadBtn.disabled = true;
    const minSize = parseInt(minSizeSelect.value, 10) || 0;
    setStatus('סורק תמונות בעמוד...', 'loading');
    imageSection.style.display = 'none';
    collectedImages = [];

    try {
      const images = await requestImages();

      if (images.length === 0) {
        setStatus('לא נמצאו תמונות מתאימות בעמוד', 'error');
        return;
      }

      collectedImages = images.map((img) => ({
        url: img.url,
        type: img.type,
        selected: true
      }));

      renderImageList();
      const sizeNote = minSize > 0 ? ` (מעל ${minSize}×${minSize})` : '';
      setStatus(`נמצאו ${images.length} תמונות${sizeNote} – סמן/בטל סימון ולחץ הורד`, 'success');
    } catch (err) {
      console.error(err);
      setStatus('שגיאה: ' + (err.message || 'לא ניתן לגשת לעמוד'), 'error');
    } finally {
      scanBtn.disabled = false;
    }
  });

  selectAllBtn.addEventListener('click', () => {
    collectedImages.forEach((img) => { img.selected = true; });
    renderImageList();
  });

  deselectAllBtn.addEventListener('click', () => {
    collectedImages.forEach((img) => { img.selected = false; });
    renderImageList();
  });

  downloadBtn.addEventListener('click', async () => {
    const toDownload = collectedImages.filter((img) => img.selected);
    if (toDownload.length === 0) return;

    const baseName = (nameFormatInput.value.trim() || 'image').replace(/[\\/:*?"<>|]/g, '_');

    downloadBtn.disabled = true;
    scanBtn.disabled = true;
    setStatus(`מוריד ${toDownload.length} תמונות...`, 'loading');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < toDownload.length; i++) {
      const img = toDownload[i];
      let ext = getExtension(img.url, img.type);

      // If convertJpeg is on, force .jpg extension
      if (convertJpegCb.checked) {
        ext = '.jpg';
      }

      // First image gets no numeric suffix (just baseName.ext).
      // Subsequent images get _2, _3, _4, ...
      const filename = i === 0
        ? `${baseName}${ext}`
        : `${baseName}_${i + 1}${ext}`;

      try {
        await chrome.downloads.download({
          url: img.url,
          filename: filename,
          conflictAction: 'uniquify',
          saveAs: false
        });
        successCount++;
      } catch (err) {
        console.warn('Failed to download:', img.url, err);
        failCount++;
      }
    }

    if (failCount === 0) {
      setStatus(`✓ הורדו בהצלחה ${successCount} תמונות`, 'success');
    } else {
      setStatus(
        `הורדו ${successCount} תמונות, ${failCount} נכשלו`,
        failCount > successCount ? 'error' : 'loading'
      );
    }

    downloadBtn.disabled = false;
    scanBtn.disabled = false;
    updateDownloadButton();
  });
});

function getExtension(url, typeHint) {
  // Handle data URLs (e.g. from JPEG conversion)
  if (url.startsWith('data:')) {
    const m = url.match(/^data:image\/([a-zA-Z0-9+.-]+);/);
    if (m) {
      const t = m[1].toLowerCase();
      if (t === 'jpeg' || t === 'jpg') return '.jpg';
      if (['png', 'gif', 'webp', 'bmp', 'svg+xml', 'avif'].includes(t)) {
        return '.' + (t === 'svg+xml' ? 'svg' : t);
      }
    }
    return '.jpg';
  }

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    if (match) {
      const ext = match[1].toLowerCase();
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(ext)) {
        return '.' + (ext === 'jpeg' ? 'jpg' : ext);
      }
    }
  } catch (_) {}

  if (typeHint) {
    const t = typeHint.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'avif'].includes(t)) {
      return '.' + (t === 'jpeg' ? 'jpg' : t);
    }
  }

  return '.jpg';
}
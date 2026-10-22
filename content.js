/**
 * Content script – runs in the context of every page.
 * - Injects a fixed status badge (top-right) with close button
 * - Listens for messages from the popup and returns the best image URLs found
 */

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|bmp|svg|avif)(\?|#|$)/i;
const BADGE_ID = 'img-dl-ext-active-badge';

const LAZY_ATTRS = [
  'data-src',
  'data-lazy-src',
  'data-original',
  'data-full',
  'data-full-src',
  'data-large',
  'data-large-src',
  'data-zoom',
  'data-zoom-src',
  'data-zoom-image',
  'data-hi-res',
  'data-highres',
  'data-srcset',
  'data-lazy-srcset',
  'data-bg',
  'data-background',
  'data-image',
  'data-url'
];

/* ── Status badge (fixed top-right) ─────────────────────────── */

function injectBadge() {
  if (document.getElementById(BADGE_ID)) return;

  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.setAttribute('dir', 'rtl');
  badge.innerHTML =
    '<span class="img-dl-dot"></span>' +
    '<span class="img-dl-text">תוסף הורדת התמונות פעיל</span>' +
    '<button type="button" class="img-dl-close" title="סגור" aria-label="סגור">×</button>';

  const style = document.createElement('style');
  style.textContent = `
    #${BADGE_ID} {
      position: fixed !important;
      top: 12px !important;
      right: 12px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      padding: 8px 10px 8px 14px !important;
      background: #111 !important;
      color: #fff !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      line-height: 1.3 !important;
      border-radius: 8px !important;
      box-shadow: 0 2px 12px rgba(0,0,0,0.35) !important;
      pointer-events: auto !important;
      direction: rtl !important;
      opacity: 0.92 !important;
      cursor: default !important;
    }
    #${BADGE_ID} .img-dl-dot {
      width: 8px !important;
      height: 8px !important;
      border-radius: 50% !important;
      background: #40c057 !important;
      flex-shrink: 0 !important;
      box-shadow: 0 0 6px #40c057 !important;
    }
    #${BADGE_ID} .img-dl-text {
      white-space: nowrap !important;
      color: #fff !important;
    }
    #${BADGE_ID} .img-dl-close {
      margin: 0 !important;
      margin-right: 2px !important;
      padding: 0 !important;
      width: 20px !important;
      height: 20px !important;
      border: none !important;
      border-radius: 4px !important;
      background: transparent !important;
      color: #adb5bd !important;
      font-size: 18px !important;
      font-weight: 700 !important;
      line-height: 1 !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-shrink: 0 !important;
      transition: color 0.15s, background 0.15s !important;
    }
    #${BADGE_ID} .img-dl-close:hover {
      color: #fff !important;
      background: rgba(255,255,255,0.15) !important;
    }
  `;

  (document.head || document.documentElement).appendChild(style);
  (document.body || document.documentElement).appendChild(badge);

  badge.querySelector('.img-dl-close').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    badge.remove();
  });
}

if (document.body) {
  injectBadge();
} else {
  document.addEventListener('DOMContentLoaded', injectBadge);
}

/* ── Image collection helpers ───────────────────────────────── */

function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:')) return false;
  try {
    const u = new URL(url, location.href);
    return IMAGE_EXT.test(u.pathname) || IMAGE_EXT.test(u.href);
  } catch {
    return false;
  }
}

function absUrl(url) {
  try {
    return new URL(url, location.href).href;
  } catch {
    return null;
  }
}

function bestFromSrcset(srcset) {
  if (!srcset) return null;
  let best = null;
  let bestW = -1;
  for (const part of srcset.split(',')) {
    const bits = part.trim().split(/\s+/);
    const url = bits[0];
    if (!url) continue;
    let w = 0;
    if (bits[1]) {
      const m = bits[1].match(/(\d+)w/);
      if (m) w = parseInt(m[1], 10);
      else {
        const d = bits[1].match(/([\d.]+)x/);
        if (d) w = parseFloat(d[1]) * 1000;
      }
    }
    if (w >= bestW) {
      bestW = w;
      best = url;
    }
  }
  return best ? absUrl(best) : null;
}

function pickBestUrl(img) {
  const candidates = [];

  let el = img.parentElement;
  for (let i = 0; i < 4 && el; i++) {
    if (el.tagName === 'A' && el.href && isImageUrl(el.href)) {
      candidates.push(absUrl(el.href));
      break;
    }
    el = el.parentElement;
  }

  for (const attr of LAZY_ATTRS) {
    const val = img.getAttribute(attr);
    if (!val) continue;
    if (attr.includes('srcset')) {
      const best = bestFromSrcset(val);
      if (best) candidates.push(best);
    } else if (isImageUrl(val) || val.startsWith('http') || val.startsWith('/')) {
      const u = absUrl(val);
      if (u) candidates.push(u);
    }
  }

  if (img.srcset) {
    const best = bestFromSrcset(img.srcset);
    if (best) candidates.push(best);
  }

  const current = img.currentSrc || img.src;
  if (current && !current.startsWith('data:')) {
    const u = absUrl(current);
    if (u) candidates.push(u);
  }

  for (const c of candidates) {
    if (c && !c.startsWith('data:')) return c;
  }
  return null;
}

/**
 * Get effective image dimensions for filtering.
 * Prefer natural size; fall back to rendered size / attributes.
 * Returns {w, h} – either can be 0 if unknown.
 */
function getImageSize(img) {
  // Try natural size first
  let w = img.naturalWidth || 0;
  let h = img.naturalHeight || 0;

  // If natural size is known and valid, use it
  if (w > 0 && h > 0) {
    return { w, h };
  }

  // Try to get size from the "best" URL by creating a temporary Image
  // (this helps with lazy-loaded images where naturalWidth is 0)
  const bestUrl = pickBestUrl(img);
  if (bestUrl) {
    // We'll handle this asynchronously in the caller
    return { w: 0, h: 0, pendingUrl: bestUrl };
  }

  // Rendered size in the layout
  const rect = img.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    return { w: Math.round(rect.width), h: Math.round(rect.height) };
  }

  // HTML width/height attributes
  const attrW = parseInt(img.getAttribute('width'), 10) || 0;
  const attrH = parseInt(img.getAttribute('height'), 10) || 0;
  if (attrW > 0 && attrH > 0) {
    return { w: attrW, h: attrH };
  }

  // CSS pixel size
  const style = window.getComputedStyle(img);
  const cssW = parseFloat(style.width) || 0;
  const cssH = parseFloat(style.height) || 0;
  if (cssW > 0 && cssH > 0) {
    return { w: Math.round(cssW), h: Math.round(cssH) };
  }

  return { w: 0, h: 0 };
}

/**
 * Load an image URL and return its natural dimensions.
 * Used as a fallback for lazy-loaded images with unknown size.
 */
function loadImageSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 0, h: 0 });
    img.src = url;
  });
}

/**
 * Convert an image URL to a JPEG data URL using canvas.
 * Returns null if conversion fails (e.g. CORS).
 */
function convertToJpeg(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        // Fill with white background (JPEG doesn't support transparency)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
        resolve(dataUrl);
      } catch (e) {
        // CORS error or canvas tainted
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * @param {boolean} onlyVisible
 * @param {number} minSize – minimum width AND height in px (0 = no filter)
 * @param {boolean} convertJpeg – convert all images to JPEG
 */
async function collectImages(onlyVisible, minSize, convertJpeg) {
  const imgs = Array.from(document.querySelectorAll('img'));
  const seen = new Set();
  const result = [];
  const threshold = Number(minSize) || 0;

  for (const img of imgs) {
    if (onlyVisible) {
      const style = window.getComputedStyle(img);
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        parseFloat(style.opacity) === 0
      ) {
        continue;
      }
      const rect = img.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
    }

    const url = pickBestUrl(img);
    if (!url || seen.has(url)) continue;
    seen.add(url);

    // Filter by size
    if (threshold > 0) {
      let { w, h } = getImageSize(img);

      // If size is unknown, try loading the image to get its natural size
      if (w === 0 && h === 0) {
        try {
          const loaded = await loadImageSize(url);
          w = loaded.w;
          h = loaded.h;
        } catch (_) {
          // ignore
        }
      }

      // If we still don't know the size, skip (can't verify)
      if (w === 0 || h === 0) {
        continue;
      }

      // Skip if EITHER dimension is below threshold
      if (w < threshold || h < threshold) {
        continue;
      }
    }

    let finalUrl = url;
    let type = null;

    // Try to convert to JPEG if requested
    if (convertJpeg) {
      const jpegDataUrl = await convertToJpeg(url);
      if (jpegDataUrl) {
        finalUrl = jpegDataUrl;
        type = 'jpeg';
      } else {
        // Conversion failed (CORS) – keep original
        try {
          const m = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
          if (m) type = m[1];
        } catch (_) {}
      }
    } else {
      try {
        const m = new URL(url).pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
        if (m) type = m[1];
      } catch (_) {}
    }

    result.push({ url: finalUrl, type, width: 0, height: 0 });
  }

  return result;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.action === 'collectImages') {
    (async () => {
      try {
        const minSize = Number(message.minSize) || 0;
        const onlyVisible = Boolean(message.onlyVisible);
        const convertJpeg = Boolean(message.convertJpeg);
        console.log('[ImageDownloader] collectImages', { onlyVisible, minSize, convertJpeg });
        const images = await collectImages(onlyVisible, minSize, convertJpeg);
        console.log('[ImageDownloader] found', images.length, 'images');
        sendResponse({ ok: true, images });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || String(err) });
      }
    })();
    return true; // keep the message channel open for async response
  }
});
/**
 * Shared browser-source runtime for images. Remote profile pictures, alert
 * artwork, and Spotify covers are routed through ilyStream's same-origin
 * cache; missing avatars fall back to a deterministic inline SVG.
 */
export const INLINE_AVATAR_RUNTIME_SCRIPT = `<script id="ilystream-avatar-runtime">
(function(){
  if (window.__ilyAvatar) return;

  var MEDIA_CACHE_VERSION = '3';
  var MEDIA_REFRESH_BUCKET_MS = 5 * 60 * 1000;
  var MEDIA_LOAD_TIMEOUT_MS = 8000;

  function escapeXml(value){
    return String(value).replace(/[&<>"']/g, function(char){
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char];
    });
  }

  function fallback(name){
    var text = String(name || '?').trim();
    var initial = text.charAt(0).toUpperCase() || '?';
    var hash = 0;
    for (var i = 0; i < text.length; i++) hash = ((hash * 31) + text.charCodeAt(i)) >>> 0;
    var hue = hash % 360;
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<rect width="100" height="100" rx="50" fill="hsl(' + hue + ' 58% 34%)"/>' +
      '<text x="50" y="55" text-anchor="middle" dominant-baseline="middle" fill="white" font-family="Segoe UI,Arial,sans-serif" font-size="46" font-weight="700">' +
      escapeXml(initial) + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function encodeRemoteUrl(value){
    return btoa(unescape(encodeURIComponent(value))).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
  }

  function mediaRevision(revision){
    if (revision !== undefined && revision !== null && String(revision).trim()) {
      return String(revision).trim();
    }
    return String(Math.floor(Date.now() / MEDIA_REFRESH_BUCKET_MS));
  }

  function versionUrl(url, revision){
    if (!url.searchParams.has('v')) url.searchParams.set('v', MEDIA_CACHE_VERSION);
    url.searchParams.set('r', mediaRevision(revision));
    return url.href;
  }

  function proxy(value, revision){
    if (typeof value !== 'string' || !value.trim()) return '';
    if (/^data:image\\//i.test(value)) return value;
    try {
      var parsed = new URL(value, window.location.href);
      if (parsed.origin === window.location.origin) return versionUrl(parsed, revision);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      var proxyUrl = new URL('/avatar/' + encodeRemoteUrl(parsed.href), window.location.href);
      // The fixed version invalidates responses from older runtimes. The
      // revision changes per media item (or every five minutes by default), so
      // a long-lived OBS network process cannot pin a failed/stale response.
      return versionUrl(proxyUrl, revision);
    } catch (err) {
      return '';
    }
  }

  function resolve(value, name, revision){
    return proxy(value, revision) || fallback(name);
  }

  function fallbackImage(image, name){
    if (!image) return;
    image.onerror = null;
    image.src = fallback(name || image.dataset.initial || image.dataset.name || '?');
  }

  function apply(image, name, value, revision){
    if (!image) return;
    image.dataset.initial = String(name || '?').trim().charAt(0) || '?';
    image.onerror = function(){ fallbackImage(image, name); };
    image.src = resolve(value, name, revision);
  }

  function applyBackground(element, value, revision){
    if (!element) return Promise.resolve(false);
    var generation = Number(element.__ilyImageGeneration || 0) + 1;
    element.__ilyImageGeneration = generation;
    // Clear the old cover immediately. A late load from the previous track
    // must never remain visible while the new image is in flight.
    element.style.backgroundImage = '';
    var resolved = proxy(value, revision);
    if (!resolved || typeof window.Image !== 'function') return Promise.resolve(false);

    return new Promise(function(resolvePromise){
      var loader = new window.Image();
      var settled = false;
      var timer = setTimeout(function(){ finish(false); }, MEDIA_LOAD_TIMEOUT_MS);
      function finish(success){
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        loader.onload = null;
        loader.onerror = null;
        if (success && element.__ilyImageGeneration === generation) {
          element.style.backgroundImage = 'url("' + resolved.replace(/"/g, '%22') + '")';
        }
        resolvePromise(Boolean(success && element.__ilyImageGeneration === generation));
      }
      loader.decoding = 'async';
      loader.onload = function(){ finish(true); };
      loader.onerror = function(){ finish(false); };
      loader.src = resolved;
      if (loader.complete && loader.naturalWidth > 0) {
        setTimeout(function(){ finish(true); }, 0);
      }
    });
  }

  window.__ilyAvatar = {
    proxy: proxy,
    resolve: resolve,
    fallback: fallback,
    fallbackImage: fallbackImage,
    apply: apply,
    applyBackground: applyBackground
  };
})();
</script>`

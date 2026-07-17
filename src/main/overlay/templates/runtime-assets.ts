/**
 * Shared browser-source runtime for avatars. Remote profile pictures are
 * routed through ilyStream's same-origin cache; missing or unavailable images
 * fall back to a deterministic inline SVG and never require the internet.
 */
export const INLINE_AVATAR_RUNTIME_SCRIPT = `<script id="ilystream-avatar-runtime">
(function(){
  if (window.__ilyAvatar) return;

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

  function proxy(value){
    if (typeof value !== 'string' || !value.trim()) return '';
    if (/^data:image\\//i.test(value)) return value;
    try {
      var parsed = new URL(value, window.location.href);
      if (parsed.origin === window.location.origin) return parsed.href;
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      var proxyUrl = new URL('/avatar/' + encodeRemoteUrl(parsed.href), window.location.href);
      // Version the browser-facing URL so long-lived OBS sources cannot retain
      // avatar responses cached before content-type detection was corrected.
      proxyUrl.searchParams.set('v', '2');
      return proxyUrl.href;
    } catch (err) {
      return '';
    }
  }

  function resolve(value, name){
    return proxy(value) || fallback(name);
  }

  function fallbackImage(image, name){
    if (!image) return;
    image.onerror = null;
    image.src = fallback(name || image.dataset.initial || image.dataset.name || '?');
  }

  function apply(image, name, value){
    if (!image) return;
    image.dataset.initial = String(name || '?').trim().charAt(0) || '?';
    image.onerror = function(){ fallbackImage(image, name); };
    image.src = resolve(value, name);
  }

  window.__ilyAvatar = { proxy: proxy, resolve: resolve, fallback: fallback, fallbackImage: fallbackImage, apply: apply };
})();
</script>`

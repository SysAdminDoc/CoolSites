(function () {
  const currentScript = document.currentScript;
  const baseUrl = new URL(currentScript?.src || './widget.js', document.baseURI);
  const rootUrl = new URL('.', baseUrl);
  const category = currentScript?.dataset.category || '';
  const limit = Number.parseInt(currentScript?.dataset.limit || '8', 10);
  const targetSelector = currentScript?.dataset.target || '';
  const target = targetSelector ? document.querySelector(targetSelector) : currentScript?.parentElement;

  if (!target) return;

  const host = document.createElement('coolsites-widget');
  const shadow = host.attachShadow({ mode: 'open' });
  target.appendChild(host);

  shadow.innerHTML = `
    <style>
      :host{display:block;color:#e8e9ed;font:14px/1.45 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .wrap{background:#12141c;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:14px}
      .head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
      .title{font-size:14px;font-weight:700}
      .link{color:#8ab4f8;text-decoration:none;font-size:12px}
      .items{display:grid;gap:8px}
      .item{display:block;padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:6px;background:rgba(255,255,255,.025);text-decoration:none;color:inherit}
      .item:hover{border-color:rgba(138,180,248,.45);background:rgba(138,180,248,.08)}
      .name{font-weight:700;margin-bottom:3px}
      .desc{color:#a4a6b3;font-size:12px}
      .meta{color:#7d8190;font-size:11px;margin-top:6px}
      .empty{color:#a4a6b3}
    </style>
    <div class="wrap">
      <div class="head">
        <div class="title">CoolSites${category ? `: ${escapeHtml(category)}` : ''}</div>
        <a class="link" href="${rootUrl.href}" target="_blank" rel="noopener noreferrer">Open directory</a>
      </div>
      <div class="items"><div class="empty">Loading...</div></div>
    </div>
  `;

  fetch(new URL('sites.json', rootUrl))
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(sites => {
      const filtered = sites
        .filter(site => !category || site.category === category)
        .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 8);
      const container = shadow.querySelector('.items');
      if (!filtered.length) {
        container.innerHTML = '<div class="empty">No sites found.</div>';
        return;
      }
      container.innerHTML = filtered.map(site => `
        <a class="item" href="${escapeAttr(site.url)}" target="_blank" rel="noopener noreferrer">
          <div class="name">${escapeHtml(site.name)}</div>
          <div class="desc">${escapeHtml(site.description)}</div>
          <div class="meta">${escapeHtml(site.category)}</div>
        </a>
      `).join('');
    })
    .catch(() => {
      shadow.querySelector('.items').innerHTML = '<div class="empty">Unable to load CoolSites.</div>';
    });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }
})();

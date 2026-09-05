// CoolSites embeddable widget.
//
//   <script src="https://your-host/CoolSites/widget.js"
//           data-category="Homelab"
//           data-limit="8"
//           data-target="#sidebar"
//           data-theme="auto"></script>
//
// Contract, all optional:
//   data-category  show only this category, exactly as spelled in the directory
//   data-limit     how many entries, 1 to 50, default 8
//   data-target    CSS selector for where to mount; defaults to the script's parent
//   data-theme     "auto" (default), "light" or "dark"
//
// Colours come from CSS custom properties you can set on the host page, so the
// widget can be made to match a site it knows nothing about:
//
//   coolsites-widget {
//     --coolsites-bg: #fff;
//     --coolsites-text: #111;
//     --coolsites-muted: #666;
//     --coolsites-border: rgba(0,0,0,.12);
//     --coolsites-accent: #2563eb;
//     --coolsites-radius: 8px;
//   }
//
// It renders into a shadow root, makes exactly one request, to sites.json beside
// itself, and sends nothing anywhere.

(function () {
  'use strict';

  const VERSION = '1.1.0';
  const DEFAULT_LIMIT = 8;
  const MAX_LIMIT = 50;
  const TIMEOUT_MS = 10000;

  const currentScript = document.currentScript;
  if (!currentScript) return;

  const baseUrl = new URL(currentScript.src || './widget.js', document.baseURI);
  const rootUrl = new URL('.', baseUrl);
  const category = currentScript.dataset.category || '';
  const targetSelector = currentScript.dataset.target || '';
  const theme = ['light', 'dark'].includes(currentScript.dataset.theme) ? currentScript.dataset.theme : 'auto';

  // A limit of 0, -1 or "eight" all mean the author made a mistake, so fall back
  // rather than rendering an empty box they will not understand.
  const requested = Number.parseInt(currentScript.dataset.limit || '', 10);
  const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT;

  const target = targetSelector ? document.querySelector(targetSelector) : currentScript.parentElement;
  if (!target) {
    // Silence here means an embedder stares at a blank page with no idea why.
    console.warn(`CoolSites widget: nothing matches data-target="${targetSelector}", so it has nowhere to render.`);
    return;
  }

  const host = document.createElement('coolsites-widget');
  host.dataset.version = VERSION;
  if (theme !== 'auto') host.dataset.theme = theme;
  const shadow = host.attachShadow({ mode: 'open' });
  target.appendChild(host);

  const headingId = `coolsites-heading-${Math.random().toString(36).slice(2, 9)}`;
  const title = category ? `CoolSites: ${category}` : 'CoolSites';

  // Light is the base and dark is the override, so a host page that sets only
  // some variables still gets a coherent result either way.
  shadow.innerHTML = `
    <section class="wrap" aria-labelledby="${headingId}">
      <div class="head">
        <h2 class="title" id="${headingId}">${escapeHtml(title)}</h2>
        <a class="link" href="${escapeAttr(rootUrl.href)}" target="_blank" rel="noopener noreferrer">Open directory</a>
      </div>
      <div class="body" aria-live="polite" aria-busy="true"><p class="note">Loading...</p></div>
    </section>
  `;

  // A style element inside a shadow root is still governed by the host page's
  // style-src, so a widget that injects one cannot be embedded anywhere with a
  // strict policy. A constructed stylesheet is CSSOM, which CSP does not cover,
  // so this works under any policy and needs no hash from the embedder.
  const SHEET = "      :host {\n        --bg: var(--coolsites-bg, #ffffff);\n        --text: var(--coolsites-text, #1a1c23);\n        --muted: var(--coolsites-muted, #5c6070);\n        --border: var(--coolsites-border, rgba(0, 0, 0, 0.12));\n        --accent: var(--coolsites-accent, #3457c9);\n        --radius: var(--coolsites-radius, 8px);\n        display: block;\n        color: var(--text);\n        font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif;\n      }\n      @media (prefers-color-scheme: dark) {\n        :host(:not([data-theme=\"light\"])) {\n          --bg: var(--coolsites-bg, #12141c);\n          --text: var(--coolsites-text, #e8e9ed);\n          --muted: var(--coolsites-muted, #a4a6b3);\n          --border: var(--coolsites-border, rgba(255, 255, 255, 0.12));\n          --accent: var(--coolsites-accent, #8ab4f8);\n        }\n      }\n      :host([data-theme=\"dark\"]) {\n        --bg: var(--coolsites-bg, #12141c);\n        --text: var(--coolsites-text, #e8e9ed);\n        --muted: var(--coolsites-muted, #a4a6b3);\n        --border: var(--coolsites-border, rgba(255, 255, 255, 0.12));\n        --accent: var(--coolsites-accent, #8ab4f8);\n      }\n      .wrap { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }\n      .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; }\n      .title { font-size: 14px; font-weight: 700; margin: 0; }\n      .link { color: var(--accent); text-decoration: none; font-size: 12px; }\n      .link:hover, .link:focus-visible { text-decoration: underline; }\n      ul.items { display: grid; gap: 8px; list-style: none; margin: 0; padding: 0; }\n      .item {\n        display: block; padding: 10px; border: 1px solid var(--border);\n        border-radius: calc(var(--radius) - 2px); text-decoration: none; color: inherit;\n      }\n      .item:hover, .item:focus-visible { border-color: var(--accent); }\n      .item:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }\n      /* Spans, because they live inside the anchor, so they need to be told. */\n      .name { display: block; font-weight: 700; margin-bottom: 3px; }\n      .desc { display: block; color: var(--muted); font-size: 12px; }\n      .meta { display: block; color: var(--muted); font-size: 11px; margin-top: 6px; }\n      .note { color: var(--muted); margin: 0; }\n      @media (prefers-reduced-motion: no-preference) {\n        .item { transition: border-color 0.15s ease; }\n      }";
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(SHEET);
    shadow.adoptedStyleSheets = [sheet];
  } catch {
    // Older engines without constructable stylesheets. The element form needs
    // the embedder to allow inline styles, which is the trade this avoids where
    // it can rather than failing to render at all.
    const fallback = document.createElement('style');
    fallback.textContent = SHEET;
    shadow.appendChild(fallback);
  }


  const body = shadow.querySelector('.body');

  function done(html) {
    body.setAttribute('aria-busy', 'false');
    body.innerHTML = html;
  }

  fetch(new URL('sites.json', rootUrl), { signal: AbortSignal.timeout(TIMEOUT_MS) })
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(sites => {
      if (!Array.isArray(sites)) throw new Error('sites.json is not a list');

      if (category && !sites.some(site => site.category === category)) {
        // Naming the category turns a mystifying empty box into an obvious typo.
        done(`<p class="note">No category called "${escapeHtml(category)}" in this directory.</p>`);
        return;
      }

      const filtered = sites.filter(site => !category || site.category === category).slice(0, limit);
      if (!filtered.length) {
        done('<p class="note">Nothing to show yet.</p>');
        return;
      }

      done(`<ul class="items">${filtered.map(site => `
        <li><a class="item" href="${escapeAttr(site.url)}" target="_blank" rel="nofollow ugc noopener noreferrer">
          <span class="name">${escapeHtml(site.name)}</span>
          <span class="desc">${escapeHtml(site.description)}</span>
          <span class="meta">${escapeHtml(site.category)}</span>
        </a></li>`).join('')}</ul>`);
    })
    .catch(error => {
      const offline = navigator.onLine === false;
      const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      done(`<p class="note">${escapeHtml(
        offline ? 'You appear to be offline.'
          : timedOut ? 'The directory took too long to answer.'
          : 'Unable to load CoolSites.'
      )}</p>`);
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

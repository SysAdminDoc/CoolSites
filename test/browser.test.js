'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const WAIT_STEP_MS = 100;
const SITES = JSON.parse(fs.readFileSync(path.join(ROOT, 'sites.json'), 'utf8'));

test('CoolSites golden path works in a real browser', { timeout: 90000 }, async () => {
  let server = await startLocalServer();
  const chrome = await startChrome();
  let connection;
  let page;

  try {
    connection = await CdpConnection.connect(chrome.webSocketUrl);
    page = await createPage(connection, server.url);
    await waitFor(page, "document.readyState === 'complete' && document.querySelectorAll('#grid .card').length > 0");
    await page.evaluate('localStorage.clear()');
    await page.send('Page.reload', { ignoreCache: true });
    await delay(500);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");

    const initial = await page.evaluate(`({
      cards: document.querySelectorAll('#grid .card').length,
      dialogs: document.querySelectorAll('dialog[open]').length,
      dataStatusHidden: document.getElementById('dataStatus').hidden,
      unnamedButtons: [...document.querySelectorAll('button')].filter(button =>
        !button.getAttribute('aria-label') && !button.getAttribute('title') && !button.textContent.trim()
      ).length
    })`);
    assert.equal(initial.dialogs, 0, 'closed native dialogs must not render open');
    assert.equal(initial.dataStatusHidden, true, 'online data should not show the offline status');
    assert.equal(initial.unnamedButtons, 0, 'icon-only controls need an accessible name');
    assert.ok(initial.cards > 0, 'the directory should render cards');

    // test/outbound-links.test.js gates the templates. This checks the DOM they
    // actually produce, because a rel attribute is only worth anything if it
    // survives rendering.
    const outbound = await page.evaluate(`(() => {
      const links = [...document.querySelectorAll('#grid .card a[href]')]
        .filter(a => !a.href.startsWith('https://web.archive.org/'));
      return {
        total: links.length,
        nofollowed: links.filter(a => a.rel.includes('nofollow') && a.rel.includes('ugc')).length
      };
    })()`);
    assert.ok(outbound.total > 0, 'cards should link out to the sites they describe');
    assert.equal(outbound.nofollowed, outbound.total, 'every link to a listed site must be rel="nofollow ugc"');

    await page.evaluate("document.body.focus(); document.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))");
    await waitFor(page, "document.getElementById('shortcutsModal').open");
    await page.evaluate("document.getElementById('shortcutsClose').click()");
    await waitFor(page, "!document.getElementById('shortcutsModal').open");
    await page.evaluate("if (document.getElementById('dockWrapper').classList.contains('collapsed')) document.getElementById('dockToggle').click()");
    await waitFor(page, "!document.getElementById('dockWrapper').classList.contains('collapsed')");
    await page.evaluate("document.getElementById('newGroupBtn').focus(); document.getElementById('newGroupBtn').click()");
    await waitFor(page, "document.getElementById('groupModal').open");
    await page.evaluate("document.getElementById('modalCancel').click()");
    await waitFor(page, "!document.getElementById('groupModal').open");
    await waitFor(page, "document.activeElement.id === 'newGroupBtn'");
    assert.equal(await page.evaluate("document.activeElement.id"), 'newGroupBtn', 'closing the group dialog should restore focus');

    // Category and group colours used to live in style attributes, which a CSP
    // hash cannot cover. They are set through the CSSOM now, and the failure
    // mode if that ever stops running is silent: every card renders with the
    // fallback accent and nothing throws.
    const accents = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('#grid .card')].slice(0, 40);
      const applied = cards.filter(card => card.style.getPropertyValue('--accent') === card.dataset.accent && card.dataset.accent);
      const painted = new Set(cards.map(card => getComputedStyle(card.querySelector('.card-category')).color));
      return { cards: cards.length, applied: applied.length, distinctCategoryColours: painted.size };
    })()`);
    assert.equal(accents.applied, accents.cards, 'every card should carry the accent its data attribute names');
    assert.ok(accents.distinctCategoryColours > 1, 'category badges should still be coloured per category, not all one colour');

    // A filtered view was shareable but not navigable: Back left the site
    // instead of undoing the filter, because every render replaced the history
    // entry rather than adding one.
    const beforeFilter = await page.evaluate('location.search');
    // Whichever category pill the rail actually rendered: the list is capped
    // until someone expands it, so naming one by hand makes the test depend on
    // the order of categories.json.
    const chosenCategory = await page.evaluate(`(() => {
      const pill = [...document.querySelectorAll('#filters .filter-btn')]
        .find(button => button.dataset.cat && !['All', 'Bookmarks'].includes(button.dataset.cat));
      pill.click();
      return pill.dataset.cat;
    })()`);
    await waitFor(page, `new URLSearchParams(location.search).get('cat') === ${JSON.stringify(chosenCategory)}`);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0 && document.querySelectorAll('#grid .card').length < 100");
    const filteredCount = await page.evaluate("document.querySelectorAll('#grid .card').length");

    await page.send('Runtime.evaluate', { expression: 'history.back()' });
    await waitFor(page, `location.search === ${JSON.stringify(beforeFilter)}`);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 100");
    const restored = await page.evaluate(`({
      pill: document.querySelector('#filters .filter-btn.active')?.dataset.cat,
      search: document.getElementById('searchInput').value
    })`);
    assert.equal(restored.pill, 'All', 'Back should put the category pill back too, not just the grid');
    assert.equal(restored.search, '', 'Back should leave the search box as it was');

    await page.send('Runtime.evaluate', { expression: 'history.forward()' });
    await waitFor(page, `new URLSearchParams(location.search).get('cat') === ${JSON.stringify(chosenCategory)}`);
    await waitFor(page, "document.querySelectorAll('#grid .card').length < 100");
    assert.equal(await page.evaluate("document.querySelectorAll('#grid .card').length"), filteredCount,
      'Forward should land on the same result set Back came from');
    await page.send('Runtime.evaluate', { expression: 'history.back()' });
    await waitFor(page, `location.search === ${JSON.stringify(beforeFilter)}`);

    // Typing must not fill the back stack with one entry per character.
    const depthBefore = await page.evaluate('history.length');
    await searchFor(page, 'cloudflare');
    await waitFor(page, "new URLSearchParams(location.search).get('q') === 'cloudflare'");
    const depthAfter = await page.evaluate('history.length');
    assert.ok(depthAfter - depthBefore <= 1, `typing ten characters added ${depthAfter - depthBefore} history entries`);
    await page.send('Runtime.evaluate', { expression: 'history.back()' });
    await waitFor(page, "!new URLSearchParams(location.search).get('q')");
    assert.equal(await page.evaluate("document.getElementById('searchInput').value"), '', 'one Back should leave the whole search');

    // The link check is only worth running if a reader can see the result.
    const linkHealth = await page.evaluate(`(() => {
      const badges = [...document.querySelectorAll('#grid .card .link-badge')];
      return { total: badges.length, dated: badges.filter(b => /checked \\d{4}-\\d{2}-\\d{2}/.test(b.textContent)).length };
    })()`);
    assert.ok(linkHealth.total > 0, 'cards should show when their link was last checked');
    assert.equal(linkHealth.dated, linkHealth.total, 'every link badge should carry the date it was checked');

    await page.evaluate("document.getElementById('linkIssuesOnlyBtn').click()");
    // aria-pressed is set synchronously but the grid re-renders inside a view
    // transition, so waiting on the button measures the unfiltered grid. Wait
    // for the result set itself to shrink.
    await waitFor(page, "document.getElementById('linkIssuesOnlyBtn').getAttribute('aria-pressed') === 'true' && document.querySelectorAll('#grid .card').length > 0 && document.querySelectorAll('#grid .card').length < 100");
    const issues = await page.evaluate(`(() => {
      const badges = [...document.querySelectorAll('#grid .card .link-badge')];
      return {
        shown: Number(document.getElementById('resultsCount').textContent.replace(/\\D.*$/, '')),
        allFlagged: badges.length > 0 && badges.every(b => b.classList.contains('has-issue')),
        url: location.search
      };
    })()`);
    assert.ok(issues.allFlagged, 'the link-issues filter should show only entries whose link did not answer normally');
    assert.match(issues.url, /linkissues=1/, 'the filter should be shareable as a URL');
    await page.evaluate("document.getElementById('linkIssuesOnlyBtn').click()");
    await waitFor(page, "document.getElementById('linkIssuesOnlyBtn').getAttribute('aria-pressed') === 'false'");

    // Splitting tags into a facet vocabulary and a keyword tail is only safe if
    // the tail is still searchable. These five terms exist nowhere in their
    // entry's name, description or tags: keywords is the only thing that can
    // find them, so they fail closed if a later edit drops the field from the
    // search index.
    for (const [term, expected] of [
      ['gchq', 'CyberChef'],
      ['wavetable', 'Vital'],
      ['bufferbloat', 'Waveform Bufferbloat Test'],
      ['transcription', 'Whisper'],
      ['hypervisor', 'Proxmox VE']
    ]) {
      await searchFor(page, term);
      await waitFor(page, "document.querySelectorAll('#grid .card').length < 100");
      const titles = await page.evaluate("[...document.querySelectorAll('#grid .card .card-title')].map(node => node.textContent.trim())");
      assert.ok(titles.some(title => title.startsWith(expected)), `searching "${term}" should find ${expected}, got ${titles.slice(0, 5).join(', ') || 'nothing'}`);
    }

    // Wait past the input debounce, or this measures the unfiltered grid: the
    // first card is already a Cloudflare entry in the default order, so a
    // content check alone returns before the search has run.
    await searchFor(page, 'Cloudflare');
    await waitFor(page, "document.querySelectorAll('#grid .card').length < 100");
    const searchResults = await page.evaluate("document.querySelectorAll('#grid .card').length");
    assert.ok(searchResults > 0, 'a real query should return matches');
    // The bug this replaced matched a query as a subsequence of the
    // description, so "cloudflare" returned every entry in the directory. The
    // real answer is a handful, so the bound has to be tight enough to fail
    // against that behaviour rather than merely below half the directory.
    assert.ok(
      searchResults <= 12,
      `a single product name should return a handful of entries, got ${searchResults} of ${SITES.length}`
    );
    const searchNames = await page.evaluate("[...document.querySelectorAll('#grid .card-title')].map(node => node.textContent.trim())");
    assert.ok(searchNames[0].toLowerCase().includes('cloudflare'), 'the best name match should rank first');
    assert.ok(
      searchNames.filter(name => name.toLowerCase().includes('cloudflare')).length >= 3,
      `name matches should dominate the results: ${searchNames.join(', ')}`
    );

    // Every token has to match, so adding a word narrows rather than widens.
    await searchFor(page, 'cloudflare speed');
    const narrowed = await page.evaluate("document.querySelectorAll('#grid .card').length");
    assert.ok(narrowed > 0 && narrowed <= searchResults, `extra tokens must narrow: ${narrowed} vs ${searchResults}`);

    // A plural with no literal match falls back to the relaxed pass and says so.
    await searchFor(page, 'dockers');
    const relaxed = await page.evaluate(`({
      count: document.querySelectorAll('#grid .card').length,
      label: document.getElementById('resultsCount').textContent
    })`);
    assert.ok(relaxed.count > 0 && relaxed.count <= 30, `a plural should still find something: ${relaxed.count}`);
    assert.match(relaxed.label, /closest matches/, 'approximate results have to be labelled');

    // A pasted word with trailing punctuation still matches.
    await searchFor(page, 'Cloudflare,');
    assert.equal(
      await page.evaluate("document.querySelectorAll('#grid .card').length"),
      searchResults,
      'trailing punctuation should not change the result set'
    );

    // A one-character token must not match every description.
    await searchFor(page, 'c');
    const oneChar = await page.evaluate("document.querySelectorAll('#grid .card').length");
    assert.ok(oneChar < SITES.length, `a single letter should not match everything: ${oneChar}`);

    // The highlighter builds a regex from the query and writes into escaped
    // HTML, so metacharacters and ampersands both have to survive.
    for (const probe of ['a+b(', '&', 'c*', '[', ')(', 'a & b']) {
      await searchFor(page, probe);
      const state = await page.evaluate(`({
        label: document.getElementById('resultsCount').textContent,
        rendered: document.querySelectorAll('#grid .card, #grid .empty-state').length,
        brokenEntity: document.body.innerHTML.includes('&amp;amp;')
      })`);
      assert.ok(!state.label.includes('Data failed'), `search must not break on ${probe}`);
      assert.ok(state.rendered > 0, `search must render something for ${probe}`);
      assert.equal(state.brokenEntity, false, `highlighting must not split an entity for ${probe}`);
    }
    await searchFor(page, '');

    // The category schema allows a quote in a name, and activeFilter used to be
    // interpolated straight into a selector. Drive buildFilters with a hostile
    // value that really exists in the data, which is the only way to reach the
    // lookup rather than the unknown-category fallback.
    const hostileFilter = await page.evaluate(`(() => {
      const original = SITES.map(site => site.category);
      const hostile = 'a"] , [data-cat';
      SITES.forEach(site => { site.category = hostile; });
      CATEGORY_META.set(hostile, { name: hostile, color: '#64b4ff', blurb: 'hostile' });
      CATEGORIES = [{ name: hostile, color: '#64b4ff', blurb: 'hostile' }];
      activeFilter = hostile;
      let error = null;
      try { buildFilters(); } catch (e) { error = String(e); }
      const marked = document.querySelectorAll('.filter-btn[aria-pressed="true"]').length;
      SITES.forEach((site, index) => { site.category = original[index]; });
      return { error, marked };
    })()`);
    assert.equal(hostileFilter.error, null, 'a quoted category name must not throw');
    assert.equal(hostileFilter.marked, 1, 'exactly one filter pill should be marked active');
    await page.send('Page.navigate', { url: `${server.url}?cat=${encodeURIComponent('a"]')}` });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    assert.equal(await page.evaluate("document.querySelectorAll('.filter-btn.active').length"), 1, 'an unknown category must fall back to All');
    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");

    await page.evaluate(`(() => {
      const input = document.getElementById('searchInput');
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-cat="Homelab"]').click();
    })()`);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0 && location.search.includes('cat=Homelab')");
    assert.ok(await page.evaluate("[...document.querySelectorAll('#grid .card-category')].every(node => node.textContent.trim() === 'Homelab')"));
    await page.evaluate("document.querySelector('[data-cat=\"All\"]').click(); document.querySelector('#sortSelect').value = 'az'; document.querySelector('#sortSelect').dispatchEvent(new Event('change', { bubbles: true }))");
    await waitFor(page, "document.querySelector('#grid .card-title')?.textContent");
    assert.equal(await page.evaluate(`(() => {
      const names = [...document.querySelectorAll('#grid .card-title')].map(node => node.textContent.trim());
      return names[0] === [...names].sort((a, b) => a.localeCompare(b))[0];
    })()`), true, 'A-Z sort should reorder the visible cards');

    const arrowNav = await page.evaluate(`(() => {
      const cards = [...document.querySelectorAll('#grid .card')];
      const first = cards[0].querySelector('.card-url');
      first.focus();
      const before = document.activeElement.closest('.card').dataset.url;
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const active = document.activeElement;
      return {
        before,
        after: active.closest('.card')?.dataset.url,
        expected: cards[1].dataset.url,
        isLink: active.classList.contains('card-url'),
        tag: active.tagName
      };
    })()`);
    assert.equal(arrowNav.after, arrowNav.expected, 'ArrowRight should move focus to the next card');
    assert.notEqual(arrowNav.after, arrowNav.before, 'ArrowRight should not leave focus where it was');
    assert.ok(arrowNav.isLink, `arrow navigation should land on the site link, got ${arrowNav.tag}`);

    await page.evaluate("document.querySelector('.theme-option[data-theme=\"light\"]').click()");
    assert.equal(await page.evaluate("document.documentElement.dataset.theme"), 'light');
    assert.equal(
      await page.evaluate("document.querySelector('.theme-option[data-theme=\"light\"]').getAttribute('aria-checked')"),
      'true',
      'the selected theme should report its state'
    );

    // Every theme has to keep body text readable against the body background.
    const contrast = await page.evaluate(`(async () => {
      // Transitions make getComputedStyle return an interpolated colour, and
      // content-visibility leaves off-screen cards unrecalculated, so both are
      // disabled for the measurement. Compositing runs through a canvas so the
      // browser resolves colour(), oklab() and alpha for us.
      const override = document.createElement('style');
      override.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; content-visibility: visible !important; }';
      document.head.appendChild(override);
      const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // Some transitions survive the override (a popover opening in the top
      // layer), and a mid-transition colour is not the colour a user sees.
      // Settle in real time rather than racing the compositor.
      const settle = () => new Promise(resolve => setTimeout(resolve, 300));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const paint = layers => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        for (const layer of layers) {
          ctx.fillStyle = '#000000';
          ctx.fillStyle = layer;
          ctx.fillRect(0, 0, 1, 1);
        }
        const data = ctx.getImageData(0, 0, 1, 1).data;
        return [data[0], data[1], data[2]];
      };
      const layersFor = node => {
        const stack = [];
        for (let el = node; el; el = el.parentElement) {
          const bg = getComputedStyle(el).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') stack.unshift(bg);
          if (bg.startsWith('rgb(')) break;
        }
        return stack;
      };
      const channel = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      const luminance = rgb => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
      const ratio = (a, b) => {
        const la = luminance(a), lb = luminance(b);
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };
      const selectors = ['.card-title', '.card-desc', '.card-url', '.card-category', '.results-count',
        '.footer p', '.stat', '.dock-title', '.filter-btn', '.metadata-toggle', '.sort-select',
        '.empty-state', '.shortcuts-table td'];
      // .theme-option is deliberately absent: it lives in a top-layer popover
      // whose computed colour does not settle reliably under CDP. The palette
      // test covers that surface from the tokens instead.
      const themes = ['oled','catppuccin','dracula','rose-pine','nord','github-dark','midnight','solarized','light'];
      const previous = document.documentElement.dataset.theme;
      const failures = [];
      let sampled = 0;
      document.querySelector('#grid .card').scrollIntoView({ block: 'center' });
      // The theme menu is a popover: it has to be open, or its options are not
      // rendered and the measurement is meaningless.

      for (const theme of themes) {
        document.documentElement.dataset.theme = theme;
        await settle();
        for (const selector of selectors) {
          const node = document.querySelector(selector);
          if (!node) continue;
          const layers = layersFor(node);
          const background = paint(layers);
          const foreground = paint([...layers, getComputedStyle(node).color]);
          const value = ratio(foreground, background);
          sampled++;
          if (value < 4.5) failures.push(theme + ' ' + selector + ' ' + value.toFixed(2) + ' fg=' + foreground + ' bg=' + background);
        }
      }
      document.documentElement.dataset.theme = previous;
      override.remove();
      await frame();
      return { failures, sampled };
    })()`);
    assert.ok(contrast.sampled >= 90, `the contrast probe should sample every theme, sampled ${contrast.sampled}`);
    assert.deepEqual(contrast.failures, [], 'text must clear WCAG AA against its own backdrop in every theme');

    await page.evaluate("document.querySelector('#compareModeBtn').click()");
    await waitFor(page, "document.querySelectorAll('[data-action=compare]').length >= 2");
    await page.evaluate("document.querySelectorAll('[data-action=compare]')[0].click(); document.querySelectorAll('[data-action=compare]')[1].click()");
    await waitFor(page, "!document.getElementById('compareOpenBtn').disabled");
    await page.evaluate("document.getElementById('compareOpenBtn').click()");
    await waitFor(page, "document.getElementById('compareModal').open");
    await page.evaluate("document.getElementById('compareClose').click()");

    const firstUrl = await page.evaluate("document.querySelector('#grid .card')?.dataset.url");
    await page.evaluate("document.querySelector('[data-action=bookmark]').click()");
    await waitFor(page, "JSON.parse(localStorage.getItem('coolsites-bookmarks-v2')).schemaVersion === 2");
    const savedBookmark = await page.evaluate(`(() => {
      const stored = JSON.parse(localStorage.getItem('coolsites-bookmarks-v2'));
      return { schemaVersion: stored.schemaVersion, hasBookmark: Boolean(stored.data['${escapeForExpression(firstUrl)}']) };
    })()`);
    assert.deepEqual(savedBookmark, { schemaVersion: 2, hasBookmark: true });

    // Remove the only bookmark while looking at the Bookmarks filter: undo has
    // to bring back both the entry and the view.
    await page.evaluate("document.querySelector('.filter-btn[data-cat=\"Bookmarks\"]').click()");
    await waitFor(page, "activeFilter === 'Bookmarks' && document.querySelectorAll('#grid .card').length === 1");
    const inBookmarks = await page.evaluate(`({
      filter: activeFilter,
      cards: document.querySelectorAll('#grid .card').length
    })`);
    assert.equal(inBookmarks.filter, 'Bookmarks');
    assert.equal(inBookmarks.cards, 1);

    await page.evaluate("document.querySelector('.site-chip .chip-remove').click()");
    await waitFor(page, "!document.getElementById('toastAction').hidden");
    await waitFor(page, "activeFilter === 'All' && document.querySelectorAll('#grid .card').length > 1");
    const afterRemove = await page.evaluate("({ filter: activeFilter, pills: [...document.querySelectorAll('.filter-btn')].map(b => b.dataset.cat) })");
    assert.equal(afterRemove.filter, 'All', 'an emptied Bookmarks filter should fall back to All');
    assert.ok(!afterRemove.pills.includes('Bookmarks'), 'the Bookmarks pill should go with the last bookmark');

    await page.evaluate("document.getElementById('toastAction').click()");
    await waitFor(page, `Object.keys(JSON.parse(localStorage.getItem('coolsites-bookmarks-v2')).data).length === 1`);
    // renderGrid defers through startViewTransition, so the storage write lands
    // a frame before the grid does. Wait for the view, not just the data.
    await waitFor(page, "activeFilter === 'Bookmarks' && document.querySelectorAll('#grid .card').length === 1");
    const afterUndo = await page.evaluate(`({
      chips: document.querySelectorAll('.site-chip').length,
      filter: activeFilter,
      activePill: document.querySelector('.filter-btn.active')?.dataset.cat,
      cards: document.querySelectorAll('#grid .card').length
    })`);
    assert.equal(afterUndo.chips, 1, 'undo should restore a removed bookmark');
    assert.equal(afterUndo.filter, 'Bookmarks', 'undo should return you to the filter you were using');
    assert.equal(afterUndo.activePill, 'Bookmarks', 'the restored filter has to be the highlighted pill');
    assert.equal(afterUndo.cards, 1, 'the grid has to agree with the highlighted pill');

    // Undo has to restore a chip to its original slot, not append it.
    const undoOrder = await page.evaluate(`(async () => {
      const urls = [...document.querySelectorAll('#grid .card')].slice(0, 4).map(card => card.dataset.url);
      bookmarks = {};
      urls.forEach((url, index) => { bookmarks[url] = { group: groups[0].id, order: index, addedAt: Date.now() }; });
      saveBookmarks();
      refreshBookmarkViews();
      const before = [...document.querySelectorAll('.site-chip')].map(chip => chip.dataset.url);
      removeBookmark(urls[1]);
      document.getElementById('toastAction').click();
      await new Promise(resolve => setTimeout(resolve, 250));
      const after = [...document.querySelectorAll('.site-chip')].map(chip => chip.dataset.url);
      return { before, after };
    })()`);
    assert.deepEqual(undoOrder.after, undoOrder.before, 'undo must restore the chip to its original position');

    // Undo must not overwrite a filter the user chose after the removal.
    const undoRespectsChoice = await page.evaluate(`(async () => {
      const urls = Object.keys(bookmarks);
      removeBookmark(urls[0]);
      activeFilter = 'Homelab';
      buildFilters();
      renderGrid();
      document.getElementById('toastAction').click();
      await new Promise(resolve => setTimeout(resolve, 250));
      return activeFilter;
    })()`);
    assert.equal(undoRespectsChoice, 'Homelab', 'undo must leave a deliberately chosen filter alone');
    await page.evaluate("bookmarks = {}; saveBookmarks(); activeFilter = 'All'; refreshBookmarkViews();");
    await delay(200);

    // A broken icon must replace only itself. It used to overwrite the chip's
    // parent, taking the label, the open overlay and the remove button with it.
    const chipSurvives = await page.evaluate(`(() => {
      const img = document.querySelector('.site-chip img.favicon-img');
      if (!img) return { skipped: true };
      const chip = img.closest('.site-chip');
      img.dispatchEvent(new Event('error', { bubbles: true }));
      return {
        label: Boolean(chip.querySelector('.chip-text')),
        open: Boolean(chip.querySelector('.chip-open')),
        remove: Boolean(chip.querySelector('.chip-remove')),
        placeholder: Boolean(chip.querySelector('.chip-initial'))
      };
    })()`);
    if (!chipSurvives.skipped) {
      assert.deepEqual(chipSurvives, { label: true, open: true, remove: true, placeholder: true },
        'a failed favicon must not destroy the rest of the chip');
    }
    await page.send('Page.reload', { ignoreCache: true });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");

    // Cancelling a modal must not wipe an active search behind it.
    await searchFor(page, 'cloudflare');
    const beforeModal = await page.evaluate("document.getElementById('searchInput').value");
    await page.evaluate("document.getElementById('newGroupBtn').click()");
    await waitFor(page, "document.getElementById('groupModal').open");
    await page.evaluate("document.getElementById('groupModal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await delay(250);
    assert.equal(
      await page.evaluate("document.getElementById('searchInput').value"),
      beforeModal,
      'Escape inside a dialog must not clear the search box'
    );
    await page.evaluate("document.getElementById('groupModal').close()");

    // Escape also light-dismisses a popover, which is not a <dialog>.
    await page.evaluate("document.getElementById('themeDropdown').showPopover()");
    await delay(200);
    await page.evaluate("document.getElementById('themeDropdown').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))");
    await delay(200);
    assert.equal(
      await page.evaluate("document.getElementById('searchInput').value"),
      beforeModal,
      'Escape closing the theme popover must not clear the search box'
    );
    await page.evaluate("document.getElementById('themeDropdown').hidePopover()");

    // A read-only action must not cancel a pending Undo.
    await page.evaluate("showToast('Removed something', () => { window.__undoRan = true; })");
    await page.evaluate("showToast('URL copied')");
    await delay(150);
    const undoSurvives = await page.evaluate(`({
      visible: !document.getElementById('toastAction').hidden,
      message: document.getElementById('toastMessage').textContent
    })`);
    assert.equal(undoSurvives.visible, true, 'an informational toast must not cancel a pending Undo');
    assert.equal(undoSurvives.message, 'URL copied');
    await page.evaluate("document.getElementById('toastAction').click()");
    assert.equal(await page.evaluate("window.__undoRan === true"), true, 'the preserved Undo must still run');

    // Focus holds the toast open; a 7s countdown must not steal the control.
    await page.evaluate("window.__undoRan = false; showToast('Removed something', () => { window.__undoRan = true; })");
    await page.evaluate("document.getElementById('toastAction').focus()");
    await delay(1200);
    assert.equal(
      await page.evaluate("document.activeElement === document.getElementById('toastAction')"),
      true,
      'focus must stay on the Undo control'
    );
    await page.evaluate("hideToast()");

    // The colour picker must keep focus inside the radiogroup.
    await page.evaluate("document.getElementById('newGroupBtn').click()");
    await waitFor(page, "document.getElementById('groupModal').open");
    const colourKeyboard = await page.evaluate(`(() => {
      const swatch = document.querySelectorAll('.modal-color')[2];
      swatch.focus();
      swatch.click();
      const afterClick = document.activeElement.classList.contains('modal-color');
      document.getElementById('modalColors').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      const moved = document.activeElement.classList.contains('modal-color');
      const checked = document.querySelectorAll('.modal-color[aria-checked="true"]').length;
      return { afterClick, moved, checked };
    })()`);
    assert.equal(colourKeyboard.afterClick, true, 'clicking a swatch must not throw focus out of the group');
    assert.equal(colourKeyboard.moved, true, 'arrow keys must still work after a selection');
    assert.equal(colourKeyboard.checked, 1, 'exactly one swatch is checked');
    await page.evaluate("document.getElementById('modalCancel').click()");
    await waitFor(page, "!document.getElementById('groupModal').open");

    await searchFor(page, '');
    await page.evaluate("document.querySelector('.filter-btn[data-cat=\"All\"]').click()");
    await delay(250);

    // Clobber the last-good backups too, or the fallback legitimately recovers
    // the previous value and this measures the backup rather than the corruption.
    await page.evaluate(`(() => {
      for (const key of ['coolsites-bookmarks-v2', 'coolsites-groups-v2']) {
        localStorage.setItem(key, '{broken');
        localStorage.setItem(key + ':last-good', '{broken');
      }
    })()`);
    await page.send('Page.reload', { ignoreCache: true });
    await delay(500);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    const afterCorrupt = await page.evaluate(`({
      label: document.getElementById('resultsCount').textContent,
      cards: document.querySelectorAll('#grid .card').length,
      pills: document.querySelectorAll('.filter-btn').length,
      dockCount: document.getElementById('dockCount').textContent,
      groups: typeof groups === 'undefined' ? null : groups.map(g => g.id)
    })`);
    assert.match(afterCorrupt.label, /^\d+( of \d+)? sites?$/, `corrupt storage must still render a count, got ${afterCorrupt.label}`);
    assert.ok(afterCorrupt.cards > 0, 'corrupt local storage must not stop boot');
    assert.ok(afterCorrupt.pills > 1, 'category pills should still build');
    assert.deepEqual(afterCorrupt.groups, ['default'], 'corrupt groups should fall back to the default group');
    assert.equal(afterCorrupt.dockCount, '0', 'corrupt bookmarks with no recoverable backup should read as none');

    // With only the primary copy corrupt, the last-good backup has to recover it.
    await page.evaluate(`(() => {
      const value = JSON.stringify({ schemaVersion: 2, data: { 'https://example.com/': { group: 'default', order: 0, addedAt: 1 } } });
      localStorage.setItem('coolsites-bookmarks-v2:last-good', value);
      localStorage.setItem('coolsites-bookmarks-v2', '{broken');
    })()`);
    await page.send('Page.reload', { ignoreCache: true });
    await delay(500);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    assert.equal(
      await page.evaluate("Object.keys(bookmarks).length"),
      1,
      'a corrupt primary copy should be recovered from the last-good backup'
    );
    // Restore the theme the earlier assertions selected; later checks rely on it.
    await page.evaluate("localStorage.clear(); localStorage.setItem('coolsites-theme', 'light')");
    await page.send('Page.reload', { ignoreCache: true });
    await delay(500);
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");

    const importResult = await page.evaluate(`(() => {
      const first = document.querySelector('#grid .card').dataset.url;
      const payload = {
        app: 'coolsites-bookmarks',
        schemaVersion: 2,
        groups: [
          { id: 'safe_group', name: 'Safe Group', color: '#112233' },
          { id: 'bad\" onmouseover=\"alert(1)', name: '<img src=x>', color: 'red' }
        ],
        bookmarks: {
          [first]: { group: 'safe_group', order: 0, addedAt: Date.now() },
          'javascript:alert(1)': { group: 'safe_group', order: 1, addedAt: Date.now() },
          'https://unknown.invalid/': { group: 'safe_group', order: 2, addedAt: Date.now() }
        }
      };
      const input = document.getElementById('importFile');
      const transfer = new DataTransfer();
      transfer.items.add(new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return first;
    })()`);
    await waitFor(page, "document.getElementById('toast').textContent.includes('skipped')");
    const importedState = await page.evaluate(`(() => {
      const bookmarks = JSON.parse(localStorage.getItem('coolsites-bookmarks-v2')).data;
      const groups = JSON.parse(localStorage.getItem('coolsites-groups-v2')).data;
      return {
        bookmarkKeys: Object.keys(bookmarks),
        groups,
        unsafeGroup: groups.some(group => group.id.includes('onmouseover') || group.color === 'red')
      };
    })()`);
    assert.deepEqual(importedState.bookmarkKeys, [importResult]);
    assert.equal(importedState.unsafeGroup, false, 'unsafe imported group fields must be rejected');

    await page.send('Page.navigate', { url: `${server.url}collections.html` });
    await waitFor(page, "document.querySelectorAll('#collections .featured-site').length > 0");
    assert.ok(await page.evaluate("document.querySelectorAll('#collections .featured-site').length > 0"));
    // The theme picked in the directory has to carry across to this page.
    const collectionsTheme = await page.evaluate(`({
      theme: document.documentElement.getAttribute('data-theme'),
      background: getComputedStyle(document.body).backgroundColor,
      badge: document.querySelector('#collections .badge')?.textContent.trim()
    })`);
    assert.equal(collectionsTheme.theme, 'light', 'collections should follow the stored theme');
    assert.equal(collectionsTheme.background, 'rgb(248, 249, 252)', 'collections should paint the light background');
    assert.match(collectionsTheme.badge, /^\d+ sites?$/, 'each collection should count its resolvable entries');

    await page.evaluate("document.querySelector('[data-collection-index=\"1\"]').click()");
    await waitFor(page, "document.getElementById('featuredTitle').textContent === 'OSINT 101'");
    assert.equal(await page.evaluate("document.querySelectorAll('#collections .featured-site').length"), 6,
      'choosing a collection should replace the focused member list');

    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    await page.evaluate(`(() => {
      const target = document.createElement('div');
      target.id = 'widget-test-target';
      document.body.appendChild(target);
      const script = document.createElement('script');
      script.src = './widget.js';
      script.dataset.target = '#widget-test-target';
      target.appendChild(script);
    })()`);
    await waitFor(page, "document.querySelector('#widget-test-target coolsites-widget')?.shadowRoot?.querySelector('.item, .empty')");

    await waitFor(page, "navigator.serviceWorker?.controller");
    await stopProcess(server.process);
    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0", 15000);
    const offlineState = await page.evaluate(`(async () => ({
      statusHidden: document.getElementById('dataStatus').hidden,
      statusText: document.getElementById('dataStatus').textContent,
      online: navigator.onLine,
      dataSource: typeof DATA_SOURCE === 'undefined' ? 'missing' : DATA_SOURCE,
      controller: Boolean(navigator.serviceWorker?.controller),
      cacheKeys: typeof caches === 'undefined' ? [] : await caches.keys(),
      probeSource: await fetch('./sites.json', { cache: 'no-cache' }).then(response => response.headers.get('X-CoolSites-Cache')).catch(error => String(error))
    }))()`);
    assert.equal(offlineState.statusHidden, false, JSON.stringify(offlineState));
    // The wording changed on purpose. It used to say the directory was "last
    // reviewed" on that date, which was untrue: the date is the newest entry's,
    // and most entries have never been reviewed at all.
    assert.match(offlineState.statusText, /Offline: showing a cached copy of the directory/);
    assert.match(offlineState.statusText, /newest entry is from/);
    assert.equal(/last reviewed/i.test(offlineState.statusText), false,
      'nothing may describe the whole directory as reviewed');
    // The date must match the data. A bare YYYY-MM-DD parses as UTC and then
    // renders in local time, which showed the wrong day west of Greenwich.
    const newest = SITES.map(site => site.lastReviewedAt || site.updatedAt).sort().at(-1);
    const expectedDay = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(`${newest}T00:00:00`));
    assert.ok(offlineState.statusText.includes(expectedDay),
      `status should show ${expectedDay} for data dated ${newest}, got: ${offlineState.statusText}`);
    server = await startLocalServer();
    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");

    await page.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
    await page.send('Page.reload', { ignoreCache: false });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    const mobile = await page.evaluate(`(() => {
      // Under CDP emulation window.innerWidth reports the window, not the
      // layout viewport, so it is useless here. body also has
      // overflow-x:hidden, which hides real overflow from scrollWidth. Measure
      // the elements against clientWidth instead.
      const viewport = document.documentElement.clientWidth;
      const clipped = ['.header-inner', '.logo', '.github-link', '.hero h1', '.results-bar', '#grid .card']
        .map(selector => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const box = node.getBoundingClientRect();
          return box.right > viewport + 1 || box.left < -1 ? selector + ' ' + Math.round(box.left) + '..' + Math.round(box.right) : null;
        })
        .filter(Boolean);
      return {
        viewport,
        columns: getComputedStyle(document.getElementById('grid')).gridTemplateColumns,
        overflow: document.documentElement.scrollWidth <= viewport + 1,
        clipped
      };
    })()`);
    assert.equal(mobile.viewport, 375, 'device metrics override should apply');
    assert.equal(mobile.columns.split(' ').length, 1, 'mobile layout should use one card column');
    assert.equal(mobile.overflow, true, 'mobile layout should not overflow horizontally');
    assert.deepEqual(mobile.clipped, [], `no element may be clipped at ${mobile.viewport}px`);
    await page.send('Emulation.clearDeviceMetricsOverride');
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await page.send('Page.reload', { ignoreCache: false });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    assert.ok(Number.parseFloat(await page.evaluate("getComputedStyle(document.querySelector('#grid .card')).animationDuration")) < 0.001, 'reduced motion should disable card animation');

    // The embeddable widget. It is the one surface an outside site pulls in, so
    // an unknown category or a typo'd target has to explain itself rather than
    // leaving a blank box on someone else's page.
    const widget = await page.evaluate(`(async () => {
      const mount = (attrs) => new Promise(resolve => {
        const holder = document.createElement('div');
        holder.className = 'widget-probe';
        document.body.appendChild(holder);
        const script = document.createElement('script');
        script.src = './widget.js';
        for (const [key, value] of Object.entries(attrs)) script.dataset[key] = value;
        script.onload = () => setTimeout(() => resolve(holder), 600);
        holder.appendChild(script);
      });

      const read = (holder) => {
        const el = holder.querySelector('coolsites-widget');
        if (!el) return { mounted: false };
        const root = el.shadowRoot;
        return {
          mounted: true,
          version: el.dataset.version,
          heading: root.querySelector('.title')?.textContent,
          labelled: Boolean(root.querySelector('section[aria-labelledby]')),
          headingLinked: root.querySelector('section')?.getAttribute('aria-labelledby') === root.querySelector('.title')?.id,
          busy: root.querySelector('.body')?.getAttribute('aria-busy'),
          listItems: root.querySelectorAll('ul.items li a.item').length,
          note: root.querySelector('.note')?.textContent || '',
          background: getComputedStyle(root.querySelector('.wrap')).backgroundColor
        };
      };

      const normal = read(await mount({ category: 'Homelab', limit: '5' }));
      const unknown = read(await mount({ category: 'No Such Category Exists' }));
      const badLimit = read(await mount({ limit: 'eight' }));
      const hugeLimit = read(await mount({ limit: '9999' }));

      // A target selector that matches nothing must not mount anything at all.
      const orphanHolder = await mount({ target: '#definitely-not-here' });
      const orphan = Boolean(orphanHolder.querySelector('coolsites-widget'))
        || Boolean(document.querySelector('body > coolsites-widget'));

      document.querySelectorAll('.widget-probe').forEach(node => node.remove());
      return { normal, unknown, badLimit, hugeLimit, orphan };
    })()`);

    assert.equal(widget.normal.mounted, true, 'the widget should mount');
    assert.match(widget.normal.version, /^\d+\.\d+\.\d+$/, 'the widget should expose a version');
    assert.equal(widget.normal.heading, 'CoolSites: Homelab');
    assert.equal(widget.normal.labelled, true, 'the widget region needs an accessible name');
    assert.equal(widget.normal.headingLinked, true, 'aria-labelledby must point at the heading that exists');
    assert.equal(widget.normal.busy, 'false', 'the live region must stop reporting busy once loaded');
    assert.equal(widget.normal.listItems, 5, 'data-limit should be honoured');
    assert.equal(widget.unknown.listItems, 0, 'an unknown category has nothing to list');
    assert.match(widget.unknown.note, /No category called "No Such Category Exists"/,
      'an unknown category must name itself instead of rendering a blank box');
    assert.equal(widget.badLimit.listItems, 8, 'an unparseable data-limit falls back to the default');
    assert.ok(widget.hugeLimit.listItems > 0 && widget.hugeLimit.listItems <= 50,
      `data-limit should be capped, got ${widget.hugeLimit.listItems}`);
    assert.equal(widget.orphan, false, 'a data-target that matches nothing must not mount anywhere');
    // Fixed #12141c regardless of the host page was the old behaviour.
    assert.notEqual(widget.normal.background, 'rgba(0, 0, 0, 0)', 'the widget should paint its own surface');

    // Keyboard reordering in the dock. Reordering used to be drag-only, so a
    // keyboard user could build groups but never arrange them.
    await page.evaluate("if (document.getElementById('dockWrapper').classList.contains('collapsed')) document.getElementById('dockToggle').click()");
    await waitFor(page, "!document.getElementById('dockWrapper').classList.contains('collapsed')");
    const reorder = await page.evaluate(`(async () => {
      const urls = [...document.querySelectorAll('#grid .card')].slice(0, 3).map(card => card.dataset.url);
      groups = [
        { id: 'ka', name: 'Alpha', color: '#6e56cf' },
        { id: 'kb', name: 'Beta', color: '#30a46c' }
      ];
      saveGroups();
      bookmarks = {};
      urls.forEach((url, index) => { bookmarks[url] = { group: 'ka', order: index, addedAt: Date.now() }; });
      saveBookmarks();
      refreshBookmarkViews();
      const settle = () => new Promise(resolve => setTimeout(resolve, 120));
      const order = () => [...document.querySelectorAll('.dock-group[data-group-id="ka"] .site-chip')].map(chip => chip.dataset.url);
      const press = (node, key) => node.dispatchEvent(new KeyboardEvent('keydown', { key, altKey: true, bubbles: true }));

      const before = order();

      // Move the first chip right, from its own link, the way a keyboard user
      // arrives at it.
      const link = document.querySelector('.dock-group[data-group-id="ka"] .site-chip .chip-open');
      link.focus();
      press(link, 'ArrowRight');
      await settle();
      const afterRight = order();
      const focusFollowed = document.activeElement.closest('.site-chip')?.dataset.url === urls[0]
        && document.activeElement.classList.contains('chip-open');

      // At the end of the group it must refuse rather than wrap or throw.
      const last = document.querySelector('.dock-group[data-group-id="ka"] .site-chip:last-of-type .chip-open');
      last.focus();
      press(last, 'ArrowRight');
      await settle();
      const afterEdge = order();

      // Down moves it into the next group.
      const mover = document.querySelector('.dock-group[data-group-id="ka"] .site-chip .chip-open');
      const movedUrl = mover.closest('.site-chip').dataset.url;
      mover.focus();
      press(mover, 'ArrowDown');
      await settle();
      const landedIn = bookmarks[movedUrl].group;
      const announced = document.getElementById('toastMessage').textContent;

      // A group reorders from its edit button.
      const groupsBefore = groups.map(g => g.id);
      const edit = document.querySelector('.dock-group[data-group-id="kb"] [data-dock-action="edit-group"]');
      edit.focus();
      press(edit, 'ArrowLeft');
      await settle();
      const groupsAfter = groups.map(g => g.id);
      const groupFocusFollowed = document.activeElement.dataset.dockAction === 'edit-group'
        && document.activeElement.closest('.dock-group').dataset.groupId === 'kb';

      // A bare arrow, with no Alt, must not reorder anything. Checked against
      // the chips as well as the groups: the key press lands on a chip, so
      // watching only the group order would miss it entirely.
      const chipsBeforeBare = order();
      const bare = document.querySelector('.dock-group[data-group-id="ka"] .site-chip .chip-open');
      bare.focus();
      bare.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await settle();
      const afterBare = groups.map(g => g.id);
      const chipsAfterBare = order();

      return { before, afterRight, afterEdge, landedIn, announced, groupsBefore, groupsAfter, focusFollowed, groupFocusFollowed, afterBare, chipsBeforeBare, chipsAfterBare, movedUrl };
    })()`);

    assert.deepEqual(reorder.afterRight, [reorder.before[1], reorder.before[0], reorder.before[2]],
      'Alt+Right should swap a chip with the one after it');
    assert.equal(reorder.focusFollowed, true, 'focus must follow the chip it just moved');
    assert.deepEqual(reorder.afterEdge, reorder.afterRight,
      'Alt+Right at the end of a group must do nothing, not wrap around to the front');
    assert.equal(reorder.landedIn, 'kb', 'Alt+Down should move a chip into the next group');
    assert.match(reorder.announced, /moved to Beta/, 'the move has to be announced, not just performed');
    assert.deepEqual(reorder.groupsBefore, ['ka', 'kb']);
    assert.deepEqual(reorder.groupsAfter, ['kb', 'ka'], 'Alt+Left on a group header should reorder the group');
    assert.equal(reorder.groupFocusFollowed, true, 'focus must stay on the same control of the moved group');
    assert.deepEqual(reorder.afterBare, ['kb', 'ka'], 'a plain arrow key must not reorder a group');
    assert.deepEqual(reorder.chipsAfterBare, reorder.chipsBeforeBare, 'a plain arrow key must not reorder a chip either');

    await page.evaluate("bookmarks = {}; saveBookmarks(); localStorage.removeItem('coolsites-groups');");
    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");

    // Diagnostics. Opens only with ?debug=1, reports real state, and must not
    // reach for the network: the whole point is a health surface that does not
    // phone anywhere.
    await page.send('Emulation.setEmulatedMedia', { features: [] });
    await page.send('Page.navigate', { url: `${server.url}?debug=1` });
    await waitFor(page, "document.getElementById('debugModal') && document.getElementById('debugModal').open");
    const diagnostics = await page.evaluate(`(() => {
      const body = document.getElementById('debugBody');
      // Read the rows rather than textContent: the label and value concatenate
      // into "sites588" there, which is a trap for anything regex-based.
      const values = {};
      for (const row of body.querySelectorAll('.debug-row')) {
        values[row.querySelector('dt').textContent] = row.querySelector('dd').textContent;
      }
      return {
        open: document.getElementById('debugModal').open,
        values,
        groups: [...body.querySelectorAll('.debug-group h4')].map(h => h.textContent.replace(/ \\(\\d+\\)$/, '')),
        hasActions: ['debugCopy', 'debugReset', 'debugClose'].every(id => document.getElementById(id))
      };
    })()`);
    assert.equal(diagnostics.open, true, '?debug=1 should open the diagnostics panel');
    assert.deepEqual(diagnostics.groups, ['App', 'Data', 'Cache', 'Errors'], 'every diagnostics section should render');
    assert.equal(diagnostics.values.sites, String(SITES.length), 'diagnostics should report the real entry count');
    assert.match(diagnostics.values.version, /^CoolSites v\d+\.\d+\.\d+$/, 'diagnostics should report the app version');
    assert.match(diagnostics.values.serviceWorker, /^(active|installing|waiting|registered)$/, 'diagnostics should report the worker state');
    assert.match(diagnostics.values.caches, /coolsites-v\d+\.\d+\.\d+/, 'diagnostics should name the cache actually in use');
    assert.ok(Number(diagnostics.values.entries) > 0, 'diagnostics should count what the cache holds');
    assert.equal(diagnostics.values.lastLoad === 'never completed', false, 'a successful load must be recorded');
    assert.equal(diagnostics.hasActions, true, 'recovery actions must be present');

    // Escape must close the dialog without also wiping the search behind it.
    await page.evaluate("document.getElementById('debugModal').close()");

    // The panel is developer-only: a normal load must not open it.
    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    assert.equal(
      await page.evaluate("document.getElementById('debugModal').open"),
      false,
      'the diagnostics panel must stay shut without ?debug=1'
    );

    // A failed data load has to be recorded rather than swallowed, because that
    // is exactly the case someone opens diagnostics to understand.
    const recorded = await page.evaluate(`(async () => {
      const before = DIAGNOSTICS.errors.length;
      await loadJson('./definitely-not-here.json', {});
      return { before, after: DIAGNOSTICS.errors.length, last: DIAGNOSTICS.errors.at(-1) };
    })()`);
    assert.equal(recorded.after, recorded.before + 1, 'a fallback must not hide the failure from diagnostics');
    assert.match(recorded.last.scope, /definitely-not-here/);

    // The policy ships in a meta tag, so it is enforced on GitHub Pages where no
    // response header can reach. Drive the surfaces it could plausibly block:
    // the inline boot script, the inline stylesheet, the data: favicons, the
    // JSON fetches and the service worker.
    await page.send('Emulation.setEmulatedMedia', { features: [] });
    await page.send('Page.navigate', { url: server.url });
    await waitFor(page, "document.querySelectorAll('#grid .card').length > 0");
    await searchFor(page, 'docker');
    await page.evaluate("document.getElementById('themeDropdown').showPopover()");
    await delay(150);
    await page.evaluate("document.getElementById('themeDropdown').hidePopover()");
    await page.evaluate("document.getElementById('newGroupBtn').click()");
    await waitFor(page, "document.getElementById('groupModal').open");
    await page.evaluate("document.getElementById('modalCancel').click()");
    await searchFor(page, '');
    await delay(400);

    const policy = await page.evaluate(`(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      const styled = getComputedStyle(document.querySelector('#grid .card'));
      return {
        enforced: Boolean(meta),
        content: meta ? meta.content : '',
        violations: window.__cspViolations,
        // If style-src had blocked the inline sheet the card would fall back to
        // the UA default, so this proves the policy is not silently breaking it.
        painted: styled.backgroundColor !== 'rgba(0, 0, 0, 0)',
        icons: document.querySelectorAll('#grid .card img.favicon-img').length
      };
    })()`);
    assert.equal(policy.enforced, true, 'the page must carry an enforced content security policy');
    assert.deepEqual(policy.violations, [], 'the shipped policy must not block anything the app does');
    assert.equal(policy.painted, true, 'the inline stylesheet must survive style-src');
    assert.ok(policy.icons > 0, 'data: favicons must survive img-src');

    // Collections is a separate document and carries its own copy of the policy.
    await page.send('Page.navigate', { url: `${server.url}collections.html` });
    await waitFor(page, "document.getElementById('collections').getAttribute('aria-busy') === 'false'");
    const collectionsPolicy = await page.evaluate(`({
      enforced: Boolean(document.querySelector('meta[http-equiv="Content-Security-Policy"]')),
      violations: window.__cspViolations,
      rendered: document.querySelectorAll('.featured-site').length,
      failed: Boolean(document.querySelector('.error'))
    })`);
    assert.equal(collectionsPolicy.enforced, true, 'collections must carry the policy too');
    assert.equal(collectionsPolicy.failed, false, 'connect-src must still allow the collections data fetch');
    assert.ok(collectionsPolicy.rendered > 0, 'collections should actually render under the policy');
    assert.deepEqual(collectionsPolicy.violations, [], 'the policy must not block the collections page');
  } finally {
    if (page && connection) {
      try { await connection.send('Target.closeTarget', { targetId: page.targetId }); } catch {}
    }
    if (connection) connection.close();
    await stopProcess(chrome.process);
    await stopProcess(server.process);
    // Windows keeps the profile locked briefly after Chrome exits. A leftover
    // temp directory is not a test failure, so never let cleanup throw.
    try {
      fs.rmSync(chrome.profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch {}
  }
});

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  static async connect(url) {
    if (typeof WebSocket !== 'function') throw new Error('Node 22.17+ with WebSocket support is required for browser tests');
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new CdpConnection(socket);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() { this.socket.close(); }
}

async function createPage(connection, url, navigate = true) {
  const target = await connection.send('Target.createTarget', { url: 'about:blank' });
  const attached = await connection.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const page = {
    targetId: target.targetId,
    send: (method, params = {}) => connection.send(method, params, attached.sessionId),
    evaluate: expression => evaluate(connection, attached.sessionId, expression)
  };
  await page.send('Runtime.enable');
  await page.send('Page.enable');
  await page.send('Network.enable');
  await page.send('Network.setBlockedURLs', { urls: ['https://*'] });
  // Installed at document-start so it beats the theme boot script, which is the
  // first thing the policy could block. Re-runs on every navigation and reload.
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__cspViolations = [];
      document.addEventListener('securitypolicyviolation', event => {
        window.__cspViolations.push(event.effectiveDirective + ' blocked ' + (event.blockedURI || '(inline)'));
      });`
  });
  if (navigate) await page.send('Page.navigate', { url });
  return page;
}

async function evaluate(connection, sessionId, expression) {
  const result = await connection.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'Browser evaluation failed');
  return result.result?.value;
}

async function searchFor(page, query) {
  await page.evaluate(`(() => {
    const input = document.getElementById('searchInput');
    input.value = ${JSON.stringify(query)};
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await delay(350);
}

async function waitFor(page, expression, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await page.evaluate(expression)) return;
    } catch (error) {
      lastError = error;
    }
    await delay(WAIT_STEP_MS);
  }
  throw new Error(`Timed out waiting for: ${expression}${lastError ? ` (${lastError.message})` : ''}`);
}

async function startLocalServer() {
  const child = spawn(process.execPath, ['scripts/serve.js', '0'], {
    cwd: ROOT,
    env: { ...process.env, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const output = collectOutput(child);
  const match = await waitForOutput(output, /http:\/\/127\.0\.0\.1:(\d+)\//, child, 'local server');
  return { process: child, url: `http://127.0.0.1:${match[1]}/` };
}

async function startChrome() {
  const executable = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'coolsites-browser-'));
  const child = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-first-run',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  const output = collectOutput(child);
  const match = await waitForOutput(output, /DevTools listening on (ws:\/\/[^\s]+)/, child, 'Chrome DevTools');
  return { process: child, profile, webSocketUrl: match[1] };
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium'
  ].filter(Boolean);
  const executable = candidates.find(candidate => fs.existsSync(candidate));
  if (!executable) throw new Error('Chrome or Edge was not found; set CHROME_PATH to run npm test');
  return executable;
}

function collectOutput(child) {
  let value = '';
  const append = chunk => { value += String(chunk); };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  return { get value() { return value; } };
}

async function waitForOutput(output, pattern, child, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const match = output.value.match(pattern);
    if (match) return match;
    if (child.exitCode != null) throw new Error(`${label} exited before becoming ready`);
    await delay(WAIT_STEP_MS);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode != null) return;
  child.kill();
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    delay(2000)
  ]);
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function escapeForExpression(value) {
  return JSON.stringify(value).slice(1, -1).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

# Changelog

All notable changes to CoolSites will be documented in this file.

## [Unreleased]

### Added

- **`npm run check:links`**, which walks every URL in `sites.json` and writes a report to `work/link-check.json`. It takes about a minute for the whole directory and never touches `sites.json`. The reason it exists in this shape is the distinction a naive checker gets wrong: a 403 from a bot wall, a permanent redirect, an expired certificate and a real 404 all look like failure, and only two of them mean the entry is broken. Before calling anything dead it asks again with a browser user agent and downgrades to `blocked` if that works, because bot walls hand back 404s and 5xx just as readily as 403s. On the directory as it stands: 513 fine, 26 permanently moved, 27 bot walls, 2 genuinely gone.
- **A content security policy that actually reaches you.** The policy used to live only in the nginx config that shipped with the Docker image, which meant the real deployment on GitHub Pages ran with no policy at all. It now travels in a `<meta>` tag on both pages, so it applies wherever the site is hosted. `frame-ancestors` is deliberately left out because browsers ignore it in a meta tag, and claiming it there would be pretending to a protection the page doesn't have.
- A `Referrer-Policy` of `strict-origin-when-cross-origin`, so following a link off the directory no longer leaks the full URL you came from.
- Tests that gate all of the above: one drives a real browser and fails if the policy blocks anything the app does, four check the policy itself for drift between pages, wildcard hosts, and `unsafe-inline` turning up somewhere it wasn't reviewed.

### Removed

- **Docker support.** The `Dockerfile`, `.dockerignore` and the nginx configs are gone. Building the image for the first time turned up the reason to be suspicious of it: `try_files ... /index.html` answered every missing path with a 200 and a copy of the homepage, so `/CLAUDE.md` and `/Dockerfile` looked like real pages to a crawler. CoolSites has no client-side routing and needs no rewrite rule. Copy the files into any document root instead, which the README now explains.

## [v2.3.0] - 2026-08-25

A full audit pass. The short version: search actually narrows now, the layout no longer overflows on a phone, the page makes no third-party requests at all, text clears WCAG AA in every theme, and the build refuses to ship a stale number.

### Fixed

- **Search returned most of the directory.** A query was matched as a subsequence of the description, so "rss" returned 579 of 588 entries, "pdf" 292 and "vpn" 246. Every word now has to match, typo tolerance is limited to the name, and short fields carry the weight. When nothing matches literally, a relaxed pass covers plurals and typos and the results are labelled "closest matches".
- **Cards overflowed the viewport on phones.** A card could not shrink below its footer row, so at a 320px viewport it rendered 388px wide and the overflow was silently clipped.
- **The header clipped its own GitHub link on a phone**, so it could not be tapped.
- **A new browser could never import bookmarks.** The dock collapsed to nothing with no bookmarks, and Import lives inside it.
- **`?cat=a"]` broke the page.** The category from the URL went into a CSS selector unescaped and threw, leaving no cards at all.
- **Search highlighting split HTML entities.** Searching for "&" produced `&amp;` on screen, and only the first word of a multi-word query was ever highlighted.
- **Shuffle reshuffled on every keystroke and every "show more"**, so the list changed under you.
- **Arrow keys focused the bookmark star**, so Enter bookmarked the card instead of opening it.
- **Escape did not clear the search box** the way the shortcut panel and this README said it did, and once it did, cancelling a modal wiped the search behind it.
- **Removing a bookmark or deleting a group was unrecoverable.** Both now offer Undo, which restores the entry, the group and the filter you were looking at.
- **The dock header disagreed with the chips below it** when a bookmarked site left the directory.
- **Copy as Markdown threw** on an insecure origin instead of falling back.
- **Every render leaked the previous one.** Two IntersectionObservers kept strong references to detached cards.
- **The service worker cached error responses**, so one 404 during a deploy could be served offline afterwards. A single failed asset also aborted the whole precache.
- **`npm run package` corrupted the minified build** when a script block contained `$&`, `` $` `` or `$1`, and it never copied `collections.html`, so the Collections link was broken in every packaged release.
- **The local server served `.git` and `.env`**, because the repository is its document root.
- **The Docker image copied working notes, tests and package metadata into the web root.**

### Added

- **One source of truth for the version and the counts.** `scripts/lib/metadata.js` derives them from `package.json` and the data, rewrites the page metadata, hero line, manifest, service worker cache name and the README badges and category table, and `npm run lint` fails when any of it has drifted. Twelve strings said 590 sites when there were 588.
- **The data lint validates against the declared JSON schemas**, rejects duplicate and canonical-collision URLs, checks the generated feeds match the data, and checks the submission form's category dropdown against `categories.json`.
- **A palette test** that checks every text token against the page, the card and the hovered card in all nine themes, and a browser probe that measures what is actually rendered.
- **An nginx config for the Docker image** with a content security policy, per-type caching and a healthcheck, on a digest-pinned base.
- **Loading, error, empty and offline states on the Collections page**, which also follows the theme you picked in the directory instead of forcing dark.

### Fixed after review

A second adversarial pass over the audit itself found eight more defects, six of them introduced by the audit:

- A favicon that would not decode wiped the whole dock chip, taking its label, link and remove button. One shipped icon triggered it: a domain served a macOS alias file as an icon. The favicon cache now checks magic bytes rather than trusting the media type.
- Escape closing the theme menu still cleared the search box.
- Copying a URL or opening a random site silently cancelled a pending Undo.
- Undo put a bookmark back in the wrong slot, and overwrote a filter chosen after the removal.
- The Undo button vanished after seven seconds even while focused.
- Picking a group colour threw focus out of the dialog and killed the arrow keys.
- The Docker image served its own nginx config from the web root, and the dotfile deny sat after the file-type rules so a dotfile ending .json slipped past.

### Changed

- **No third-party requests.** Favicons are inlined at build time for 520 of 539 domains; the rest render the site initial. The page no longer tells Google which entry you are looking at.
- **Contrast.** Muted, secondary and accent text were below WCAG AA on the page, the card and the hovered card in all nine themes. Category badges were unreadable in light mode, at worst 1.23:1. The badge now carries its colour in a dot and its label in the theme's text colour.
- **Keyboard and screen reader.** The group colour picker is a real radio group, hover-only controls appear on focus, the comparison table has a caption and scoped headers, the theme menu reports which theme is selected, and the chip remove button is reachable and no longer 15px.
- **Ceilings are enforced when you hit them**, not silently applied on the next load.
- **The README describes what the code does**, including the commands, the data files and the Docker path.
- Rewrote the 49 site descriptions that used an em dash as a clause separator.

## [v2.2.1] - 2026-08-24

### Added
- Add Agent QA to Dev Tools (submitted in #8 by @pranshuchittora), bringing the directory to 590 sites.
- Add `npm run serve` for a supported local HTTP development server.

### Fixed
- Sync the hardcoded 589-site count in the browser test, page metadata, manifest, and hero copy with the new total.
- Hide closed native dialogs instead of displaying them over the directory on first load.
- Pre-cache the directory's JSON data, collections page, widget, and feeds for offline reloads.

## [v2.1.1] - 2026-06-25

### Fixed
- Update LibRedirect URL from dead GitHub Pages to `libredirect.manerakai.com`
- Update Greenshot URL from `getgreenshot.org` (SSL broken) to `greenshot.org`
- Update Yacht URL from `yacht.sh` (404) to `dev.yacht.sh`
- Update Stirling-PDF URL from `stirlingtools.com` (expired cert) to `stirlingpdf.io`

### Removed
- HashKiller (site down, 522 origin failure)
- SmallDev.tools (domain expired, DNS dead)
- Hitomi Downloader (GitHub repo deleted/DMCA'd)
- Anna's Archive (domain seized, DNS unreachable)

### Fixed
- Link check workflow: remove invalid `--exclude-mail` flag (not supported in lychee v0.23.0)

## [v2.1.0] - 2026-06-16

### Added
- Per-entry `openSource` and `requiresAuth` metadata across all 593 sites
- Toggle filters for open source only and no account required views
- URL persistence for metadata filters via `oss=1` and `noauth=1`

## [v2.0.0] - 2026-06-15

### Added
- Fuzzy search with match highlighting and relevance-ranked results
- Sort modes: A-Z, Z-A, Shuffle (persisted in URL)
- 10 themes: OLED Dark, Catppuccin Mocha, Dracula, Rosé Pine, Nord, GitHub Dark, Midnight Blue, Solarized Dark, Light, System
- Bookmarks v2: star sites, organize into color-coded groups, drag-and-drop reorder
- Bookmark export/import (JSON)
- Shareable URL state (`?q=&cat=&sort=&view=`)
- Keyboard navigation: arrows between cards, Enter/Shift+Enter to open, `/` to search, `?` for shortcut help
- Copy filtered list as Markdown
- Random site button
- Web Share API integration
- Wayback Machine link on every card
- Back-to-top button
- Skip-to-content link
- Open Graph and Twitter Card meta tags
- JSON-LD structured data (WebSite + SearchAction)
- Inline SVG favicon
- `<noscript>` fallback message
- View Transitions API for filter changes (progressive enhancement)
- GitHub Issue form template for site submissions
- Lighthouse CI workflow
- Weekly dead-link checker via lychee-action

### Changed
- Card redesign: compact layout with inline favicon, hover-reveal overflow actions
- Hero section tightened for faster content access
- Grid gap and card sizing refined for denser, more scannable layout
- Description clamped to 2 lines
- Toast notifications: debounced, fade transition
- Sort dropdown: styled for dark themes
- Category badge colors: light-theme contrast overrides for WCAG AA
- Card entry animations: `@starting-style` replaces `@keyframes` + inline delays
- Card actions: delegated event listeners replace inline onclick handlers

### Fixed
- Self-XSS via bookmark group names (escHtml sanitization)
- Clipboard API fallback for insecure contexts
- Toast timer accumulation on rapid actions
- Dock sticky position (56px → 64px to match header height)
- meta theme-color updates dynamically per theme
- Defensive localStorage JSON parsing prevents crash on corrupted data
- Import validation: malformed bookmark entries are skipped instead of corrupting state
- Blanket `var(--transition)` replaced with targeted property transitions

### Accessibility
- ARIA roles, labels, and live regions on all interactive elements
- `prefers-reduced-motion` media query
- `:focus-visible` indicators across all themes
- `@media (forced-colors: active)` for Windows High Contrast
- Filter buttons: `aria-pressed` state
- View toggles: `aria-pressed` state
- Bookmark buttons: `aria-pressed` + descriptive labels
- Results count: `aria-live="polite"`
- Modal: native `<dialog>` with focus return
- Touch targets: 40px minimum on mobile

### Removed
- Dead CSS variables: `--transition`, `--bg-glass`, `--noise-opacity`
- Card preview placeholder (180px gray box replaced by compact inline favicon)

## [v1.0.0] - 2026-03-04

- Initial release: 470 sites across 25 categories
- Single-file HTML directory with search, category filters, grid/list views
- OLED dark theme with glassmorphism

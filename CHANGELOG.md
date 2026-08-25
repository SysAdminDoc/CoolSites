# Changelog

All notable changes to CoolSites will be documented in this file.

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

## Roadmap archive — 2026-08-10 — ROADMAP.md

<details>
<summary>Original roadmap snapshot</summary>

```markdown
# CoolSites Roadmap

Single-file curated directory (593 sites, 30 categories). Roadmap tracks additions beyond v1.0.0 while preserving the zero-build, single-HTML constraint.

## Planned Features

### Core / Data
- Extract the `SITES` array to `sites.json` loaded via `fetch('./sites.json')` at runtime so contributions don't require editing a 10k-line HTML file
- JSON schema + `npm run lint` script (single Node file, no build step for the page) that validates each entry has `name`, `url`, `description`, `category`, `tags`
- Category metadata (color, blurb, slug) centralized in `categories.json` instead of inline CSS classes
- `updatedAt` timestamp per entry so "Recently Added" becomes a real view

### UI/UX
- Compare/multi-select: pick 2-5 sites, show a side-by-side attribute table

### Performance
- Virtualize card rendering past ~200 visible results so 470+ entries don't thrash layout
- Pre-generate a 32x32 sprite of favicons at build time (optional) to avoid 470 Google favicon fetches

### Integrations
- GitHub star count badge per entry (cached JSON pulled by the weekly Action, not live-fetched)
- RSS / Atom feed of recently added sites

### Packaging
- Tag every release (`v1.x`) and attach a minified single-file `index.html` as a release asset
- Docker one-liner (`docker run -p 8080:80 ghcr.io/sysadmindoc/coolsites`) for self-hosters that don't use GitHub Pages

## Nice-to-Haves

- Collections (curated sub-lists like "Homelab starter pack," "OSINT 101") rendered as a separate page
- Per-site screenshots via a once-a-month Playwright CI job, stored as thumbnails in `/thumbs/`
- Embeddable widget (`<iframe>` or Web Component) so other sites can drop in a filtered CoolSites list

## Research-Driven Additions

### P2 — Search & Discovery

- [ ] P2 — `alternativeTo` field per entry
  Why: Enables "alternatives to X" discovery — searching "Notion" shows entries that list Notion as alternative
  Evidence: AlternativeTo.net's core UX pattern; most-requested directory feature
  Touches: SITES array entries, search logic, card UI (show "Alternative to: X" badge)
  Acceptance: Searching "Notion" surfaces both Notion itself and entries listing it as an alternative
  Complexity: M

### P2 — Code Quality & Hardening

- [ ] P2 — Self-host fonts or add SRI to Google Fonts
  Why: Google Fonts loaded without `integrity` — CDN compromise would inject arbitrary CSS
  Evidence: `index.html:11` — `<link>` tag with no SRI attributes
  Touches: `index.html` — `<head>` font links
  Acceptance: Fonts load from local files or CDN with SRI hash
  Complexity: M
```

</details>

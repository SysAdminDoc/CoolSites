# CoolSites Roadmap

Single-file curated directory (470 sites, 25 categories). Roadmap tracks additions beyond v1.0.0 while preserving the zero-build, single-HTML constraint.

## Planned Features

### Core / Data
- Extract the `SITES` array to `sites.json` loaded via `fetch('./sites.json')` at runtime so contributions don't require editing a 10k-line HTML file
- JSON schema + `npm run lint` script (single Node file, no build step for the page) that validates each entry has `name`, `url`, `description`, `category`, `tags`
- Automated dead-link checker GitHub Action (weekly) that opens an issue listing any 4xx/5xx/TLS failures
- Category metadata (color, blurb, slug) centralized in `categories.json` instead of inline CSS classes
- `updatedAt` timestamp per entry so "Recently Added" becomes a real view

### UI/UX
- Persistent URL state: `?q=...&cat=...&view=grid|list&sort=...` for shareable filtered views
- Sort modes: alphabetical, recently added, random shuffle, popularity (from star counts if the repo is a GitHub URL)
- Keyboard navigation of cards (arrow keys, Enter to open, Shift+Enter for new tab)
- "Copy as Markdown list" and "Copy as OPML" for the current filter
- Compare/multi-select: pick 2-5 sites, show a side-by-side attribute table
- Light theme toggle (dark remains default) with `prefers-color-scheme` fallback

### Performance
- Virtualize card rendering past ~200 visible results so 470+ entries don't thrash layout
- Pre-generate a 32x32 sprite of favicons at build time (optional) to avoid 470 Google favicon fetches
- IntersectionObserver lazy-load for favicons and descriptions

### Integrations
- GitHub star count badge per entry (cached JSON pulled by the weekly Action, not live-fetched)
- Wayback Machine fallback link on each card
- "Submit a site" form powered by a GitHub Issue template that round-trips to a PR via a small Action
- RSS / Atom feed of recently added sites

### Packaging
- Tag every release (`v1.x`) and attach a minified single-file `index.html` as a release asset
- Optional PWA manifest so the directory installs as a desktop/mobile app (works fully offline after first load)
- Docker one-liner (`docker run -p 8080:80 ghcr.io/sysadmindoc/coolsites`) for self-hosters that don't use GitHub Pages

## Competitive Research

- **awesome-selfhosted** — Markdown-list model wins on contributor volume but loses on discoverability; CoolSites's search + categories is the differentiator, keep doubling down.
- **free-for.dev** — Similar curation ethos, markdown-driven, ~1000 entries; their CI checks for HTTPS and broken anchors are worth porting to CoolSites's link checker.
- **Free Public APIs / public-apis** — Shows the value of tags and auth metadata; adding a `requiresAuth` / `freeTier` field per entry is a natural next step.
- **AlternativeTo** — Benchmark for the "show me alternatives to X" UX; a lightweight `alternativeTo: ["Google Drive"]` field would unlock that view without a DB.

## Nice-to-Haves

- Personal "saved" list stored in `localStorage`, exportable as JSON
- Collections (curated sub-lists like "Homelab starter pack," "OSINT 101") rendered as a separate page
- Per-site screenshots via a once-a-month Playwright CI job, stored as thumbnails in `/thumbs/`
- "Random cool site" button that picks from the current filter
- Dark-mode accent picker (user chooses the glow color)
- Embeddable widget (`<iframe>` or Web Component) so other sites can drop in a filtered CoolSites list

## Open-Source Research (Round 2)

### Related OSS Projects
- **awesome-selfhosted** — https://github.com/awesome-selfhosted/awesome-selfhosted — Massive curated list of free software network services self-hostable on your own servers (~288k stars).
- **awesome-foss/awesome-sysadmin** — https://github.com/awesome-foss/awesome-sysadmin — Canonical curated list of OSS sysadmin resources organized by category.
- **Lissy93/awesome-privacy** — https://github.com/Lissy93/awesome-privacy — Privacy & security-focused software/services with per-entry rationale.
- **pluja/awesome-privacy** — https://github.com/pluja/awesome-privacy — Privacy-respecting alternatives catalog with category-per-file structure.
- **juandecarrion/awesome-self-hosted** — https://github.com/juandecarrion/awesome-self-hosted — Simpler, older self-hosted alternatives list.
- **awesome.ecosyste.ms** — https://awesome.ecosyste.ms/lists?topic=self-hosted — Meta-aggregator that indexes and cross-references all awesome lists by topic tag.
- **awesome-selfhosted.net** — https://awesome-selfhosted.net/ — Web-rendered version of the main awesome-selfhosted list with license/language filters.
- **nocodb/awesome-foss-apps** — https://github.com/nocodb/awesome-foss-apps — FOSS apps list with live star counts updated nightly.

### Features to Borrow
- YAML/JSON source-of-truth data file with a generator that renders `index.html`, `README.md`, and a JSON feed — borrow from `awesome-selfhosted` (they generate the site + markdown from YAML metadata in `/tags/` and `/software/`).
- Per-entry metadata: license, language, platform, last-commit date, stars — borrow from `hugodina/awesome-sysadmin` (fork that displays live star counts/forks).
- Non-free companion list (proprietary-but-self-hostable) in a sibling file — borrow from `awesome-selfhosted/non-free.md`.
- Topic tags in addition to categories for multi-axis filtering — borrow from `awesome.ecosyste.ms` (indexes by `topic=` query param).
- Dead-link scanner CI job that opens an issue when a site 404s — borrow from `awesome-selfhosted` GitHub Actions.
- Submission template (issue form) that enforces required fields (URL, license, language, description ≤140 chars) — borrow from `awesome-foss/awesome-sysadmin` PR template.
- "Anti user-freedom feature" flags (telemetry, lock-in, requires account) as per-entry badges — borrow from `awesome-selfhosted/non-free.md` rationale paragraph.

### Patterns & Architectures Worth Studying
- `awesome-selfhosted` static site generator pipeline: YAML frontmatter → Jekyll/Hugo → deployed site + syndicated markdown. Ideal for keeping a single source of truth across `index.html` and `README.md`.
- `awesome.ecosyste.ms` — indexer that ingests other awesome lists; shows how to build a meta-directory of directories and expose per-tag rollups via URL params.
- `Lissy93/web-check`-style scoring: fetch each listed site's headers/CSP/TLS on a schedule and surface a quality/safety score inline in the directory.

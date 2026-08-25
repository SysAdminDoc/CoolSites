# CoolSites

![Version](https://img.shields.io/badge/version-2.3.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Sites](https://img.shields.io/badge/sites-588-blueviolet)
![Categories](https://img.shields.io/badge/categories-30-orange)
![Status](https://img.shields.io/badge/status-active-success)
![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-222?logo=github&logoColor=white)

> A curated directory of 588 free tools, open source projects, and hidden gems across 30 categories, built for sysadmins, devs, creators, homelabbers, and the endlessly curious.

**[Browse the directory](https://sysadmindoc.github.io/CoolSites/)**

Pick a category, search, star what you want to keep, and the directory remembers
your groups in the browser. Nothing is sent anywhere. There is no account, no
backend and no tracking of any kind.

## Features

- **588 curated sites** across 30 categories, every entry hand-picked and described
- **Search that narrows.** Every word you type has to match. Names tolerate typos, longer fields need a real match, and hits are highlighted.
- **Filters that stack.** Category, open source only, no account needed, and staff picks all combine, with live counts on each.
- **Sorting.** A to Z, Z to A, recently added, shuffle, or the default with your bookmarks floated to the top.
- **Ten themes.** Eight dark (OLED, Catppuccin, Dracula, Nord, Rosé Pine, GitHub Dark, Midnight, Solarized), one light, and a system option that follows the OS.
- **Bookmarks with groups.** Star a site, sort it into a colour-coded group, drag to reorder. Removing a bookmark or deleting a group can be undone.
- **Export and import.** Bookmarks download as versioned JSON and restore on any device. Imports are validated entry by entry and report what they skipped.
- **Grid and list views**, remembered in the URL along with your search, category, sort and filters, so a view can be shared as a link.
- **Keyboard first.** `/` focuses search, arrows move between cards, Enter opens, `?` lists every shortcut.
- **Copy as Markdown**, so the current filtered list can be pasted into notes or an issue.
- **Random pick** from whatever is on screen, and a Wayback Machine link on every card.
- **Compare** up to five sites side by side.
- **Feeds.** Atom and JSON Feed of recent entries, generated at build time.
- **Works offline** after the first visit, and says so when it is showing you cached data.
- **No third-party requests.** Fonts and favicons ship with the site. Nothing loads from a CDN, and nothing calls home.
- **No runtime dependencies.** Static HTML, CSS, JavaScript and JSON. No framework, no build step to view it.
- **Accessible.** Body text clears WCAG AA in every theme, with visible focus, live regions, a skip link, and reduced-motion and forced-colors support.
- **Self-hostable** on GitHub Pages, any static web server, or the local server in this repo.

## Categories

| Category         | Sites | Highlights |
|------------------|:-----:|-----------|
| Desktop Software | 50    | DevToys, PowerToys, Files, Everything, ShareX, VLC, Ventoy, HWiNFO |
| Homelab          | 39    | Uptime Kuma, Proxmox, Tailscale, Pi-hole, Jellyfin, Immich, Paperless-ngx |
| Dev Tools        | 35    | Regex101, Hoppscotch, CodePen, StackBlitz, Zed, Cursor, Playwright |
| AI & ML          | 32    | Ollama, Open WebUI, LM Studio, ComfyUI, Hugging Face, Groq, Dify |
| Creative         | 30    | Blender, Figma, Photopea, Excalidraw, Penpot, Coolors, fffuel.co |
| Sysadmin         | 27    | Grafana, Netdata, Prometheus, Terraform, Wazuh, Cockpit, btop |
| Fun & Culture    | 26    | Neal.fun, Radio Garden, Shadertoy, Geoguessr, xkcd, Noclip, Wiby |
| Privacy          | 25    | Mullvad, Tor, Signal, ProtonMail, SearXNG, uBlock Origin, Tails |
| Security         | 25    | CyberChef, Have I Been Pwned, VirusTotal, OWASP ZAP, Qualys SSL Labs |
| Productivity     | 24    | Obsidian, Notion, Linear, Cal.com, Stirling PDF, NocoDB, Typst |
| Education        | 21    | freeCodeCamp, Khan Academy, MIT OCW, CS50, LeetCode, Nand2Tetris |
| CLI Tools        | 20    | fzf, ripgrep, bat, eza, lazygit, lazydocker, neovim, starship |
| News & Reference | 20    | Hacker News, ArchWiki, Stack Overflow, AlternativeTo, free-for.dev |
| OSINT            | 19    | Shodan, Censys, Wayback Machine, SpiderFoot, TinEye, BuiltWith |
| Torrenting       | 18    | qBittorrent, Transmission, Deluge, Jackett, Prowlarr, Stremio |
| Gaming           | 16    | RetroArch, itch.io, Lichess, Board Game Arena, OpenTTD, RPCS3 |
| AI Creative      | 15    | Midjourney, Suno, Runway, ElevenLabs, Remove.bg, Recraft, Pika |
| File Tools       | 15    | Cobalt, yt-dlp, FFmpeg, HandBrake, Pandoc, Croc, PDF24 |
| IP & Network     | 15    | BGP.Tools, IPinfo.io, ping.pe, Robtex, HackerTarget, ViewDNS |
| Media Downloads  | 13    | yt-dlp, Cobalt, JDownloader, gallery-dl, Stremio |
| Networking       | 13    | Wireshark, nmap, PuTTY, mRemoteNG, NetBox, Netbird, WinSCP |
| Data & Viz       | 12    | Metabase, Apache Superset, Datawrapper, D3.js, Mermaid Live, Kepler.gl |
| Reading          | 11    | Calibre, Readarr, Kavita, Libby, Standard Ebooks |
| Arr Stack        | 10    | Sonarr, Radarr, Lidarr, Prowlarr, Bazarr, Overseerr |
| Automation       | 10    | n8n, Node-RED, Huginn, Apache Airflow, Pipedream, Make, Temporal |
| DNS Tools        | 10    | whatsmydns.net, DNSViz, MXToolbox, DNS Leak Test, Zonemaster |
| Music & Audio    | 10    | Ardour, LMMS, Vital, Mixxx, MuseScore, Bandlab, Freesound |
| Speed Tests      | 10    | Cloudflare, Fast.com, Waveform Bufferbloat, LibreSpeed, M-Lab |
| Containers       | 9     | Docker, Podman, k3s, Lens, Helm, ArgoCD, Harbor, Rancher |
| Indexes & Wikis  | 8     | ArchWiki, Gentoo Wiki, FMHY, Awesome Privacy |

## Quick Start

CoolSites is a static site with no runtime dependencies. It loads its data from
companion JSON files, so it needs to be served over HTTP rather than opened from
disk.

### GitHub Pages (recommended)

1. Fork this repository
2. Go to **Settings** > **Pages**
3. Set source to `main` branch, root folder
4. Your directory is live at `https://yourusername.github.io/CoolSites/`

### Local

```bash
git clone https://github.com/SysAdminDoc/CoolSites.git
cd CoolSites
npm run serve
```

Open the printed `http://127.0.0.1:4173/` address. Opening `index.html` straight
from disk will not work, because browsers block `file://` fetches; the page says
so and tells you to run the server if you try.

### Any other web server

Copy the repository contents into the document root. It works with nginx,
Apache, Caddy, or `python3 -m http.server`. There is no client-side routing, so
don't add a catch-all rewrite to `index.html`. It would turn every typo into a
page that looks like the homepage but isn't.

Two things are worth excluding from the document root if you can: the `.git`
directory and anything starting with a dot. The bundled `npm run serve` already
refuses them.

The content security policy travels in a `<meta>` tag, so it applies wherever
you host the page, including GitHub Pages.

### Security headers

Three things a meta tag cannot do, so they need a real server. GitHub Pages
sends none of them, which is worth knowing rather than assuming: the hosted copy
can be framed by anyone and browsers are free to sniff content types.

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

Sent as a header, the policy takes precedence over the meta tag and adds
`frame-ancestors`, which browsers ignore in a meta tag. `npm run serve` already
sends all four, so local development matches a properly configured host.

On nginx, remember that `add_header` does not inherit into a `location` block
that sets any header of its own, so these have to be repeated in each one rather
than declared once at the server level.

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   sites.json     │────>│   Filter Engine  │────>│   Card Renderer  │
│                  │     │                  │     │                  │
│  One JSON entry  │     │  Category match  │     │  Grid / List     │
│  Name, URL,      │     │  + Fuzzy search  │     │  + View Trans.   │
│  Desc, Tags,     │     │  + Sort modes    │     │  + Lazy favicons │
│  Metadata        │     │  + Metadata      │     │                  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

Data and generated feeds live beside `index.html`:

| File | What it holds |
|------|---------------|
| `sites.json` | Every entry: name, URL, description, category, tags, open source and account flags |
| `categories.json` | Category names, colours and blurbs |
| `collections.json` | Curated sub-lists rendered by `collections.html` |
| `favicons.json` | Icons inlined as data URIs so no icon is fetched at runtime |
| `stars.json` | Cached GitHub star counts, refreshed locally, never fetched by the browser |
| `feeds/` | Atom and JSON Feed of recent entries, generated by `npm run generate` |
| `schemas/` | JSON Schema for the site, category and collection shapes |

No tracking, no cookies, no analytics, and no third-party requests. Bookmarks
live in `localStorage` and never leave the browser.

### Commands

```bash
npm run serve      # local HTTP server on 127.0.0.1:4173
npm run lint       # validate the data, feeds, and every version and count string
npm run generate   # regenerate feeds and sync versions and counts
npm run build      # lint sources, generate, then re-validate
npm test           # drive the app in headless Chrome over CDP
npm run package    # write dist/ with a minified single-page build
npm run check:links      # check every URL in sites.json and write a report
npm run update:stars     # refresh stars.json (set GITHUB_TOKEN to avoid the 60/hour cap)
npm run update:favicons  # refresh favicons.json
```

There is no lockfile because there is nothing to lock. No runtime dependencies,
no dev dependencies, no framework, no build step to view the page. That is a
deliberate choice rather than an oversight, and `npm run lint` enforces it: the
day a dependency appears in `package.json` without a `package-lock.json` beside
it, the build fails.

`npm run lint` is the gate that matters. It validates every data file against
the schemas, rejects duplicate and colliding URLs, checks the generated feeds
match the data, and fails when any version or count string in `index.html`,
`manifest.json`, `sw.js` or this README has drifted from `package.json` and
`sites.json`.

### Entry dates

Two fields, and they mean different things. `updatedAt` is when the entry's own
text last changed. `lastReviewedAt` is when a person last opened the site and
confirmed the entry still describes it.

Most of the directory carries `2026-06-25` and no `lastReviewedAt`. That is the
date of one bulk import, not a review, and pretending otherwise is what made the
"recent" sort and the feeds alphabetical order with a timestamp attached. So the
feeds now publish only entries with a real `lastReviewedAt`, which is a short
list and an honest one.

After you have actually checked an entry:

```bash
npm run review -- https://example.com              # reviewed today, text unchanged
npm run review -- https://example.com --changed    # the entry's text changed too
npm run review -- --list                           # how much is still unreviewed
```

`npm run lint` enforces the rest: no future dates, no review dated before the
change it reviewed, a `lastReviewedAt` on anything not left over from the
import, and a ceiling on how many entries may carry the import date, so nothing
new can be filed under it to dodge the rule.

### Diagnostics

Add `?debug=1` to the URL and a panel opens with the app version, where the data
came from, how old it is, the service worker state, which caches exist and how
much they hold, and every error since the page loaded. Two recovery actions sit
at the bottom: copy the report, or clear the caches, unregister the worker and
reload.

It reads this browser and shows you what it found. Nothing is sent anywhere,
there is no analytics of any kind in this project, and the panel never opens
without the parameter. It is most useful on a self-hosted copy that is serving
stale data, which is almost always an old cache the worker is still holding.

### Checking links

`npm run check:links` walks every URL in `sites.json` and writes a JSON report to
`work/link-check.json`. The whole directory takes about a minute. It never writes
to `sites.json`, because whether a dead entry should be repaired or removed is an
editorial call.

The point of it is telling apart things that look identical from a script:

| Status | Meaning |
|--------|---------|
| `ok` | reachable at the URL on file |
| `moved` | permanently redirected somewhere genuinely different, so the entry is stale |
| `redirect` | temporary redirect, nothing to do |
| `blocked` | a bot wall: it refused this client but serves a browser fine |
| `dead` | 404 or 410 for everyone, including a browser |
| `tls` | certificate or handshake failure |
| `dns` | the hostname no longer resolves |
| `timeout` | no answer inside the timeout, twice |
| `error` | anything else: a dropped connection, a CDN edge failure, a 500, a redirect that goes nowhere |

`dead`, `tls` and `dns` set a non-zero exit code. Everything else is
information.

Only a 404 or a 410 counts as dead. A 500 or a 503 is a broken server, not a
removed page, and failing the run on one would tell you to delete a live entry.

Before calling anything dead it asks once more with a browser user agent and
downgrades to `blocked` if that works, because bot walls answer scripts with
404s and 503s just as readily as with 403s. One of them handed back a 404 to
the checker while serving a real page to Chrome. The retry also checks the
browser landed on the same URL, so a parked domain that redirects every path to
its homepage does not get read as proof of life.

Useful flags: `--filter <text>` to check one site, `--limit <n>` for a quick
sample, `--concurrency <n>` (default 8), `--timeout <ms>` (default 15000), and
`--out <path>` to put the report somewhere else.

```bash
npm run check:links -- --filter github.com
npm run check:links -- --concurrency 12 --timeout 20000
```

## Embedding

`widget.js` drops a short list of entries onto another page. One script tag, no
dependencies, and exactly one request, to `sites.json` beside it. It renders in a
shadow root so nothing leaks either direction.

```html
<script src="https://your-host/CoolSites/widget.js"
        data-category="Homelab"
        data-limit="8"></script>
```

| Attribute | Meaning |
|-----------|---------|
| `data-category` | Show only this category, spelled exactly as the directory does. An unknown name says so rather than rendering an empty box. |
| `data-limit` | How many entries, 1 to 50. Anything else falls back to 8. |
| `data-target` | CSS selector for where to mount. Defaults to the script tag's parent. |
| `data-theme` | `auto` (default), `light` or `dark`. |

It follows the reader's system theme unless you pin it, and you can repaint it
from the host page:

```css
coolsites-widget {
  --coolsites-bg: #fff;
  --coolsites-text: #111;
  --coolsites-muted: #666;
  --coolsites-border: rgba(0, 0, 0, .12);
  --coolsites-accent: #2563eb;
  --coolsites-radius: 8px;
}
```

The element carries its contract version in `data-version`. Offline, a timeout
and a failed load each say which one happened.

## Adding Sites

The easiest way is to [open a submission issue](https://github.com/SysAdminDoc/CoolSites/issues/new?template=submit-site.yml). Fill in the form and it gets reviewed from there.

To contribute directly, add an entry to `sites.json` and run `npm run build`:

```json
{
  "name": "Tool Name",
  "url": "https://example.com",
  "description": "What it does and why it is worth knowing about.",
  "category": "Dev Tools",
  "openSource": true,
  "requiresAuth": false,
  "updatedAt": "2026-08-25",
  "tags": ["tag1", "tag2", "tag3"],
  "editorsPick": true,
  "alternativeTo": ["Some Paid Thing"]
}
```

`editorsPick` and `alternativeTo` are optional; everything else is required and
enforced by `schemas/site.schema.json`. `category` has to be one of the names in
`categories.json`, and `npm run build` updates the per-category counts, the
feeds, and the counts in this README for you.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Structure | Semantic HTML5 with ARIA |
| Styling | Vanilla CSS (custom properties, `color-mix`, `content-visibility`, forced-colors) |
| Logic | Vanilla JavaScript, no framework |
| Fonts | Outfit and JetBrains Mono, self-hosted as woff2 |
| Icons | Inline SVG, plus favicons inlined as data URIs at build time |
| Hosting | GitHub Pages or any static web server |
| Local tooling | Node.js 22.17 or newer for the lint, build, package, test and server scripts |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| `Escape` | Clear the search box and close any open dropdown |
| `Arrow keys` | Move between cards |
| `Enter` | Open the focused card |
| `Shift+Enter` | Open the focused card in a new tab |
| `?` | Show the shortcut list |

## Contributing

Contributions are welcome. To add a site:

1. Fork the repository
2. Add your entry to `sites.json`
3. Run `npm run build`, which validates the entry and updates the counts and feeds
4. Open a pull request with the generated files included

**Guidelines**

- Every site has to be free, or have a free tier that is actually useful on its own.
- Descriptions say what it does and why it is worth knowing about. Keep them to a sentence or two.
- Prefer open source when there is a reasonable alternative.
- No affiliate links, no sponsored entries, no ads.

## License

MIT License. See [LICENSE](LICENSE) for details.

---

**[Browse the full directory](https://sysadmindoc.github.io/CoolSites/)** with all 588 sites.

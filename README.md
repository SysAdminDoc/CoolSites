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
you host the page, including GitHub Pages. If your server can send real headers,
`Content-Security-Policy` as a header takes precedence and also lets you add
`frame-ancestors`, which browsers ignore in a meta tag.

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
npm run update:stars     # refresh stars.json (set GITHUB_TOKEN to avoid the 60/hour cap)
npm run update:favicons  # refresh favicons.json
```

`npm run lint` is the gate that matters. It validates every data file against
the schemas, rejects duplicate and colliding URLs, checks the generated feeds
match the data, and fails when any version or count string in `index.html`,
`manifest.json`, `sw.js` or this README has drifted from `package.json` and
`sites.json`.

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

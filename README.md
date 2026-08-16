# CoolSites

![Version](https://img.shields.io/badge/version-2.2.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Sites](https://img.shields.io/badge/sites-590-blueviolet)
![Categories](https://img.shields.io/badge/categories-30-orange)
![Status](https://img.shields.io/badge/status-active-success)
![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-222?logo=github&logoColor=white)

> The ultimate curated directory of 590 free tools, open source software, AI projects, and hidden gems across 30 categories — built for sysadmins, devs, creators, homelabbers, and the endlessly curious.

### **[Browse the Directory](https://sysadmindoc.github.io/CoolSites/)**

**Live site:** https://sysadmindoc.github.io/CoolSites/

## Features

- **590 curated sites** across 30 categories — every entry hand-picked and described
- **Fuzzy search** with match highlighting — typo-tolerant, ranked by relevance
- **Category filters** with live counts — drill into any category instantly
- **Metadata filters** — toggle open source only or no account required views
- **Sort modes** — alphabetical (A-Z / Z-A), shuffle, or default with bookmarks on top
- **10 themes** — 8 dark (OLED, Catppuccin, Dracula, Nord, Rosé Pine, GitHub Dark, Midnight, Solarized), 1 light, plus system auto
- **Bookmarks with groups** — star sites, organize into color-coded groups, drag to reorder
- **Bookmark export/import** — download as JSON, restore on any device
- **Grid and list views** — toggle layouts, persisted in URL state
- **Shareable URLs** — filter state encoded in `?q=&cat=&sort=&view=&oss=&noauth=` for bookmarkable views
- **Keyboard navigation** — `/` to search, arrows to move, Enter to open, `?` for help
- **Copy as Markdown** — export the current filtered list as a markdown bullet list
- **Random site** — discover something new from the current filter
- **Web Share** — native share sheet on supported devices
- **Wayback Machine** — one-click archive lookup on every card
- **Back-to-top** — appears after scrolling, returns to search
- **Zero runtime dependencies** — static HTML, JSON, CSS, and JavaScript; no framework or backend
- **Responsive** — desktop, tablet (1024px breakpoint), and mobile layouts
- **Accessible** — ARIA roles, live regions, focus management, skip-to-content, forced-colors support, reduced-motion support
- **Favicon fallback** — locally cached icons first, then Google → DuckDuckGo → initial letter
- **Self-hostable** — serve the repository from GitHub Pages, Nginx, Docker, or the included local server

## Categories

| Category | Sites | Highlights |
|----------|:-----:|-----------|
| Desktop Software | 50 | DevToys, PowerToys, Files, Everything, ShareX, VLC, Ventoy, HWiNFO |
| Homelab | 39 | Uptime Kuma, Proxmox, Tailscale, Pi-hole, Jellyfin, Immich, Paperless-ngx |
| Dev Tools | 35 | Regex101, Hoppscotch, CodePen, StackBlitz, Zed, Cursor, Playwright |
| AI & ML | 32 | Ollama, Open WebUI, LM Studio, ComfyUI, Hugging Face, Groq, Dify |
| Creative | 30 | Blender, Figma, Photopea, Excalidraw, Penpot, Coolors, fffuel.co |
| Sysadmin | 27 | Grafana, Netdata, Prometheus, Terraform, Wazuh, Cockpit, btop |
| Security | 26 | CyberChef, Have I Been Pwned, VirusTotal, OWASP ZAP, Qualys SSL Labs |
| Privacy | 26 | Mullvad, Tor, Signal, ProtonMail, SearXNG, uBlock Origin, Tails |
| Fun & Culture | 26 | Neal.fun, Radio Garden, Shadertoy, Geoguessr, xkcd, Noclip, Wiby |
| Productivity | 24 | Obsidian, Notion, Linear, Cal.com, Stirling PDF, NocoDB, Typst |
| Education | 21 | freeCodeCamp, Khan Academy, MIT OCW, CS50, LeetCode, Nand2Tetris |
| CLI Tools | 20 | fzf, ripgrep, bat, eza, lazygit, lazydocker, neovim, starship |
| News & Reference | 20 | Hacker News, ArchWiki, Stack Overflow, AlternativeTo, free-for.dev |
| OSINT | 19 | Shodan, Censys, Wayback Machine, SpiderFoot, TinEye, BuiltWith |
| Torrenting | 18 | qBittorrent, Transmission, Deluge, Jackett, Prowlarr, Stremio |
| Gaming | 16 | RetroArch, itch.io, Lichess, Board Game Arena, OpenTTD, RPCS3 |
| IP & Network | 15 | BGP.Tools, IPinfo.io, ping.pe, Robtex, HackerTarget, ViewDNS |
| AI Creative | 15 | Midjourney, Suno, Runway, ElevenLabs, Remove.bg, Recraft, Pika |
| File Tools | 15 | Cobalt, yt-dlp, FFmpeg, HandBrake, Pandoc, Croc, PDF24 |
| Media Downloads | 14 | yt-dlp, Cobalt, JDownloader, gallery-dl, Stremio |
| Networking | 13 | Wireshark, nmap, PuTTY, mRemoteNG, NetBox, Netbird, WinSCP |
| Data & Viz | 12 | Metabase, Apache Superset, Datawrapper, D3.js, Mermaid Live, Kepler.gl |
| Reading | 12 | Calibre, Readarr, Kavita, Libby, Standard Ebooks |
| DNS Tools | 10 | whatsmydns.net, DNSViz, MXToolbox, DNS Leak Test, Zonemaster |
| Automation | 10 | n8n, Node-RED, Huginn, Apache Airflow, Pipedream, Make, Temporal |
| Music & Audio | 10 | Ardour, LMMS, Vital, Mixxx, MuseScore, Bandlab, Freesound |
| Speed Tests | 10 | Cloudflare, Fast.com, Waveform Bufferbloat, LibreSpeed, M-Lab |
| Arr Stack | 10 | Sonarr, Radarr, Lidarr, Prowlarr, Bazarr, Overseerr |
| Containers | 9 | Docker, Podman, k3s, Lens, Helm, ArgoCD, Harbor, Rancher |
| Indexes & Wikis | 9 | ArchWiki, Gentoo Wiki, FMHY, awesome-selfhosted |

## Quick Start

CoolSites is a static site with no runtime dependencies. The directory loads its validated data from companion JSON files, so use an HTTP server for local development.

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

Open the printed `http://127.0.0.1:4173/` address. Opening `index.html` directly with `file://` cannot load the companion JSON files in browsers that restrict local fetches; the page displays this local-server instruction if attempted.

### Self-hosted

Copy the repository contents into any web server's document root. Works with Nginx, Apache, Caddy, or `python3 -m http.server`.

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   sites.json     │────>│   Filter Engine  │────>│   Card Renderer  │
│                  │     │                  │     │                  │
│  590 entries     │     │  Category match  │     │  Grid / List     │
│  Name, URL,      │     │  + Fuzzy search  │     │  + View Trans.   │
│  Desc, Tags,     │     │  + Sort modes    │     │  + Lazy favicons │
│  Metadata        │     │  + Metadata      │     │                  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

The runtime stays dependency-free while data and generated feeds live beside `index.html`:
- **CSS** — 10 themes via custom properties, glassmorphism, responsive grid, forced-colors support
- **HTML** — semantic structure with ARIA, skip link, native `<dialog>`, `<noscript>` fallback
- **JavaScript** — fuzzy search, metadata filters, bookmark engine with groups and drag-drop, URL state, view transitions

No tracking. No cookies. No analytics. Most favicon metadata is bundled locally; uncached icons may use Google or DuckDuckGo fallback endpoints.

## Adding Sites

The easiest way is to [open a submission issue](https://github.com/SysAdminDoc/CoolSites/issues/new?template=submit-site.yml) — fill in the form and we'll add it.

To contribute directly, edit `sites.json` and run `npm run lint`:

```javascript
{
  name: "Tool Name",
  url: "https://example.com",
  description: "What it does and why it's cool.",
  category: "Category Name",
  openSource: true,
  requiresAuth: false,
  tags: ["tag1", "tag2", "tag3"]
},
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Structure | Semantic HTML5 with ARIA |
| Styling | Vanilla CSS (custom properties, content-visibility, forced-colors) |
| Logic | Vanilla JavaScript (ES6+) |
| Fonts | Outfit (display) + JetBrains Mono (monospace) |
| Icons | Inline SVGs + Google Favicon API + DuckDuckGo fallback |
| Hosting | GitHub Pages (static) |
| Local tooling | Node.js 20+ lint, build, package, and server scripts |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Focus search |
| `Escape` | Clear search / close dropdown |
| `Arrow keys` | Navigate between cards |
| `Enter` | Open focused card's link |
| `Shift+Enter` | Open in new tab |
| `?` | Show keyboard shortcuts help |

## Contributing

Contributions are welcome. To add a site:

1. Fork the repository
2. Add your entry to `sites.json`
3. Ensure the URL is valid and the description is concise
4. Submit a pull request

**Guidelines:**
- Every site should be free (or have a meaningful free tier)
- Descriptions should explain *what it does* and *why it's notable*
- Prefer open source when alternatives exist
- No affiliate links, no sponsored content, no ads

## License

MIT License. See [LICENSE](LICENSE) for details.

---

**[Browse the full directory](https://sysadmindoc.github.io/CoolSites/)** — 590 sites and counting.

https://sysadmindoc.github.io/CoolSites/

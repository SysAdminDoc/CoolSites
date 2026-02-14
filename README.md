# CoolSites

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Sites](https://img.shields.io/badge/sites-470-blueviolet)
![Categories](https://img.shields.io/badge/categories-25-orange)
![Status](https://img.shields.io/badge/status-active-success)
![GitHub Pages](https://img.shields.io/badge/hosted-GitHub%20Pages-222?logo=github&logoColor=white)

> The ultimate curated directory of 470 free tools, open source software, AI projects, and hidden gems across 25 categories — built for sysadmins, devs, creators, homelabbers, and the endlessly curious.

### **[Browse the Directory](https://sysadmindoc.github.io/CoolSites/)**

## Features

- **470 curated sites** across 25 categories — every entry hand-picked and described
- **Instant search** — filter by name, description, category, URL, or tags
- **Category filters** with live counts — drill into any category instantly
- **Grid and list views** — toggle between card layout and compact list
- **Keyboard navigation** — press `/` to focus search, `Escape` to clear
- **One-click URL copy** — share any link without opening it first
- **Zero dependencies** — single HTML file, no frameworks, no build step, no backend
- **OLED dark theme** — deep blacks, glassmorphism, ambient glow effects
- **Responsive** — works on desktop, tablet, and mobile
- **Favicon detection** — auto-fetches site icons via Google's favicon API
- **Staggered card animations** — smooth entrance animations on load and filter
- **Self-hostable** — drop `index.html` anywhere and it just works

## Categories

| Category | Sites | Highlights |
|----------|:-----:|-----------|
| Desktop Software | 35 | DevToys, PowerToys, Files, Everything, ShareX, VLC, Ventoy, HWiNFO |
| AI & ML | 32 | Ollama, Open WebUI, LM Studio, ComfyUI, Hugging Face, Groq, Dify |
| Homelab | 31 | Uptime Kuma, Proxmox, Tailscale, Pi-hole, Jellyfin, Immich, Paperless-ngx |
| Dev Tools | 29 | Regex101, Hoppscotch, CodePen, StackBlitz, Zed, Cursor, Playwright |
| Creative | 26 | Blender, Figma, Photopea, Excalidraw, Penpot, Coolors, fffuel.co |
| Fun & Culture | 26 | Neal.fun, Radio Garden, Shadertoy, Geoguessr, xkcd, Noclip, Wiby |
| Productivity | 24 | Obsidian, Notion, Linear, Cal.com, Stirling PDF, NocoDB, Typst |
| Security | 21 | CyberChef, Have I Been Pwned, VirusTotal, OWASP ZAP, Qualys SSL Labs |
| Sysadmin | 21 | Grafana, Netdata, Prometheus, Terraform, Wazuh, Cockpit, btop |
| Education | 21 | freeCodeCamp, Khan Academy, MIT OCW, CS50, LeetCode, Nand2Tetris |
| News & Reference | 20 | Hacker News, ArchWiki, Stack Overflow, AlternativeTo, free-for.dev |
| CLI Tools | 20 | fzf, ripgrep, bat, eza, lazygit, lazydocker, neovim, starship |
| OSINT | 19 | Shodan, Censys, Wayback Machine, SpiderFoot, TinEye, BuiltWith |
| Privacy | 18 | Mullvad, Tor, Signal, ProtonMail, SearXNG, uBlock Origin, Tails |
| IP & Network | 15 | BGP.Tools, IPinfo.io, ping.pe, Robtex, HackerTarget, ViewDNS |
| AI Creative | 15 | Midjourney, Suno, Runway, ElevenLabs, Remove.bg, Recraft, Pika |
| File Tools | 15 | Cobalt, yt-dlp, FFmpeg, HandBrake, Pandoc, Croc, PDF24 |
| Networking | 13 | Wireshark, nmap, PuTTY, mRemoteNG, NetBox, Netbird, WinSCP |
| Data & Viz | 12 | Metabase, Apache Superset, Datawrapper, D3.js, Mermaid Live, Kepler.gl |
| Speed Tests | 10 | Cloudflare, Fast.com, Waveform Bufferbloat, LibreSpeed, M-Lab |
| DNS Tools | 10 | whatsmydns.net, DNSViz, MXToolbox, DNS Leak Test, Zonemaster |
| Automation | 10 | n8n, Node-RED, Huginn, Apache Airflow, Pipedream, Make, Temporal |
| Music & Audio | 10 | Ardour, LMMS, Vital, Mixxx, MuseScore, Bandlab, Freesound |
| Containers | 9 | Docker, Podman, k3s, Lens, Helm, ArgoCD, Harbor, Rancher |
| Gaming | 8 | RetroArch, itch.io, Lichess, Board Game Arena, OpenTTD, RPCS3 |

## Quick Start

CoolSites is a single HTML file — no build tools, no dependencies, no server required.

### GitHub Pages (recommended)

1. Fork this repository
2. Go to **Settings** > **Pages**
3. Set source to `main` branch, root folder
4. Your directory is live at `https://yourusername.github.io/CoolSites/`

### Local

```bash
git clone https://github.com/SysAdminDoc/CoolSites.git
cd CoolSites
open index.html
```

Or just download `index.html` and open it in any browser.

### Self-hosted

Drop `index.html` into any web server's document root. Works with Nginx, Apache, Caddy, or even `python3 -m http.server`.

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   SITES Array    │────>│   Filter Engine  │────>│   Card Renderer  │
│                  │     │                  │     │                  │
│  470 entries     │     │  Category match  │     │  Grid / List     │
│  Name, URL,      │     │  + Fuzzy search  │     │  + Animations    │
│  Desc, Tags      │     │  across fields   │     │  + Favicons      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

Everything lives in a single `index.html`:
- **CSS** — custom properties, glassmorphism, OLED dark theme, responsive grid
- **HTML** — semantic structure with header, hero search, filter bar, card grid, footer
- **JavaScript** — the `SITES` data array, category mapping, search/filter logic, and card rendering

No external API calls (except Google Favicons). No tracking. No cookies. No analytics.

## Adding Sites

Edit the `SITES` array inside `index.html`:

```javascript
{
  name: "Tool Name",
  url: "https://example.com",
  description: "What it does and why it's cool.",
  category: "Category Name",
  tags: ["tag1", "tag2", "tag3"]
},
```

If you're adding a new category, also add it to the `CATEGORY_MAP` object and create a corresponding CSS class:

```javascript
// In CATEGORY_MAP:
"New Category": "cat-newcat",

// In CSS:
.cat-newcat { background: rgba(R, G, B, 0.15); color: #hex; }
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Structure | Semantic HTML5 |
| Styling | Vanilla CSS with custom properties |
| Logic | Vanilla JavaScript (ES6+) |
| Fonts | Outfit (display) + JetBrains Mono (monospace) |
| Icons | Inline SVGs + Google Favicon API |
| Hosting | GitHub Pages (static) |

## Contributing

Contributions are welcome. To add a site:

1. Fork the repository
2. Add your entry to the `SITES` array in `index.html`
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

**[Browse the full directory](https://sysadmindoc.github.io/CoolSites/)** — 470 sites and counting.

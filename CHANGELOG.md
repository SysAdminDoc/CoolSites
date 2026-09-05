# Changelog

All notable changes to CoolSites will be documented in this file.

## [Unreleased]

### Fixed

- **Five entries said they were closed source while pointing straight at their own repository.** Fail2ban, PhoneInfoga, public-apis, Awesome Windows 11 and FMHY SafeGuard all read `openSource: false`, so the open-source-only filter hid tools whose code is one click away. Each licence was read from the project's own repository before the flag was changed. Agent QA keeps `openSource: false` and now says why: it is source-available under FSL-1.1-ALv2, which the OSI has not approved, and each release converts to Apache-2.0 after two years.
- **A permanent redirect a curator has looked at no longer gets reported forever.** Six entries land on a locale or marketing path where the address on file is the better thing to publish: `tools.pdf24.org` sends an English reader to `/en/` and a German one to `/de/`, so storing either would pick a language for everybody. A new `acceptedRedirect` field names the destination that was reviewed, and the checker reports `ok` while the redirect still goes there. Naming the destination rather than muting the entry is the point: when Red Hat's tracking parameter on the Ansible redirect changes, or a site moves a second time, it goes back to being reported. That took the flagged list from twenty entries to two.

- **Eight more entries were repointed or resolved.** Plex, Soundtrap, Lens and Seerr (formerly Overseerr) had all moved. LibRedirect's own project domain stopped resolving while its GPL extension carried on being developed, so the entry is the repository now. Algorithm Visualizer's hosted demo has refused every connection for weeks; its MIT repository has 48,700 stars and is still there, so the entry points at the source and says the demo is gone. crt.sh answers again on its own. Krea.ai loads perfectly in a browser and only fails for the checker, whose Node runtime rejects the site's response headers as oversized, so it carries a `checkDisabled` sentence saying exactly that. An entry the checker skips no longer shows a stale warning that re-running could never clear.

- **Six entries pointed at products that had changed hands or changed names.** Each redirect was followed on 2026-09-05 and the destination read before anything moved. SpiderFoot's site now lands on the corporate page of the company that bought it, so the entry points at the MIT project instead. Gitpod's company trades as Ona and sells something else now, while the AGPL project kept the name and is still actively developed, so the entry is the source you can host rather than the service you sign into. Phidata is Agno. Chatbot Arena is Arena AI, its third brand. Poolside FM is Poolsuite. Maltego's community-edition page is gone but the free tier is not, so it stays under the name the company actually uses. Every old name survives as a keyword, so searching for Phidata or Poolside FM still finds them.
- A project gets one entry. Stirling PDF and tldr pages were each listed twice, once by homepage and once by repository, which inflated the count and showed the same tool twice in a combined view. An optional `repository` field now carries both addresses on one entry, and lint treats `url` and `repository` as one address space so a second entry for a listed project fails the gate.

### Changed

- **The rules a submission is judged against are written down.** The two submissions this repository has turned down were judged against reasons invented in the reply thread, which is not fair to anyone who spends time on one. The README now states the free-tier floor with the worked example that prompted it, a six-month minimum age, what "still maintained" means in months, that affiliation has to be disclosed, and that a self-submission should also propose two entries the submitter has no stake in. The submission form asks for the first release date and the affiliation, and links the rules. The policy lives in the README rather than a `CONTRIBUTING.md` because this repository only tracks one Markdown file.

- **Tags are a shared vocabulary now, and everything else an entry is about moved to `keywords`.** 586 entries had grown 836 distinct tags, 639 of them shared by fewer than three sites, and four terms were in the list twice under two spellings: "open source" and "open-source", "package manager" and "package-manager", "metasearch" and "meta-search", "command line" and "command-line". A facet list shaped like that is not a way to browse, it is a second description, and it was the thing standing between the directory and tag filtering.

  The four pairs were merged into whichever spelling was already more common. What survives a floor of three entries is now `tags.json`, a 196-term list, and `tags` may only contain terms from it. The other 783 applications moved to a new `keywords` field rather than being deleted: search reads tags and keywords at the same weight, so no entry became harder to find, and the compare view still shows both. 42 entries share no term with three others and carry keywords alone.

  Adding a tag is now a deliberate edit to a shared file. Lint fails if an entry uses a tag that is not in the vocabulary, if a vocabulary tag falls below the floor, if the same word is in both fields, if two spellings of one term both get in, or if the file is unsorted.

### Fixed

- **Three assertions in the browser suite could fail on a busy machine and pass on a rerun.** All three were the same mistake: reading a value before it had stopped moving. The contrast probe waited a flat 300ms after switching theme, so under contention it read a colour partway through the change. The diagnostics panel was read while the service worker was still registering, and the panel renders once, so "registering" is what it said. The 375px layout probe measured before the web fonts applied, and so measured the fallback font's metrics rather than the ones a reader sees. Each failed roughly one run in fifteen, which is the worst kind of failure because it teaches people to rerun until green rather than to look. The contrast probe now polls until two consecutive reads agree on a value that has already moved off the previous theme's, and it runs under an eight-times CPU throttle, which makes the old fixed delay fail every run rather than one in fifteen. Ten consecutive runs under that throttle passed. The overflow assertion also names the widest boxes now, because "something overflows" is not something anyone can act on.

### Added

- **The cached data now says how old it is, and the page stops repeating it once it is too old.** `stars.json` and `favicons.json` are copies of somebody else's data, and a copy with no date on it is indistinguishable from a fresh one. A new `cache-manifest.json` records the command that wrote each, the sources it read, when the run finished, how many records it holds, how many fetches failed, and a SHA-256 of the file. The hash is the part that earns its place: a manifest carrying only a date would still read "fetched today" after a hand edit, so the lint compares the hash and the record count and fails when either moved without a refresh. `npm run update:stars` also records whether it ran with a token, because without one it stops at the first 403 and writes a partial refresh wearing today's date. Past 90 days the cards show no star count at all and the diagnostics panel says why. A cache with no manifest record is treated as undatable, which is the same problem.

- **A badge listed projects can put on their own site.** `badge.svg` is one static file with no font to fetch and no reference to anything outside itself, so a project that embeds it costs its own readers nothing and tells no third party who visited. Both halves paint their own background, which is what makes it legible on a white page and a black one. The README carries the HTML and the Markdown to paste. A directory with no way back from the things it lists is a directory nobody finds.

- **Search takes operators.** A quoted `"command line"` matches the phrase literally and in that order. `#dns` matches the tag exactly, so it never means `dnssec` the way typing the word does, and `#"open source"` reaches the two thirds of the vocabulary with a space in them. A leading `-` excludes: `-windows` drops anything that mentions it, `-#torrent` drops a whole tag. They combine. What is not an operator is read as words, so a dash typed mid-thought, a lone `#`, or a quote you have not closed yet narrows nothing rather than emptying the page, which matters when results update as you type. A plain query ranks exactly as it did.

- **Tags are a way to browse now, not just something search reads.** The rail carries a tag facet built from the 196-term vocabulary, an "Alternative to" facet over the products entries replace, and a count on every one of them. Facets combine with AND, so picking self-hosted and then docker narrows twice, and every count is measured against the list as it already stands rather than against the whole directory: a chip that promises 12 delivers 12. A term that would leave the reader with nothing is not offered at all, which is what makes the AND safe. Selections ride in the URL as  and , sorted so two people who narrowed to the same thing get the same link, and a strip above the results shows what is on with a remove button on each and one control that clears the lot. Search ranking is untouched: a facet filters the ranked list, it does not reorder it.

- **The directory now says when each link was last checked.** `npm run check:links` has always been able to tell a dead page from a bot wall, and has always thrown the answer away. Pass `--write` and it records `linkStatus` and `lastCheckedAt` on every entry it reached. Cards show the date, anything that did not answer normally says what happened, and a **Link issues** filter collects them into a shareable URL. On the first full run: 525 fine, 18 temporary redirects, 23 bot walls, 16 permanently moved, one timeout, two errors, one genuinely gone.

  It records an observation, not a verdict. Nothing else in an entry moves, and `lastCheckedAt` is deliberately not `lastReviewedAt`: a check says the URL answered, a review says a person opened the page and confirmed the entry still describes it. If a write would fail the lint it is rolled back rather than left for whoever pulls next. `checkDisabled` takes a sentence explaining why an entry is skipped, for the hosts that refuse every automated request no matter how politely it asks.

- **`favicons.json` is 28% smaller.** It ships in full on every visit, so it is the largest single thing a reader waits for, and four icons were 21% of it: a 58KB multi-resolution `.ico`, a 46KB PNG, a 43KB `.ico` and a 20KB one. The generator asks Google for a 32px icon, but Google has none for a long tail of domains and the fallbacks hand back whatever the site has. `npm run update:favicons` now decodes anything oversized in the headless Chrome that already runs the tests, redraws it at 32px and keeps whichever of WebP or PNG is smaller, and only when the result actually shrank. 827KB to 593KB across 525 domains, with the largest raster icon down from 58KB to 3KB. SVG is skipped, because rasterising a vector trades away the reason to keep it. An 8KB per-icon ceiling and a 700KB file ceiling now fail the lint rather than warn.

- **`script-src` no longer allows every inline script on the page.** It carried `'unsafe-inline'`, which is the directive doing the least work in any policy: it permits the page's own scripts and an injected one equally. Each inline script is now listed by SHA-256 digest, computed by `npm run generate` as its last step so the digests cover the scripts as they actually ship. Externalising the JavaScript would have worked too and would have cost the single-file build; hashes do not. Verified by injecting an unhashed script into a local copy and watching the browser refuse it.

  `style-src` still carries `'unsafe-inline'`, and the reason is worth stating rather than hiding: a hash covers a whole `<style>` element but not a `style=""` attribute, and there are 28 of those across the two pages. Covering them needs `'unsafe-hashes'`, which is not an improvement. Removing the attributes is the actual fix and is still on the roadmap.

  `npm run package` now refuses to write a build whose policy does not match its own scripts. That failure mode is silent otherwise: the page loads and does nothing, because the browser will not run JavaScript the policy does not name.

- **A shared link renders as a card instead of a bare URL.** Both pages now carry `og:image`, its dimensions, alt text and `twitter:card: summary_large_image`, pointing at a committed `social-card.png`. `node scripts/generate-social-card.js` renders it in headless Chrome from an HTML card with the repository's own fonts inlined, so it needs no network, no image library and no design tool. It carries no site count on purpose: a number on the card would mean rewriting a 114KB binary on every commit that adds an entry.

- **`sitemap.xml` and `robots.txt`.** The build writes the sitemap, whose `lastmod` is the date of the freshest entry rather than the moment the build ran, because a timestamp that moves when someone regenerates a feed teaches a crawler to stop believing the field. Both pages also declare a canonical URL, which neither did before. A test checks the advertised card really exists at the size the pages claim, since a scraper that fetches `og:image` and gets a 404 renders worse than one that finds nothing.

- **A security contact, in the README.** The repository tracks exactly one Markdown file by design, so there is no `SECURITY.md`. It says what is in scope, that the cached favicons are the interesting surface, and that the sites the directory links to are not: they belong to other people and a listing is not an endorsement.

- **Back and Forward work.** A filtered view was shareable but not navigable: every render replaced the history entry instead of adding one, so pressing Back after narrowing a search left the site entirely. Changing a category, a sort, a view or a metadata filter now leaves a history entry, and Back restores the controls as well as the grid, without a reload that would throw away the scroll position. Typing is the exception it has to be: the first character of a search pushes an entry and the rest of the word replaces it, so one Back leaves the whole search rather than removing one letter at a time.

- **The icon cache remembers what it failed to find.** Thirteen domains have no icon and never will, and recording only successes meant every refresh re-attempted all thirteen and spent four requests each to learn what the previous run already knew. An entry is now a data URI, or `false` for a domain checked and found to have none, or absent for one nobody has looked at. `--retry-missing` asks again for the recorded absences.

- **A removal leaves a record.** `removed.json` holds the address, the date and the reason, and lint refuses to re-add anything in it, matched the same way duplicate URLs are so a trailing slash cannot walk one back in. Deleting a row on its own records nothing a contributor can read before opening a pull request, and the predictable result is somebody proposing the same site again in good faith and being turned down for a reason nobody wrote down. Reversing a decision means deleting the record; there is no flag to switch a tombstone off, because that would be a second state to reason about and git keeps the history either way.

- **The GitHub description said 588 sites while the directory held 586.** `scripts/lib/metadata.js` guarantees no count can drift inside the repository and lint proves it on every build, but nothing covered anything outside the working tree, so the first place most people read about this project was the one place the guarantee did not reach. `npm run sync:repo` sets the description and topics from the same source the README badges use, `--check` reports a difference without changing anything, and running it twice changes nothing.

- **The only structured data on the site described a feature that no longer exists.** It was a `WebSite` with a `SearchAction`, which drove Google's sitelinks search box until Google retired that on 2024-11-21. Both pages now carry a generated `CollectionPage` with an `ItemList`: the directory lists its 30 categories, each pointing at the filtered view that actually serves them, and the collections page lists its five. Generated from `categories.json` and `collections.json` by `npm run build`, so it cannot be hand-edited into disagreeing with the data, and lint fails if it drifts.

  It lists categories rather than all 586 entries deliberately. A `ListItem` is a claim that a page exists at that address, and this site publishes no page for an individual entry; those addresses belong to other people. Listing them under our own `ItemList` would be claiming pages we do not serve.

- Removed `.lighthouserc.json`. It set performance, accessibility, SEO and best-practices thresholds, and nothing in the repository ran Lighthouse: no dependency, no script, no workflow. Wiring it up needs `@lhci/cli`, which the dependency-free rule fails the build over. A threshold file nothing enforces reads as a gate and is worse than no file, and most of what it asked for is covered by real tests now. What is not covered is the performance number, which is on the roadmap.

- **Twenty more entries were open source and said otherwise.** The forge rule added earlier only sees an entry whose own URL is a repository, which misses every project with a real website. A pass fetched all 285 closed-source entries' pages, pulled the GitHub links out of each, ranked them by how closely the repository name matched the entry, and read the licence: Playwright, Node-RED, DevDocs, CyberChef, Compiler Explorer, LMMS, Carbon, JSONCrack, Responsively, ExplainShell, DNSViz, addy.io, Bundlephobia, httpbin, NGINXConfig, OSINT Framework, QuickRef.ME, Mozilla's SSL config generator, and two curated lists under open content licences. Each now carries a `repository`, so the claim is checkable and the star badge works, and `openSource: true` is 321 of 586 rather than 301.

  Six pages linked a repository that is not the product at all, which is why this was not automated: Dwitter, Hackaday and The Odin Project all link New Relic's browser agent. Twelve more link a repository GitHub cannot classify, and reading those licences is on the roadmap rather than guessed at. degoogle keeps `openSource: false` and now says why: the repository is archived and carries no licence, so the list is readable but not reusable.

- **A card says when the author has stopped.** `stars.json` records whether each repository is archived and when it was last pushed, alongside the star count it already kept. A star count answers how popular something was; these answer whether anyone is still there, which is the question this audience asks first. Cards show "Archived" when the author has said so themselves, which beats any threshold guessed from dates. `npm run update:stars` prints the entries that have crossed the twelve-month mark in the README's rules: seven of them, several finished rather than abandoned, which is exactly why the rule says go and look rather than delete.

- **The whole directory exports as OPML.** `feeds/directory.opml` carries all 586 entries grouped by category, linked from the page head and the footer and cached for offline use. OPML is what the webring and blogroll world reads, and it is the one format that lets somebody take this list somewhere else instead of only looking at it here. No outline carries an `xmlUrl`: OPML usually carries feed subscriptions, so a reader that sees one will try to poll it, and most of these are sites with no feed at all.

- **The policy has no `'unsafe-inline'` left in it.** `style-src` now lists a SHA-256 for every inline stylesheet, the same way `script-src` does. It could not until the 28 style attributes were out of the markup, because a hash covers a whole `<style>` element and never a `style=""` attribute, and covering attributes needs `'unsafe-hashes'`, which the spec's own wording calls unsafe. Verified by injecting an unhashed stylesheet into a local copy and watching the browser refuse it.

- **The embeddable widget works under a strict policy now.** It wrote a `<style>` element into its shadow root, and a shadow root is still governed by the host page's `style-src`, so any site with a real policy would have rendered it unstyled. It uses a constructed stylesheet instead, which is CSSOM and outside CSP entirely, so an embedder needs to allow nothing and add no hash. Older engines without constructable stylesheets fall back to the element.

- **The theme menu is placed correctly in browsers without CSS anchor positioning.** It is not Baseline: Firefox has no full support and Safari on iOS is partial, so a large minority of readers were getting a fixed element with top and right resolving to auto, which lands it in the corner rather than under its button. The declarative rules now sit behind an @supports block and a script places the menu for everyone else, clamped so it cannot clip off either edge. Browsers older than the Popover API, which reached Baseline in January 2025, get a hand-driven toggle with the same light dismiss, Escape handling and keyboard contract rather than a menu stuck permanently open.

- Lint understands `enum`. It had accepted any value against one since the validator was written, so a schema that listed the only allowed set was decoration.
- **Every link out to a listed site now carries `rel="nofollow ugc"`.** A directory that passes ranking signal to its entries is a commodity people buy, and two of the three submissions this repository has received were promotional. This changes nothing a reader can see. It removes the reason to submit here for anything other than the listing itself, and it has to be in place before the directory is ever pre-rendered to crawlable HTML. Links to the CoolSites repository and the Wayback Machine are ours and stay plain.
- Lint rejects an entry that sits on a source forge and declares `openSource: false` without an `openSourceNote` explaining it. A project site published through GitHub Pages is deliberately not treated as a repository, so a project that publishes through Pages is not asked for a note it does not owe.
- The legacy-import ratchet is exact rather than a ceiling. Slack between the recorded number and the real one was room a new entry could be filed into under the import date to dodge the provenance rule, and `npm run review` now lowers the recorded number itself as entries get checked.
- `npm run update:stars` follows `repository` where it is set, because an entry's main link is often the project's own site while the code lives on GitHub.

## [v2.4.0] - 2026-08-25

### Added

- **A diagnostics panel at `?debug=1`.** It reports the app version, where the data came from and how old it is, the service worker state, which caches exist and how much they hold, and every error since the page loaded. Copy the report or clear the caches and reload, both from the panel. It reads this browser and shows you what it found: nothing is sent anywhere, and it never opens without the parameter. Service worker failures and data fetches that fell back to a default used to go to `console.warn` and vanish, so a self-hosted copy stuck on an old cache looked exactly like a healthy one.
- **`npm run check:links`**, which walks every URL in `sites.json` and writes a report to `work/link-check.json`. It takes about a minute for the whole directory and never touches `sites.json`. The reason it exists in this shape is the distinction a naive checker gets wrong: a 403 from a bot wall, a permanent redirect, an expired certificate and a real 404 all look like failure, and only two of them mean the entry is broken. Before calling anything dead it asks again with a browser user agent and downgrades to `blocked` if that works, because bot walls hand back 404s and 503s just as readily as 403s. On the directory as it stands: 523 fine, 16 permanently moved, 27 bot walls, 2 genuinely gone.
- **A content security policy that actually reaches you.** The policy used to live only in the nginx config that shipped with the Docker image, which meant the real deployment on GitHub Pages ran with no policy at all. It now travels in a `<meta>` tag on both pages, so it applies wherever the site is hosted. `frame-ancestors` is deliberately left out because browsers ignore it in a meta tag, and claiming it there would be pretending to a protection the page doesn't have.
- A `Referrer-Policy` of `strict-origin-when-cross-origin`, so following a link off the directory no longer leaks the full URL you came from.
- **A documented set of security headers for anyone self-hosting**, and `npm run serve` now sends them so local development matches. Three of them cannot travel in a meta tag: `X-Content-Type-Options`, `Permissions-Policy`, and `frame-ancestors`. GitHub Pages sends no headers at all, so the hosted copy can be framed by anyone. That was true before this release too, but it was never written down anywhere.
- Tests that gate all of the above: one drives a real browser and fails if the policy blocks anything the app does, four check the policy itself for drift between pages, wildcard hosts, and `unsafe-inline` turning up somewhere it wasn't reviewed.

### Fixed

- **The "recent" sort and the feeds were alphabetical order with a timestamp attached.** 587 of 588 entries carried the same date, because that is when they were imported in bulk, not when anyone looked at them. Sorting by it produced 587 ties broken by name, and the Atom feed published 49 of its 50 items with an identical timestamp. Entries now distinguish `updatedAt` (the text changed) from `lastReviewedAt` (a person checked it), the feeds carry only entries with a real review behind them, and `npm run lint` refuses future dates, reviews dated before the change they reviewed, and any new entry filed under the import date. The schema had been rejecting `lastReviewedAt` outright, so the field the code already read could never have been used.
- **The offline notice claimed the whole directory had been reviewed** on a date that was really just the newest entry's. It says what it means now.
- **Dates displayed a day early west of Greenwich.** A bare `YYYY-MM-DD` parses as UTC midnight and was then formatted in local time.
- **Bookmarks and groups can be reordered from the keyboard.** Arranging the dock was drag-only, so anyone not using a mouse could build groups but never order them. `Alt` plus left or right moves a bookmark inside its group, `Alt` plus up or down moves it to the next group, and `Alt` plus any arrow reorders a group when focus is on one of its header buttons. Every move announces what happened and focus follows what moved. Also nudged the dock buttons to 32px and the group colour swatches from 26px to 32px.
- **Red text failed WCAG AA on a hovered card in four themes**, between 3.98:1 and 4.39:1 in oled, nord, dracula and solarized, and on the light theme's secondary surface at 4.32:1. The contrast gate had only been checking that colour against two of the four surfaces it actually lands on, so none of it showed up. All five are retuned and the gate now covers every surface.

### Changed

- **The directory is now a browse workspace.** Bookmarks stay in the fixed rail beside the category and metadata filters. Search and results use the remaining width, and the denser three-column grid keeps more useful choices above the fold.
- **Collections now opens one focused starting point at a time.** The selected set gets a full member list with local favicons and descriptions. The remaining sets stay visible as compact selectors, with collection search and the same responsive rail used by the directory.
- **Both pages share one visual system.** The rebuilt header, wider navigation rail, tighter card geometry and compact controls follow the same dark workspace direction on desktop and phones.
- **The embeddable widget follows the reader's theme instead of always being dark**, and a host page can repaint it through `--coolsites-*` custom properties. It also documents its attributes for the first time, carries its contract version in `data-version`, gives its region an accessible name and a live region, caps `data-limit` instead of trusting it, and names what went wrong when a category doesn't exist, a request times out, or the reader is offline. A `data-target` that matches nothing now warns in the console rather than rendering silently into the wrong place.
- **Ten entries now point where the project actually lives.** Every destination was confirmed by opening it and reading the page, not by trusting the redirect: llamafile and Trilium Notes moved GitHub org, jq moved off GitHub Pages to `jqlang.org`, DocuSeal went from `.co` to `.com`, Paint.NET dropped the `getpaint` prefix, VeraCrypt moved from `.fr` to `.io`, Runway dropped the `ml`, `terraform.io` retired into the HashiCorp developer portal, the Mozilla Observatory moved into MDN, and Cloudflare reorganised its tunnel docs. Redirects that only add a locale or a marketing path were deliberately left alone, since the URL on file is the better canonical address.
- **`npm run update:favicons` reads the page's own `<link rel="icon">`** when the icon services and a bare `/favicon.ico` all come up empty, which took the cache from 520 to 525 of 539 domains. It asks the entry's real URL rather than the domain root, which is what finds icons on project pages hosted under a path. The 14 still missing declare no icon in their HTML at all.
- Refreshed `favicons.json` and `stars.json` for the domains and repos that changed. One icon was dropped on the way: `sonic-pi.net` had been serving a macOS alias file as an icon, and the magic-byte check now catches it.

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

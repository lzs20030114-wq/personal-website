# Home · Scroll Zone (design 07)

Standalone HTML/CSS/JS implementation of the Claude Design prototype
"07 Home - Scroll Zone" — the reference for the new homepage. It is not wired
into the Next.js app; port it into `app/` / `components/` following this repo's
conventions.

- `index.html`, `css/home.css`, `js/home.js` — layout, styles, behaviour.
- `js/data.js` — all copy and data (slides, works, Lab benches, log entries).
  When porting, read these from the site's existing content sources instead.
- `img/` — stand-in images used by the prototype.
- `prototype-07.dc.html` — the original design-tool file, for reference only
  (needs the Claude Design runtime to render).

Preview locally: `cd design-ref/home-scroll-zone && python3 -m http.server`.

Structure: 01 Hook → 02 Work → 03 About turn page by page (card stack);
03 retracts upward to reveal 04 Lab + 05 Log, which scroll freely (sticky
group headers with progress line, hover-to-preview benches, log cadence
timeline, dark footer). Links use the real routes (`/work/<slug>`,
`/lab#lab<no>`, `/archive#<date>`, `/about`).

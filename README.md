# 5K Map

An interactive choropleth map that shows which countries your GeoGuessr teams have
"5K'd" (guessed within 5km), coloured by frequency, driven live from a Google Sheet.

One map template (`map.html`) is shared by every team — each team just gets its own
tab in the Google Sheet and its own `?team=` link. Nothing needs to be duplicated.

## 1. Set up the Google Sheet

1. Create a Google Sheet. Make **one tab per team**, named clearly (e.g. `Team A`).
2. In each tab, row 1 must have these exact headers, **in this order**:

   | date | country_code | note | maps_link |
   |---|---|---|---|
   | 14-03-2026 | USA | Guessed the license plate | https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=... |
   | 02-04-2026 | JPN | | https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=... |
   | 19-04-2026 | USA | | |

   **One row per 5K** — not one row per country. If you 5K the USA three times,
   that's three separate rows. The map counts rows per country automatically,
   and keeps every date, note, and link so you can browse them in the sidebar.

   - `date` — use **DD-MM-YYYY** (e.g. `14-03-2026`). Slashes or dots also work
     (`14/03/2026`, `14.03.2026`), but stay consistent. This is parsed specifically
     as day-month-year, so don't switch to month-first for any rows.
   - `country_code` is the ISO alpha-3 code, e.g. `JPN`, `GBR`. The full list of
     valid codes (and their names, for reference) is in
     [`data/country-list.json`](data/country-list.json).
     **The United States is tracked by individual state instead of as one
     country** — see below.
   - `note` is optional freeform text — what happened, how you got it, whatever.
     Shows up under the date in the sidebar detail panel. Leave blank if you don't
     want one.
   - `maps_link` is optional — a Street View link to the exact spot. In GeoGuessr,
     right-click the map (or use the share option) to get a link like
     `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=...` — paste it
     as-is. Leave blank if you don't have one; rows without a link still count
     toward the total, they just won't have a clickable link in the sidebar.
   - Optional but recommended: select the `country_code` column → **Data → Data
     validation** → List of items → paste the codes from `country-list.json`
     (plus `state-list.json` for US states — see below), so typos get caught
     immediately.

   ### US states
   Instead of one blob for the whole USA, the map shows all 50 states + DC as
   separate trackable areas. Use `US-XX` in the `country_code` column instead of
   `USA` — e.g. `US-CA` for California, `US-NY` for New York, `US-TX` for Texas.
   The full list of codes is in [`data/state-list.json`](data/state-list.json).

   **If you already have rows logged as plain `USA`:** those will stop showing
   up on the map, since the USA shape no longer exists to match against — the
   count silently drops out rather than erroring. Go back through those rows
   and change each one to the specific state it happened in (`US-CA`, `US-TX`,
   etc.) using `state-list.json` to look up the code. There's no way to infer
   the state automatically from a `USA` row alone.

3. **Share → General access → Anyone with the link → Viewer.** The map fetches the
   sheet as CSV client-side with no login, so it must be link-viewable (not just
   accessible to specific people).
4. Copy the **Sheet ID** out of the sheet's URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`

## 2. Point the site at your sheet

Open [`js/teams-config.js`](js/teams-config.js) and edit:

```js
const SHEET_ID = "YOUR_GOOGLE_SHEET_ID_HERE"; // paste your Sheet ID here

const TEAMS = {
  "team-a": { label: "Team A", tab: "Team A" },   // tab must match the sheet tab name exactly
  "team-b": { label: "Team B", tab: "Team B" },
};
```

- The key (`"team-a"`) is what shows up in the URL: `map.html?team=team-a`
- `label` is the display name shown on the page
- `tab` must exactly match the tab name in the sheet, including capitalisation

Add or remove entries in `TEAMS` for as many teams as you need — every team
automatically gets an identical map, plus a link on the `index.html` landing page
and an entry in the team-switcher dropdown at the top of every map page.

Commit and push. GitHub Pages redeploys automatically (usually within a minute).

## 3. How it works

- `index.html` — landing page listing every team from `teams-config.js`
- `map.html` — the map itself; reads `?team=` from the URL, defaults to the first
  team in the config if missing
- `js/teams-config.js` — the only file you need to edit day-to-day
- `js/map.js` — shared rendering logic: fetches the sheet as CSV (via Google's
  `gviz/tq` endpoint, no API key needed), fetches world map shapes from a CDN,
  colours each country, and handles the hover tooltip
- `data/country-code-map.json` — maps the world map's internal country IDs to ISO
  alpha-3 codes, generated from the `world-atlas` + `i18n-iso-countries` npm
  packages (includes Kosovo, Somaliland and Northern Cyprus, which don't have
  official ISO codes but do appear as shapes on the map)
- `data/country-list.json` — flat list of all valid `{a3, name}` pairs, for sheet
  data-validation and reference

Data updates are live: edit the sheet, refresh the map page, see the change. No
rebuild or redeploy needed for data changes — only for edits to the map/config
files themselves.

## 4. Notes / things you might want to tweak

- **Colour scale**: gold → crimson, in `js/map.js` (`colorScale`) and
  `css/style.css` (`--heat-low/mid/high`). Currently continuous (`scaleSequential`);
  swap to `d3.scaleQuantize` if you'd rather have distinct shade buckets than a
  smooth gradient.
- **Projection**: `d3.geoNaturalEarth1()`. Swap for `d3.geoMercator()` or others in
  `js/map.js` if you want a different world map style.
- **Mobile**: tapping a country pins its tooltip open (since there's no hover on
  touch); tapping the same country again closes it.
- **Multiple entries per country**: the sheet is one row per 5K, so the map sums
  rows per country automatically and sorts each country's dated entries newest
  first for the sidebar detail panel.

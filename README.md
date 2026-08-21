# 5K Map

An interactive choropleth map that shows which countries your GeoGuessr teams have
"5K'd" (guessed within 5km), coloured by frequency, driven live from a Google Sheet.

One map template (`map.html`) is shared by every team — each team just gets its own
tab in the Google Sheet and its own `?team=` link. Nothing needs to be duplicated.

## 1. Set up the Google Sheet

1. Create a Google Sheet. Make **one tab per team**, named clearly (e.g. `Team A`).
2. In each tab, row 1 must have these exact headers:

   | country_code | count |
   |---|---|
   | USA | 3 |
   | JPN | 1 |
   | GBR | 5 |

   - `country_code` is the ISO alpha-3 code. The full list of valid codes (and their
     names, for reference) is in [`data/country-list.json`](data/country-list.json).
   - `count` is how many times you've 5K'd that country. One row per country — don't
     add duplicate rows for the same country, just update the number.
   - Optional but recommended: select the `country_code` column → **Data → Data
     validation** → List of items → paste the codes from `country-list.json`, so
     typos get caught immediately.
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
- **Multiple counts per country**: if your sheet ever has two rows for the same
  country by mistake, `map.js` sums them rather than overwriting — but it's
  cleaner to keep one row per country.

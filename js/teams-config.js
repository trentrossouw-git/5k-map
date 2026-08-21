/**
 * ---- EDIT THIS FILE WITH YOUR REAL VALUES ----
 *
 * SHEET_ID: found in your Google Sheet's URL:
 *   https://docs.google.com/spreadsheets/d/  THIS_PART  /edit
 *
 * TEAMS: one entry per tab in your sheet. `tab` must exactly match the
 * sheet's tab name (case-sensitive). `key` is what appears in the URL,
 * e.g. map.html?team=team-a — keep it short, lowercase, no spaces.
 *
 * Each tab needs two columns with these exact headers in row 1:
 *   country_code   -> ISO alpha-3 code, e.g. USA, JPN, GBR (see data/country-list.json)
 *   count          -> number of times that country's been 5k'd
 */

const SHEET_ID = "1Hrrww0MC2LItlEdhl5xCcw12qad4A1aitvbKodyO5Iw";

const TEAMS = {
  "close-enough": { label: "Close Enough", tab: "Close Enough" },
  "catfishermen": { label: "Catfishermen", tab: "Catfishermen" }
};

function csvUrlForTab(tabName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
}
(function () {
  const params = new URLSearchParams(location.search);
  const teamKeys = Object.keys(TEAMS);
  let teamKey = params.get("team");
  if (!teamKey || !TEAMS[teamKey]) teamKey = teamKeys[0];
  const team = TEAMS[teamKey];

  // ---------- Header: page title + team dropdown ----------
  document.title = `${team.label} — 5K Map`;

  const teamDropdown = document.getElementById("team-dropdown");
  const teamToggle = document.getElementById("team-dropdown-toggle");
  const teamLabel = document.getElementById("team-dropdown-label");
  const teamMenu = document.getElementById("team-dropdown-menu");

  teamLabel.textContent = team.label;

  teamKeys.forEach((k) => {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = TEAMS[k].label;
    if (k === teamKey) btn.classList.add("current");
    btn.addEventListener("click", () => {
      location.href = `map.html?team=${encodeURIComponent(k)}`;
    });
    li.appendChild(btn);
    teamMenu.appendChild(li);
  });

  function closeTeamDropdown() {
    teamDropdown.classList.remove("open");
    teamToggle.setAttribute("aria-expanded", "false");
  }

  teamToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = teamDropdown.classList.toggle("open");
    teamToggle.setAttribute("aria-expanded", String(isOpen));
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#team-dropdown")) closeTeamDropdown();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeTeamDropdown();
  });

  // ---------- Elements ----------
  const svg = d3.select("#map");
  const tooltip = document.getElementById("tooltip");
  const statusEl = document.getElementById("status");
  const statCountries = document.getElementById("stat-countries");
  const statTotal = document.getElementById("stat-total");
  const statTop = document.getElementById("stat-top");
  const statProgress = document.getElementById("stat-progress");

  function setStatus(msg, isError) {
    statusEl.classList.remove("hidden");
    statusEl.innerHTML = isError
      ? `<div class="error">${msg}</div>`
      : `<div>${msg}</div>`;
  }
  function clearStatus() {
    statusEl.classList.add("hidden");
  }

  // ---------- Load everything in parallel ----------
  setStatus("Loading map data…");

  const worldPromise = fetch(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
  ).then((r) => {
    if (!r.ok) throw new Error("Could not load world map data.");
    return r.json();
  });

  const codeMapPromise = fetch("data/country-code-map.json").then((r) => {
    if (!r.ok) throw new Error("Could not load country code mapping.");
    return r.json();
  });

  const csvUrl = csvUrlForTab(team.tab);
  const dataPromise = new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });

  Promise.all([worldPromise, codeMapPromise, dataPromise])
    .then(([world, codeMap, rows]) => render(world, codeMap, rows))
    .catch((err) => {
      console.error(err);
      setStatus(
        `Couldn't load the map. Check that SHEET_ID and the tab name "${team.tab}" ` +
          `in js/teams-config.js are correct, and that the sheet is shared as ` +
          `"Anyone with the link can view".<br><br><span style="opacity:0.7">${err.message || err}</span>`,
        true
      );
    });

  // Parses "DD-MM-YYYY" (or DD/MM/YYYY, DD.MM.YYYY) into a sortable timestamp.
  // Returns NaN for anything else so callers can fall back gracefully.
  function parseDMY(str) {
    if (!str) return NaN;
    const parts = str.trim().split(/[\/\-.]/);
    if (parts.length !== 3) return NaN;
    const d = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    let y = parseInt(parts[2], 10);
    if (!d || !m || !y) return NaN;
    if (y < 100) y += 2000;
    const t = new Date(y, m - 1, d).getTime();
    return Number.isNaN(t) ? NaN : t;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  // Pulls {lat, lng} out of a Google Maps / Street View URL, if present.
  // Handles the pano share format (?viewpoint=LAT,LNG), the q=/ll= query
  // param format, and the @LAT,LNG map-view format. Returns null if none
  // of those patterns match (e.g. shortened maps.app.goo.gl links, which
  // can't be resolved client-side).
  function extractLatLng(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      const viewpoint = u.searchParams.get("viewpoint");
      if (viewpoint) {
        const [lat, lng] = viewpoint.split(",").map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
      const q = u.searchParams.get("q") || u.searchParams.get("ll");
      if (q) {
        const [lat, lng] = q.split(",").map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      }
    } catch (e) {
      // Not a parseable absolute URL — fall through to the regex below.
    }
    const m = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
    }
    return null;
  }

  // ---------- Render ----------
  function render(world, codeMap, rows) {
    // Sheet is one row PER 5K: date, country_code, note, maps_link. Build
    // both a count-per-country map and a full list of dated entries per
    // country from that.
    const entriesByCountry = new Map(); // a3 -> [{date, note, link, lat, lng}, ...] sorted newest first

    for (const row of rows) {
      const code = (row.country_code || "").trim().toUpperCase();
      if (!code) continue;
      const date = (row.date || "").trim();
      const note = (row.note || "").trim();
      const link = (row.maps_link || "").trim();
      const coords = extractLatLng(link);
      if (!entriesByCountry.has(code)) entriesByCountry.set(code, []);
      entriesByCountry.get(code).push({
        date,
        note,
        link,
        lat: coords ? coords.lat : null,
        lng: coords ? coords.lng : null,
      });
    }
    entriesByCountry.forEach((list) => {
      list.sort((a, b) => {
        const da = parseDMY(a.date);
        const db = parseDMY(b.date);
        if (Number.isNaN(da) || Number.isNaN(db)) return 0;
        return db - da;
      });
    });

    const counts = new Map();
    entriesByCountry.forEach((list, code) => counts.set(code, list.length));

    if (counts.size === 0) {
      clearStatus();
      setStatus(
        `No valid rows found in the "${team.tab}" tab yet. Add rows with ` +
          `"date" (DD-MM-YYYY), "country_code" (e.g. USA), "note", and ` +
          `"maps_link" columns — one row per 5K — to see them appear here.`
      );
    } else {
      clearStatus();
    }

    // Attach an a3 code + display name to every map feature.
    const geo = topojson.feature(world, world.objects.countries);
    geo.features.forEach((f) => {
      let entry;
      if (f.id !== undefined && f.id !== null) {
        const numeric = String(f.id).padStart(3, "0");
        entry = codeMap.byNumeric[numeric];
      }
      if (!entry) {
        entry = codeMap.byName[f.properties.name];
      }
      f.a3 = entry ? entry.a3 : null;
      f.displayName = entry ? entry.name : f.properties.name;
    });

    // ---------- Color scale ----------
    // Discrete rainbow scale, 1 through 7+ (counts above 7 reuse the last
    // color rather than extrapolating). Kept in sync with the --rainbow-N
    // CSS variables used by the legend swatches.
    const RAINBOW = [
      "#e64545", // 1 - red
      "#e8813c", // 2 - orange
      "#e0c343", // 3 - yellow
      "#5cb85c", // 4 - green
      "#4a90d9", // 5 - blue
      "#6a5acd", // 6 - indigo
      "#b350c2", // 7+ - violet
    ];
    function colorScale(count) {
      const idx = Math.min(Math.max(count, 1), 7) - 1;
      return RAINBOW[idx];
    }

    // ---------- Projection & path ----------
    const container = document.querySelector(".map-pane");
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Fit the projection's scale to a fixed lat/lon window rather than the
    // actual data extent, so we control exactly how much of the poles show:
    // a bare sliver of Antarctica at the south, and nothing above the
    // northern edge of Greenland/Scandinavia at the north. Every country is
    // still drawn afterwards — anything outside this window just gets
    // clipped by the SVG viewBox.
    const NORTH_LAT = 75;
    const SOUTH_LAT = -58;
    const fitBounds = {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-180, SOUTH_LAT],
            [180, SOUTH_LAT],
            [180, NORTH_LAT],
            [-180, NORTH_LAT],
            [-180, SOUTH_LAT],
          ],
        ],
      },
    };
    const projection = d3.geoMercator().fitSize([width, height], fitBounds);
    const path = d3.geoPath(projection);

    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    // Everything that pans/zooms together lives in this group.
    const zoomLayer = svg.append("g").attr("class", "zoom-layer");

    // Faint graticule for atlas texture.
    const graticule = d3.geoGraticule10();
    zoomLayer
      .append("path")
      .datum(graticule)
      .attr("class", "graticule")
      .attr("vector-effect", "non-scaling-stroke")
      .attr("d", path);

    // Countries with no official Street View / GeoGuessr coverage, per
    // Trent's curated list (cross-checked against geometas.com). Add or
    // remove ISO alpha-3 codes here as coverage is confirmed in-game — see
    // data/country-list.json for the full valid code list.
    const NO_COVERAGE = new Set([
      "AFG", "DZA", "AGO", "ATA", "ARM", "AZE", "BHS", "BLR", "BLZ", "BEN",
      "BRN", "BFA", "BDI", "CMR", "CAF", "TCD", "CHN", "COG", "CIV", "CUB",
      "COD", "DJI", "SLV", "GNQ", "ERI", "ETH", "FLK", "FJI",
      "ATF", "GAB", "GMB", "GIN", "GNB", "GUY", "HTI", "HND", "IRN",
      "IRQ", "JAM", "XKX", "KWT", "LBN", "LBR", "LBY", "MWI", "MLI",
      "MRT", "MDA", "MAR", "MOZ", "MMR", "NCL", "NIC", "NER",
      "PRK", "XNC", "PNG", "SSD", "SAU", "SLE", "SLB", "SOM",
      "XSL", "SDN", "SUR", "SYR", "TJK", "TZA", "TLS", "TGO", "TTO", "TKM",
      "UZB", "VUT", "VEN", "ESH", "YEM", "ZMB", "ZWE",
    ]);

    let pinned = null;

    const paths = zoomLayer
      .append("g")
      .selectAll("path")
      .data(geo.features)
      .join("path")
      .attr("class", (d) => {
        if (d.a3 && NO_COVERAGE.has(d.a3)) return "country no-coverage";
        const c = d.a3 ? counts.get(d.a3) : null;
        return "country" + (c ? "" : " unvisited");
      })
      .attr("fill", (d) => {
        if (d.a3 && NO_COVERAGE.has(d.a3)) return null; // CSS handles this
        const c = d.a3 ? counts.get(d.a3) : null;
        return c ? colorScale(c) : null; // unvisited fill comes from CSS
      })
      .attr("vector-effect", "non-scaling-stroke")
      .attr("d", path)
      .on("mousemove", (event, d) => showTooltip(event, d))
      .on("mouseenter", (event, d) => showTooltip(event, d))
      .on("mouseleave", function (event, d) {
        d3.select(this).classed("hovered", false);
        if (pinned !== d) hideTooltip();
      })
      .on("click", function (event, d) {
        // Tap-to-pin for touch devices; also opens the detail panel.
        if (pinned === d) {
          deselectCountry();
        } else {
          selectCountry(d);
        }
      });

    // ---------- Location dots (exact 5K pinpoints, from maps_link) ----------
    const pointsLayer = zoomLayer.append("g").attr("class", "points-layer");

    const allPoints = [];
    entriesByCountry.forEach((list, code) => {
      list.forEach((e) => {
        if (e.lat != null && e.lng != null) {
          allPoints.push({ ...e, a3: code });
        }
      });
    });

    // Radius eases from 2.5 down to 2 as you zoom in. Since this is a local
    // (pre-zoom-scale) value inside zoomLayer, the actual on-screen size
    // still grows a lot with zoom (r * k) — this is just a slight taper on
    // top of that natural growth, not a shrink.
    function dotRadiusFor(k) {
      const t = Math.min(1, Math.max(0, (k - 1) / (12 - 1)));
      return 2.5 - t * 0.5;
    }

    const dots = pointsLayer
      .selectAll("circle")
      .data(allPoints)
      .join("circle")
      .attr("class", "location-dot")
      .attr("cx", (d) => projection([d.lng, d.lat])[0])
      .attr("cy", (d) => projection([d.lng, d.lat])[1])
      .attr("r", dotRadiusFor(1))
      .attr("vector-effect", "non-scaling-stroke")
      .on("mousemove", (event, d) => showDotTooltip(event, d))
      .on("mouseenter", (event, d) => showDotTooltip(event, d))
      .on("mouseleave", () => {
        if (!pinned) hideTooltip();
      })
      .on("click", (event, d) => {
        event.stopPropagation();
        if (d.link) window.open(d.link, "_blank", "noopener");
      });

    function showDotTooltip(event, d) {
      const feature = geo.features.find((f) => f.a3 === d.a3);
      const countryName = feature ? feature.displayName : d.a3;
      tooltip.innerHTML =
        `<span class="t-name">${countryName}</span>` +
        `${d.date || "—"}` +
        (d.note ? `<br><span style="opacity:0.7">${escapeHtml(d.note)}</span>` : "") +
        (d.link ? `<br><span style="opacity:0.55">Click to view ↗</span>` : "");
      tooltip.style.left = event.clientX + "px";
      tooltip.style.top = event.clientY + "px";
      tooltip.classList.add("visible");
    }

    const dotsToggle = document.getElementById("dots-toggle");
    dotsToggle.classList.add("active"); // visible by default
    dotsToggle.addEventListener("click", () => {
      const isActive = dotsToggle.classList.toggle("active");
      pointsLayer.style("display", isActive ? null : "none");
    });

    // ---------- Zoom & pan (scroll to zoom, drag to pan, pinch on touch) ----------
    const zoom = d3
      .zoom()
      .scaleExtent([1, 12])
      .translateExtent([
        [0, 0],
        [width, height],
      ])
      .on("zoom", (event) => {
        zoomLayer.attr("transform", event.transform);
        dots.attr("r", dotRadiusFor(event.transform.k));
      });

    svg.call(zoom);

    document.getElementById("zoom-in").onclick = () =>
      svg.transition().duration(200).call(zoom.scaleBy, 1.6);
    document.getElementById("zoom-out").onclick = () =>
      svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.6);
    document.getElementById("zoom-reset").onclick = () =>
      svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);

    // ---------- "Not yet 5K'd" toggle ----------
    const unvisitedToggle = document.getElementById("unvisited-toggle");
    unvisitedToggle.addEventListener("click", () => {
      const isActive = unvisitedToggle.classList.toggle("active");
      document.body.classList.toggle("show-unvisited", isActive);
    });

    function showTooltip(event, d) {
      const c = d.a3 ? counts.get(d.a3) : null;
      const entries = d.a3 ? entriesByCountry.get(d.a3) : null;
      const lastDate = entries && entries[0] && entries[0].date;
      tooltip.innerHTML =
        `<span class="t-name">${d.displayName}</span>` +
        (c
          ? `5K'd ${c} time${c === 1 ? "" : "s"}` +
            (lastDate ? `<br><span style="opacity:0.7">Last: ${lastDate}</span>` : "")
          : "Not 5K'd yet");
      tooltip.style.left = event.clientX + "px";
      tooltip.style.top = event.clientY + "px";
      tooltip.classList.add("visible");
    }
    function hideTooltip() {
      tooltip.classList.remove("visible");
    }

    // ---------- Zoom-to-country + pin + detail panel ----------
    function selectCountry(d) {
      pinned = d;
      hideTooltip();
      paths.classed("pinned", (dd) => dd === d);

      const [[x0, y0], [x1, y1]] = path.bounds(d);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const scale = Math.max(1.5, Math.min(12, 0.8 / Math.max(dx / width, dy / height)));
      const tx = width / 2 - scale * cx;
      const ty = height / 2 - scale * cy;
      const newTransform = d3.zoomIdentity.translate(tx, ty).scale(scale);

      svg.transition().duration(600).call(zoom.transform, newTransform);

      renderCountryDetail(d);
      highlightLeaderboard(d.a3);
    }

    function deselectCountry() {
      pinned = null;
      hideTooltip();
      paths.classed("pinned", false);
      renderCountryDetail(null);
      highlightLeaderboard(null);
    }

    // ---------- Stats ----------
    const visitedSorted = [...counts.entries()]
      .map(([a3, count]) => ({
        a3,
        count,
        feature: geo.features.find((f) => f.a3 === a3),
      }))
      .filter((x) => x.feature)
      .sort((a, b) => b.count - a.count || a.feature.displayName.localeCompare(b.feature.displayName));

    const totalFivers = visitedSorted.reduce((s, x) => s + x.count, 0);
    statCountries.textContent = visitedSorted.length;
    statTotal.textContent = totalFivers;
    statTop.textContent = visitedSorted.length
      ? `${visitedSorted[0].feature.displayName} (${visitedSorted[0].count})`
      : "—";

    // Coverage = visited / every country that actually has official
    // GeoGuessr coverage (i.e. everything except the NO_COVERAGE set).
    const coverableCount = geo.features.filter(
      (f) => f.a3 && !NO_COVERAGE.has(f.a3)
    ).length;
    statProgress.textContent = `${visitedSorted.length}/${coverableCount}`;

    // ---------- Legend ----------
    // Legend is now static (fixed 1–7+ rainbow swatches hardcoded in
    // map.html), so nothing to compute here.

    // ---------- Leaderboard (sortable: by count or A–Z) ----------
    const leaderboardEl = document.getElementById("leaderboard");
    const sortCountBtn = document.getElementById("sort-count");
    const sortAlphaBtn = document.getElementById("sort-alpha");
    let leaderboardSort = "count";

    function renderLeaderboard() {
      const list = [...visitedSorted];
      if (leaderboardSort === "alpha") {
        list.sort((a, b) => a.feature.displayName.localeCompare(b.feature.displayName));
      }
      leaderboardEl.innerHTML = "";
      if (!list.length) {
        leaderboardEl.innerHTML = `<li class="empty">No countries logged yet</li>`;
        return;
      }
      list.forEach((entry, i) => {
        const li = document.createElement("li");
        li.dataset.a3 = entry.a3;
        li.innerHTML =
          `<span class="rank">${leaderboardSort === "count" ? i + 1 : "·"}</span>` +
          `<span class="name">${entry.feature.displayName}</span>` +
          `<span class="count">${entry.count}</span>`;
        li.addEventListener("click", () => selectCountry(entry.feature));
        leaderboardEl.appendChild(li);
      });
    }

    sortCountBtn.addEventListener("click", () => {
      leaderboardSort = "count";
      sortCountBtn.classList.add("active");
      sortAlphaBtn.classList.remove("active");
      renderLeaderboard();
    });
    sortAlphaBtn.addEventListener("click", () => {
      leaderboardSort = "alpha";
      sortAlphaBtn.classList.add("active");
      sortCountBtn.classList.remove("active");
      renderLeaderboard();
    });

    renderLeaderboard();

    function highlightLeaderboard(a3) {
      leaderboardEl.querySelectorAll("li").forEach((li) => {
        li.classList.toggle("active", li.dataset.a3 === a3);
      });
    }

    // ---------- Country detail panel ----------
    const detailEl = document.getElementById("country-detail");
    function renderCountryDetail(d) {
      const entries = d && d.a3 ? entriesByCountry.get(d.a3) : null;
      if (!entries || !entries.length) {
        detailEl.classList.add("hidden");
        detailEl.innerHTML = "";
        return;
      }
      detailEl.classList.remove("hidden");
      detailEl.innerHTML =
        `<div class="sidebar-title">${d.displayName} — ${entries.length} 5K${
          entries.length === 1 ? "" : "s"
        }</div>` +
        `<ul class="entry-list">` +
        entries
          .map((e) => {
            const linkHtml = e.link
              ? `<a href="${e.link}" target="_blank" rel="noopener">View ↗</a>`
              : "";
            const noteHtml = e.note
              ? `<div class="entry-note">${escapeHtml(e.note)}</div>`
              : "";
            return (
              `<li>` +
              `<div class="entry-row"><span class="entry-date">${e.date || "—"}</span>${linkHtml}</div>` +
              noteHtml +
              `</li>`
            );
          })
          .join("") +
        `</ul>`;
    }

    // ---------- Search ----------
    const searchInput = document.getElementById("search-box");
    const searchResults = document.getElementById("search-results");
    const searchableFeatures = geo.features
      .filter((f) => f.a3)
      .sort((a, b) => a.displayName.localeCompare(b.displayName));

    function renderSearchResults(query) {
      searchResults.innerHTML = "";
      if (!query) {
        searchResults.classList.remove("visible");
        return;
      }
      const q = query.toLowerCase();
      const matches = searchableFeatures
        .filter((f) => f.displayName.toLowerCase().includes(q))
        .slice(0, 8);
      if (!matches.length) {
        searchResults.innerHTML = `<li class="no-match">No countries found</li>`;
        searchResults.classList.add("visible");
        return;
      }
      matches.forEach((f) => {
        const c = counts.get(f.a3);
        const li = document.createElement("li");
        li.innerHTML = `<span>${f.displayName}</span><span class="count">${c ? c : "—"}</span>`;
        li.addEventListener("click", () => {
          selectCountry(f);
          searchInput.value = f.displayName;
          searchResults.classList.remove("visible");
        });
        searchResults.appendChild(li);
      });
      searchResults.classList.add("visible");
    }

    searchInput.addEventListener("input", (e) => renderSearchResults(e.target.value));
    searchInput.addEventListener("focus", (e) => {
      if (e.target.value) renderSearchResults(e.target.value);
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-wrap")) searchResults.classList.remove("visible");
    });
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const first = searchResults.querySelector("li:not(.no-match)");
        if (first) first.click();
      }
    });

    // "/" focuses the search box from anywhere, unless already typing
    // somewhere else (an input, textarea, or contenteditable).
    document.addEventListener("keydown", (e) => {
      if (e.key !== "/") return;
      const tag = document.activeElement && document.activeElement.tagName;
      const isTyping = tag === "INPUT" || tag === "TEXTAREA" || (document.activeElement && document.activeElement.isContentEditable);
      if (isTyping) return;
      e.preventDefault();
      searchInput.focus();
    });

    // ---------- Copy summary ----------
    const copySummaryBtn = document.getElementById("copy-summary");
    copySummaryBtn.addEventListener("click", () => {
      const topLine = visitedSorted.length
        ? `${visitedSorted[0].feature.displayName} (${visitedSorted[0].count})`
        : "—";
      const summary =
        `${team.label}: ${visitedSorted.length}/${coverableCount} countries, ` +
        `${totalFivers} total 5Ks, most 5K'd: ${topLine}`;
      navigator.clipboard
        .writeText(summary)
        .then(() => {
          copySummaryBtn.textContent = "Copied!";
          copySummaryBtn.classList.add("copied");
          setTimeout(() => {
            copySummaryBtn.textContent = "Copy summary";
            copySummaryBtn.classList.remove("copied");
          }, 1500);
        })
        .catch(() => {
          copySummaryBtn.textContent = "Couldn't copy";
          setTimeout(() => {
            copySummaryBtn.textContent = "Copy summary";
          }, 1500);
        });
    });
  }

  // Re-render on resize (debounced), keeping the last loaded data via reload.
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => location.reload(), 300);
  });
})();

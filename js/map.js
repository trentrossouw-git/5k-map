(function () {
  const params = new URLSearchParams(location.search);
  const teamKeys = Object.keys(TEAMS);
  let teamKey = params.get("team");
  if (!teamKey || !TEAMS[teamKey]) teamKey = teamKeys[0];
  const team = TEAMS[teamKey];

  // ---------- Header: title + team switcher ----------
  document.querySelector(".team-name").textContent = team.label;
  document.title = `${team.label} — 5K Map`;

  const switcher = document.getElementById("team-switcher");
  teamKeys.forEach((k) => {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = TEAMS[k].label;
    if (k === teamKey) opt.selected = true;
    switcher.appendChild(opt);
  });
  switcher.addEventListener("change", () => {
    location.href = `map.html?team=${encodeURIComponent(switcher.value)}`;
  });

  // ---------- Elements ----------
  const svg = d3.select("#map");
  const tooltip = document.getElementById("tooltip");
  const statusEl = document.getElementById("status");
  const statCountries = document.getElementById("stat-countries");
  const statTotal = document.getElementById("stat-total");
  const statTop = document.getElementById("stat-top");

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
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
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

  // ---------- Render ----------
  function render(world, codeMap, rows) {
    // Build a3 -> count from the sheet rows.
    const counts = new Map();
    for (const row of rows) {
      const code = (row.country_code || "").trim().toUpperCase();
      const count = parseInt(row.count, 10);
      if (!code || !Number.isFinite(count) || count <= 0) continue;
      counts.set(code, (counts.get(code) || 0) + count);
    }

    if (counts.size === 0) {
      clearStatus();
      setStatus(
        `No valid rows found in the "${team.tab}" tab yet. Add rows with ` +
          `"country_code" (e.g. USA) and "count" columns to see them appear here.`
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
    const maxCount = Math.max(1, ...counts.values());
    const colorScale = d3
      .scaleSequential()
      .domain([1, maxCount])
      .interpolator(
        d3.interpolateRgbBasis(["#f4d58d", "#d1495b", "#7a1f2b"])
      );

    // ---------- Projection & path ----------
    const container = document.querySelector("main");
    const width = container.clientWidth;
    const height = container.clientHeight;

    const projection = d3.geoEquirectangular().fitSize([width, height], geo);
    const path = d3.geoPath(projection);

    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    // Faint graticule for atlas texture.
    const graticule = d3.geoGraticule10();
    svg
      .append("path")
      .datum(graticule)
      .attr("class", "graticule")
      .attr("d", path);

    let pinned = null;

    const paths = svg
      .append("g")
      .selectAll("path")
      .data(geo.features)
      .join("path")
      .attr("class", (d) => {
        const c = d.a3 ? counts.get(d.a3) : null;
        return "country" + (c ? "" : " unvisited");
      })
      .attr("fill", (d) => {
        const c = d.a3 ? counts.get(d.a3) : null;
        return c ? colorScale(c) : null; // unvisited fill comes from CSS
      })
      .attr("d", path)
      .on("mousemove", (event, d) => showTooltip(event, d))
      .on("mouseenter", (event, d) => showTooltip(event, d))
      .on("mouseleave", function (event, d) {
        d3.select(this).classed("hovered", false);
        if (pinned !== d) hideTooltip();
      })
      .on("click", function (event, d) {
        // Tap-to-pin for touch devices.
        if (pinned === d) {
          pinned = null;
          hideTooltip();
        } else {
          pinned = d;
          showTooltip(event, d);
        }
      });

    function showTooltip(event, d) {
      const c = d.a3 ? counts.get(d.a3) : null;
      tooltip.innerHTML = `<span class="t-name">${d.displayName}</span>${
        c ? `5K'd ${c} time${c === 1 ? "" : "s"}` : "Not 5K'd yet"
      }`;
      tooltip.style.left = event.clientX + "px";
      tooltip.style.top = event.clientY + "px";
      tooltip.classList.add("visible");
    }
    function hideTooltip() {
      tooltip.classList.remove("visible");
    }

    // ---------- Stats ----------
    const visitedEntries = [...counts.entries()];
    statCountries.textContent = visitedEntries.length;
    statTotal.textContent = visitedEntries.reduce((s, [, c]) => s + c, 0);
    if (visitedEntries.length) {
      const [topCode, topCount] = visitedEntries.sort((a, b) => b[1] - a[1])[0];
      const topFeature = geo.features.find((f) => f.a3 === topCode);
      statTop.textContent = `${
        topFeature ? topFeature.displayName : topCode
      } (${topCount})`;
    } else {
      statTop.textContent = "—";
    }

    // ---------- Legend ----------
    document.getElementById("legend-min").textContent = "1";
    document.getElementById("legend-max").textContent = String(maxCount);
  }

  // Re-render on resize (debounced), keeping the last loaded data via reload.
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => location.reload(), 300);
  });
})();

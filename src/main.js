// src/main.js

const DATA_PATH = "data/temperature_daily.csv";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const margin = { top: 74, right: 24, bottom: 40, left: 70 };
const cellW = 92;
const cellH = 56;
const sparkPad = 6;

const Mode = Object.freeze({ MAX: "MAX", MIN: "MIN" });
let currentMode = Mode.MAX;

// ---------- helpers ----------
function monthIndex(d) { return d.getMonth(); }
function yearNumber(d) { return d.getFullYear(); }
function dayOfMonth(d) { return d.getDate(); }

function formatMonthYear(year, monthIdx) {
  return `${MONTH_NAMES[monthIdx]} ${year}`;
}

function parseDateFlexible(row) {
  const keys = Object.keys(row);

  const dateKey =
    keys.find(k => k.toLowerCase() === "date") ??
    keys.find(k => k.toLowerCase().includes("date")) ??
    keys[0];

  const raw = row[dateKey];
  const d = new Date(raw);
  if (!Number.isNaN(+d)) return d;

  // fallback common format
  const p = d3.timeParse("%Y-%m-%d");
  return p(raw);
}

function detectTempColumns(sampleRow) {
  const keys = Object.keys(sampleRow).map(k => k.trim());

  const findKey = (preds) => {
    for (const k of keys) {
      const kl = k.toLowerCase();
      if (preds.some(p => kl.includes(p))) return k;
    }
    return null;
  };

  const maxKey =
    findKey(["tmax"]) ??
    findKey(["temp_max", "temperature_max"]) ??
    findKey(["max"]);

  const minKey =
    findKey(["tmin"]) ??
    findKey(["temp_min", "temperature_min"]) ??
    findKey(["min"]);

  const singleTempKey =
    findKey(["temp", "temperature"]) ??
    findKey(["value"]);

  return { maxKey, minKey, singleTempKey };
}

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = +value;
  return Number.isFinite(number) ? number : null;
}

function clampToLast10Years(records) {
  const years = Array.from(new Set(records.map(r => r.year))).sort((a,b) => a-b);
  const last10 = years.slice(-10);
  return records.filter(r => last10.includes(r.year));
}

function parseDailyRows(rawRows, columns) {
  const { maxKey, minKey, singleTempKey } = columns;

  return rawRows.map(row => {
    const date = parseDateFlexible(row);
    if (!date || Number.isNaN(+date)) return null;

    const year = yearNumber(date);
    const month = monthIndex(date);

    const tmax = toNumberOrNull(maxKey ? row[maxKey] : (singleTempKey ? row[singleTempKey] : null));
    const tmin = toNumberOrNull(minKey ? row[minKey] : (singleTempKey ? row[singleTempKey] : null));

    return { date, year, month, tmax, tmin };
  }).filter(Boolean);
}

function buildMonthlyCells(dailyRows) {
  const byYM = d3.group(dailyRows, d => `${d.year}-${d.month}`);

  const cells = [];
  for (const [key, days] of byYM.entries()) {
    const [yearStr, monthStr] = key.split("-");
    const year = +yearStr;
    const month = +monthStr;

    days.sort((a,b) => a.date - b.date);

    const maxSeries = days.map(d => ({ x: dayOfMonth(d.date), y: d.tmax }));
    const minSeries = days.map(d => ({ x: dayOfMonth(d.date), y: d.tmin }));

    const monthMax = d3.max(days.map(d => d.tmax).filter(v => v != null));
    const monthMin = d3.min(days.map(d => d.tmin).filter(v => v != null));

    cells.push({
      year,
      month,
      days,
      monthMax,
      monthMin,
      maxSeries,
      minSeries
    });
  }
  return cells;
}

function computeColorDomain(cells) {
  const values = cells
    .map(c => currentMode === Mode.MAX ? c.monthMax : c.monthMin)
    .filter(v => v != null);
  return d3.extent(values);
}

function createSvgFrame(container, width, height) {
  container.selectAll("*").remove();

  const svg = container.append("svg")
    .attr("width", width)
    .attr("height", height);

  const defs = svg.append("defs");
  const gradId = "legend-gradient";
  const gradient = defs.append("linearGradient")
    .attr("id", gradId)
    .attr("x1", "0%").attr("x2", "100%")
    .attr("y1", "0%").attr("y2", "0%");

  return { svg, gradId, gradient };
}

function createTooltipHandlers(tooltip) {
  function moveTooltip(event) {
    const pad = 14;
    tooltip
      .style("left", `${event.pageX + pad}px`)
      .style("top", `${event.pageY + pad}px`);
  }

  function showTooltip(event, cell) {
    const modeVal = (currentMode === Mode.MAX) ? cell.monthMax : cell.monthMin;
    const modeLabel = (currentMode === Mode.MAX) ? "Monthly Max (background)" : "Monthly Min (background)";

    tooltip
      .style("opacity", 1)
      .html(`
        <div><b>${formatMonthYear(cell.year, cell.month)}</b></div>
        <div class="muted">${modeLabel}: <b>${modeVal == null ? "N/A" : modeVal.toFixed(1) + "°C"}</b></div>
        <div class="muted">Monthly Max: <b>${cell.monthMax == null ? "N/A" : cell.monthMax.toFixed(1) + "°C"}</b></div>
        <div class="muted">Monthly Min: <b>${cell.monthMin == null ? "N/A" : cell.monthMin.toFixed(1) + "°C"}</b></div>
      `);

    moveTooltip(event);
  }

  function hideTooltip() {
    tooltip.style("opacity", 0);
  }

  return { moveTooltip, showTooltip, hideTooltip };
}

function drawLegend(legendG, gradient, gradId, color, domain) {
  legendG.selectAll("*").remove();

  const legendWidth = 220;
  const legendHeight = 10;
  const legendTitle = currentMode === Mode.MAX
    ? "Background: Monthly Max (°C)"
    : "Background: Monthly Min (°C)";

  legendG.append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("dy", "0.9em")
    .text(legendTitle);

  gradient.selectAll("*").remove();
  const stops = d3.range(0, 1.0001, 0.1);
  stops.forEach(t => {
    const value = domain[0] + t * (domain[1] - domain[0]);
    gradient.append("stop")
      .attr("offset", `${t * 100}%`)
      .attr("stop-color", color(value));
  });

  legendG.append("rect")
    .attr("x", 0)
    .attr("y", 18)
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .attr("rx", 4)
    .attr("fill", `url(#${gradId})`)
    .attr("stroke", "rgba(255,255,255,0.18)");

  const legendScale = d3.scaleLinear().domain(domain).range([0, legendWidth]);
  const legendAxis = d3.axisBottom(legendScale).ticks(5).tickSize(3);

  legendG.append("g")
    .attr("transform", `translate(0, ${18 + legendHeight})`)
    .call(legendAxis)
    .call(g => g.selectAll("text").attr("fill", "rgba(255,255,255,0.65)"))
    .call(g => g.selectAll("path,line").attr("stroke", "rgba(255,255,255,0.22)"));

  legendG.append("text")
    .attr("x", 0)
    .attr("y", 58)
    .text("Sparklines: red = daily highs, blue = daily lows");
}

function updateSparklinePaths(cellJoin, xBandwidth, yBandwidth) {
  cellJoin.each(function(d) {
    const group = d3.select(this);
    const w = xBandwidth - 2 * sparkPad;
    const h = yBandwidth - 2 * sparkPad;

    const maxSeries = d.maxSeries;
    const minSeries = d.minSeries;
    const allValues = [
      ...maxSeries.map(p => p.y),
      ...minSeries.map(p => p.y)
    ].filter(v => v != null);

    if (allValues.length < 2) {
      group.select(".max-line").attr("d", null);
      group.select(".min-line").attr("d", null);
      return;
    }

    const xDomain = d3.extent([...maxSeries, ...minSeries].map(p => p.x));
    const xSpark = d3.scaleLinear().domain(xDomain).range([0, w]);
    const ySpark = d3.scaleLinear().domain(d3.extent(allValues)).nice().range([h, 0]);

    const line = d3.line()
      .defined(p => p.y != null)
      .x(p => xSpark(p.x))
      .y(p => ySpark(p.y));

    group.select(".max-line")
      .attr("transform", `translate(${sparkPad},${sparkPad})`)
      .attr("d", line(maxSeries));

    group.select(".min-line")
      .attr("transform", `translate(${sparkPad},${sparkPad})`)
      .attr("d", line(minSeries));
  });
}

function setBackgroundColors(cellJoin, color) {
  cellJoin.select("rect.bg")
    .attr("fill", d => {
      const value = currentMode === Mode.MAX ? d.monthMax : d.monthMin;
      return value == null ? "rgba(255,255,255,0.06)" : color(value);
    });
}

// ---------- main ----------
async function main() {
  const raw = await d3.csv(DATA_PATH);
  if (!raw.length) throw new Error("CSV is empty or could not be loaded.");

  const detectedColumns = detectTempColumns(raw[0]);
  const { maxKey, minKey, singleTempKey } = detectedColumns;

  const daily = parseDailyRows(raw, detectedColumns);

  const daily10 = clampToLast10Years(daily);
  const cells = buildMonthlyCells(daily10);

  const years = Array.from(new Set(cells.map(c => c.year))).sort((a,b) => a-b);
  const months = d3.range(0, 12);

  const innerW = years.length * cellW;
  const innerH = months.length * cellH;
  const width = innerW + margin.left + margin.right;
  const height = innerH + margin.top + margin.bottom;

  const container = d3.select("#chart");
  const { svg, gradId, gradient } = createSvgFrame(container, width, height);

  // click anywhere toggles background mode
  svg.on("click", () => {
    currentMode = (currentMode === Mode.MAX) ? Mode.MIN : Mode.MAX;
    update();
  });

  const g = svg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  const x = d3.scaleBand()
    .domain(years)
    .range([0, innerW])
    .paddingInner(0.08)
    .paddingOuter(0.03);

  const y = d3.scaleBand()
    .domain(months)
    .range([0, innerH])
    .paddingInner(0.08)
    .paddingOuter(0.03);

  // Tooltip
  const tooltip = d3.select("#tooltip");
  const { moveTooltip, showTooltip, hideTooltip } = createTooltipHandlers(tooltip);

  // Title area
  const title = svg.append("text")
    .attr("x", margin.left)
    .attr("y", 32)
    .attr("fill", "rgba(255,255,255,0.92)")
    .attr("font-size", 16)
    .attr("font-weight", 650);

  const subtitle = svg.append("text")
    .attr("x", margin.left)
    .attr("y", 54)
    .attr("fill", "rgba(255,255,255,0.65)")
    .attr("font-size", 12);

  // Axes
  g.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${innerH})`)
    .call(d3.axisBottom(x).tickSizeOuter(0));

  g.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(y).tickFormat(m => MONTH_NAMES[m]).tickSizeOuter(0));

  // Legend group
  const legendG = svg.append("g")
    .attr("class", "legend")
    .attr("transform", `translate(${margin.left + innerW - 260}, 18)`);

  // Cells
  const cellLayer = g.append("g");

  const cellJoin = cellLayer.selectAll("g.cell")
    .data(cells, d => `${d.year}-${d.month}`)
    .join("g")
    .attr("class", "cell")
    .attr("transform", d => `translate(${x(d.year)},${y(d.month)})`)
    .on("mousemove", (event) => moveTooltip(event))
    .on("mouseenter", (event, d) => showTooltip(event, d))
    .on("mouseleave", hideTooltip);

  cellJoin.append("rect")
    .attr("class", "bg")
    .attr("rx", 10)
    .attr("ry", 10)
    .attr("width", x.bandwidth())
    .attr("height", y.bandwidth());

  // Sparkline group inside each cell
  const sparkG = cellJoin.append("g")
    .attr("transform", `translate(${sparkPad},${sparkPad})`);

  // Two lines: max + min
  sparkG.append("path")
    .attr("class", "sparkline max-line");

  sparkG.append("path")
    .attr("class", "sparkline min-line");

  function update() {
    const domain = computeColorDomain(cells);

    // background color scale
    const color = d3.scaleSequential()
      .domain(domain)
      .interpolator(d3.interpolateTurbo);

    const label = currentMode === Mode.MAX ? "Monthly MAX temperature" : "Monthly MIN temperature";
    title.text(`Matrix View: ${label} (last 10 years)`);
    subtitle.text(
      `Click to toggle background. Columns detected: max=${maxKey ?? "N/A"}, min=${minKey ?? "N/A"}, temp=${singleTempKey ?? "N/A"}`
    );

    setBackgroundColors(cellJoin, color);
    updateSparklinePaths(cellJoin, x.bandwidth(), y.bandwidth());
    drawLegend(legendG, gradient, gradId, color, domain);
  }

  update();
}

main().catch(err => {
  console.error(err);
  d3.select("#chart").append("pre")
    .style("color", "salmon")
    .text(String(err));
});

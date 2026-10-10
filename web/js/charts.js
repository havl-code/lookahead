// charts.js: the charts on the Analytics tab, drawn with Plotly

const CHART_IDS = ['progress-chart', 'distribution-chart', 'breakdown-chart', 'consistency-chart'];

// Plotly (the charting library) is bundled in vendor/ and loaded the first time the charts are
// shown, so the rest of the app doesn't wait for it. The promise is shared, so asking again
// while it's still loading doesn't load it twice.
let plotlyPromise = null;

function loadPlotly() {
    if (!plotlyPromise) {
        plotlyPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'vendor/plotly-cartesian-2.27.0.min.js';
            script.onload = () => {
                AppState.plotlyLoaded = true;
                resolve();
            };
            script.onerror = () => {
                // Forget the failed attempt, so the next visit to the tab tries again
                script.remove();
                plotlyPromise = null;
                reject(new Error('Failed to load Plotly'));
            };
            document.head.appendChild(script);
        });
    }
    return plotlyPromise;
}

// Bumped on every redraw, so a slow response for an old selection never replaces a newer chart
let chartRequest = 0;

async function renderAllCharts() {
    const request = ++chartRequest;
    try {
        await loadPlotly();
    } catch (error) {
        CHART_IDS.forEach(id => {
            document.getElementById(id).innerHTML =
                '<div class="loading">The charting library could not be loaded. Try reloading the page.</div>';
        });
        return;
    }

    const eventId = document.getElementById('analytics-event-select').value || '333';
    const sessionId = document.getElementById('analytics-session-select').value || 'all';
    await Promise.all([
        loadProgressChart(request, eventId, sessionId),
        loadDistributionChart(request, eventId, sessionId),
        loadRollingChart(request, eventId, sessionId),
        loadConsistencyChart(request, eventId, sessionId)
    ]);
}

// Fetch a chart's data, showing a message in the chart's place if there isn't enough yet.
// Returns null if there's nothing to draw (or the selection has changed in the meantime).
async function fetchChartData(request, containerId, url, hasData) {
    const container = document.getElementById(containerId);
    labelChart(container, null);  // a message in its place is read as it is
    container.innerHTML = '<div class="loading">Loading...</div>';
    try {
        const response = await apiFetch(url);
        const data = await response.json();
        if (request !== chartRequest) return null;
        // A chart without enough data yet comes back with a message saying what it needs
        if (data.error || !hasData(data)) {
            container.innerHTML = `<div class="loading">${escapeHtml(data.message || data.error || 'No data yet')}</div>`;
            return null;
        }
        return data;
    } catch (error) {
        console.error(`${containerId} error:`, error);
        container.innerHTML = '<div class="loading">Could not load this chart.</div>';
        return null;
    }
}

// Chart colours come from the page's CSS variables, so charts always match the current theme
function chartLayout(xTitle, yTitle = 'Time (seconds)') {
    const css = getComputedStyle(document.documentElement);
    const cssVar = name => css.getPropertyValue(name).trim();
    const axis = title => ({
        title: { text: title, font: { size: 12, color: cssVar('--text-secondary') } },
        gridcolor: cssVar('--border-primary'),
        linecolor: cssVar('--border-secondary'),
        zeroline: false,
        automargin: true
    });

    return {
        font: { family: cssVar('--font-body'), size: 12, color: cssVar('--text-secondary') },
        plot_bgcolor: cssVar('--bg-secondary'),
        paper_bgcolor: cssVar('--bg-secondary'),
        xaxis: axis(xTitle),
        yaxis: axis(yTitle),
        legend: { orientation: 'h', x: 0, y: 1.02, yanchor: 'bottom' },
        margin: { l: 56, r: 16, t: 40, b: 48 },
        hovermode: 'closest'
    };
}

// Draw a chart. `summary` says in words what it shows, for anyone who can't see it.
function draw(containerId, traces, layout, summary) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    Plotly.newPlot(container, traces, layout, chartConfig);
    labelChart(container, summary);
}

// ---- Each chart in words ----
// A screen reader can't make sense of a chart's drawing (a jumble of shapes and axis labels), so
// a drawn chart is marked as one image, named with a sentence or two saying what it shows. The
// sentences come from the same numbers the chart is drawn from.

function labelChart(container, summary) {
    if (summary) {
        container.setAttribute('role', 'img');
        container.setAttribute('aria-label', summary);
    } else {
        container.removeAttribute('role');
        container.removeAttribute('aria-label');
    }
}

const timeOrDnf = seconds => (seconds == null ? 'a DNF' : formatTime(seconds));

function bestOf(values) {
    const done = values.filter(v => v != null);
    return done.length ? Math.min(...done) : null;
}

function progressSummary(points) {
    const first = points[0];
    const last = points[points.length - 1];
    let text = `Progress over ${countLabel(points.length, 'session')}, from ${first.date} to ${last.date}.`;
    const ao5s = points.filter(p => p.ao5 != null);
    if (ao5s.length >= 2) {
        text += ` The last Ao5 went from ${formatTime(ao5s[0].ao5)} to ${formatTime(ao5s[ao5s.length - 1].ao5)}.`;
    }
    const best = points.filter(p => p.best != null).sort((a, b) => a.best - b.best)[0];
    if (best) text += ` Best single ${formatTime(best.best)}, on ${best.date}.`;
    return text;
}

function sessionProgressSummary(points) {
    const first = points[0];
    const last = points[points.length - 1];
    const fastest = bestOf(points.map(p => p.time));
    const dnfs = points.filter(p => p.time == null).length;
    const parts = [`Solves ${first.solve_number} to ${last.solve_number} of this session`];
    if (fastest != null) parts.push(`fastest ${formatTime(fastest)}`);
    if (last.mean != null) parts.push(`mean ${formatTime(last.mean)}`);
    if (last.ao5 !== undefined && points.length >= 5) parts.push(`latest Ao5 ${timeOrDnf(last.ao5)}`);
    if (dnfs) parts.push(countLabel(dnfs, 'DNF'));
    return `${parts.join(', ')}.`;
}

function distributionSummary(sorted, mean, median) {
    return `How ${countLabel(sorted.length, 'solve')} spread out: fastest ${formatTime(sorted[0])}, ` +
           `median ${formatTime(median)}, mean ${formatTime(mean)}, and slowest ${formatTime(sorted[sorted.length - 1])}.`;
}

function rollingSummary(data) {
    const latest = values => (values.length ? values[values.length - 1] : null);
    const describe = (name, values) => {
        if (!values.some(v => v != null)) return null;
        return `${name} now ${timeOrDnf(latest(values))}, best ${formatTime(bestOf(values))}`;
    };
    const parts = [describe('Ao5', data.rolling5 || []), describe('Ao12', data.rolling12 || [])].filter(Boolean);
    return `The last ${countLabel(data.times.length, 'solve')} with rolling averages` +
           (parts.length ? `: ${parts.join('; ')}.` : '.');
}

function consistencySummary(sessions) {
    const medians = sessions.map(s => s.median);
    const steadiest = [...sessions].sort((a, b) => (a.q3 - a.q1) - (b.q3 - b.q1))[0];
    return `How spread out the times were in the last ${countLabel(sessions.length, 'session')}. ` +
           `Median times ranged from ${formatTime(Math.min(...medians))} to ${formatTime(Math.max(...medians))}. ` +
           `The steadiest was on ${steadiest.date}, with the middle half of its solves within ` +
           `${(steadiest.q3 - steadiest.q1).toFixed(2)} seconds of each other.`;
}

const line = (x, y, name, color, extra = {}) => ({ x, y, name, type: 'scatter', mode: 'lines', line: { color, width: 2 }, ...extra });

async function loadProgressChart(request, eventId, sessionId) {
    const url = sessionId === 'all'
        ? `/charts/progress?event_id=${encodeURIComponent(eventId)}`
        : `/charts/session-progress?session_id=${sessionId}`;
    const data = await fetchChartData(request, 'progress-chart', url, d => d.data && d.data.length > 0);
    if (!data) return;

    const points = data.data;
    let traces;
    if (sessionId === 'all') {
        const x = points.map((_, i) => i + 1);
        const markers = color => ({ mode: 'lines+markers', marker: { size: 6, color } });
        traces = [
            line(x, points.map(d => d.best), 'Best single', COLORS.primary, markers(COLORS.primary)),
            line(x, points.map(d => d.mean), 'Session mean', COLORS.secondary, markers(COLORS.secondary)),
            line(x, points.map(d => d.ao5), 'Last Ao5', COLORS.tertiary, markers(COLORS.tertiary))
        ];
    } else {
        const x = points.map(d => d.solve_number);
        // A DNF has no time, so it's a gap in the Time dots; it still counts in the Ao5 the WCA way
        traces = [
            line(x, points.map(d => d.time), 'Time', COLORS.primary,
                { mode: 'markers', marker: { size: 5, color: COLORS.primary, opacity: 0.6 } }),
            line(x, points.map(d => d.mean), 'Running mean', COLORS.secondary, { line: { color: COLORS.secondary, width: 2, dash: 'dash' } }),
            line(x, points.map(d => d.ao5), 'Ao5', COLORS.tertiary)
        ];
    }
    const layout = chartLayout(sessionId === 'all' ? 'Session' : 'Solve number');
    if (sessionId === 'all') {
        // Whole sessions only (no 1.5), with at most about 10 labels
        layout.xaxis.dtick = Math.max(1, Math.ceil(points.length / 10));
    }
    draw('progress-chart', traces, layout,
         sessionId === 'all' ? progressSummary(points) : sessionProgressSummary(points));
}

async function loadDistributionChart(request, eventId, sessionId) {
    const url = sessionId === 'all'
        ? `/charts/distribution?event_id=${encodeURIComponent(eventId)}`
        : `/charts/session-distribution?session_id=${sessionId}`;
    const data = await fetchChartData(request, 'distribution-chart', url, d => d.times && d.times.length > 0);
    if (!data) return;

    const times = data.times;
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const sorted = [...times].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const stdDev = Math.sqrt(times.reduce((sum, t) => sum + (t - mean) ** 2, 0) / times.length);

    const layout = chartLayout('Time (seconds)', 'Solves');
    layout.showlegend = false;
    layout.bargap = 0.04;
    layout.shapes = [{
        type: 'line', x0: median, x1: median, y0: 0, y1: 1, yref: 'paper',
        line: { color: COLORS.danger, width: 2, dash: 'dash' }
    }];
    layout.annotations = [{
        xref: 'paper', yref: 'paper', x: 0, y: 1.02, xanchor: 'left', yanchor: 'bottom', showarrow: false,
        text: `Mean ${mean.toFixed(2)}s   Median ${median.toFixed(2)}s   SD ${stdDev.toFixed(2)}s`,
        font: { size: 12 }
    }];

    draw('distribution-chart', [{
        x: times,
        type: 'histogram',
        nbinsx: Math.min(40, Math.max(10, Math.floor(times.length / 5))),
        marker: { color: COLORS.primary },
        opacity: 0.9,
        name: 'Solves'
    }], layout, distributionSummary(sorted, mean, median));
}

async function loadRollingChart(request, eventId, sessionId) {
    const url = sessionId === 'all'
        ? `/charts/rolling-average?event_id=${encodeURIComponent(eventId)}`
        : `/charts/session-rolling?session_id=${sessionId}`;
    const data = await fetchChartData(request, 'breakdown-chart', url, d => d.times && d.times.length > 0);
    if (!data) return;

    // DNFs leave gaps in the dots, and count in the rolling averages the WCA way (a DNF is the
    // worst result in its window, and two in an Ao5 make it a DNF)
    const x = data.times.map((_, i) => i + 1);
    draw('breakdown-chart', [
        line(x, data.times, 'Solves', COLORS.gray, { mode: 'markers', marker: { color: COLORS.gray, size: 4, opacity: 0.35 } }),
        line(x, data.rolling5 || [], 'Rolling Ao5', COLORS.primary),
        line(x, data.rolling12 || [], 'Rolling Ao12', COLORS.secondary)
    ], chartLayout('Recent solves'), rollingSummary(data));
}

async function loadConsistencyChart(request, eventId, sessionId) {
    const container = document.getElementById('consistency-chart');
    if (sessionId !== 'all') {
        labelChart(container, null);
        container.innerHTML = '<div class="loading">This chart compares sessions, so it shows when "All sessions" is selected.</div>';
        return;
    }

    const url = `/charts/consistency?event_id=${encodeURIComponent(eventId)}`;
    const data = await fetchChartData(request, 'consistency-chart', url, d => d.sessions && d.sessions.length > 0);
    if (!data) return;

    // The server sends each session's box plot summary (quartiles, whiskers, mean and SD)
    const palette = [COLORS.primary, COLORS.secondary, COLORS.tertiary, COLORS.quaternary, COLORS.info];
    const traces = data.sessions.map((s, i) => {
        const label = `Session ${s.session_id}<br>${s.date}`;
        return {
            type: 'box',
            name: label,
            x: [label],
            q1: [s.q1],
            median: [s.median],
            q3: [s.q3],
            lowerfence: [s.lowerfence],
            upperfence: [s.upperfence],
            mean: [s.mean],
            sd: [s.sd],
            boxmean: 'sd',
            marker: { color: palette[i % palette.length] },
            line: { width: 1.5 }
        };
    });
    const layout = chartLayout('');
    layout.showlegend = false;
    draw('consistency-chart', traces, layout, consistencySummary(data.sessions));
}

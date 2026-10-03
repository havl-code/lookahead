// analytics.js: the Analytics tab. The event menu drives everything here: the scores and
// insights (worked out across that event's sessions) and the charts, which the "Charts for"
// menu can narrow to a single session. The charts themselves are drawn in charts.js.

async function loadAnalyticsTab() {
    await refreshAnalyticsEvents();
    await loadSessionsForCharts();
    updateAnalytics();
    renderAllCharts();
}

function changeAnalyticsEvent() {
    document.getElementById('analytics-session-select').value = 'all';
    loadSessionsForCharts();
    updateAnalytics();
    renderAllCharts();
}

// Refill the event menu (events can be added by an import at any time). Keeps the current
// choice if it's still there, otherwise picks 3x3x3, otherwise the first event.
async function refreshAnalyticsEvents() {
    const response = await fetch(`${API_BASE}/events`);
    const events = await response.json();

    const select = document.getElementById('analytics-event-select');
    const current = select.value;
    select.innerHTML = '';
    events.forEach(eventId => {
        const option = document.createElement('option');
        option.value = eventId;
        option.textContent = getEventName(eventId);
        select.appendChild(option);
    });
    if (events.includes(current)) {
        select.value = current;
    } else if (events.includes('333')) {
        select.value = '333';
    }
}

// Fill the "Charts for" menu with the chosen event's sessions
async function loadSessionsForCharts() {
    const response = await fetch(`${API_BASE}/sessions`);
    const sessions = await response.json();

    const sessionSelect = document.getElementById('analytics-session-select');
    const currentEvent = document.getElementById('analytics-event-select').value;
    const currentSession = sessionSelect.value;

    sessionSelect.innerHTML = '<option value="all">All sessions</option>';
    sessions.filter(s => s.event_id === currentEvent).forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        const best = session.best_single != null ? `, best ${formatTime(session.best_single)}` : '';
        option.textContent = `Session ${session.id}, ${session.date} (${countLabel(session.solve_count, 'solve')}${best})`;
        sessionSelect.appendChild(option);
    });

    if ([...sessionSelect.options].some(opt => opt.value === currentSession)) {
        sessionSelect.value = currentSession;
    }
}

// ---- Scores and insights ----
// The server works the scores out (speedcube/scores.py): each is the percentage of WCA
// competitors in the event that a session beats. docs/SCORES.md explains them for users.

const METRICS = ['speed', 'consistency', 'overall'];
const SCORES_DOC_URL = 'https://github.com/havl-code/speedcube-training-explorer/blob/main/docs/SCORES.md';

// The average of a score over some sessions, leaving out sessions without one (null if none)
function averageScore(sessions, key) {
    const values = sessions.map(s => s[key]).filter(v => v !== null && v !== undefined);
    return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

const latestWith = (sessions, key) => sessions.find(s => s[key] !== null && s[key] !== undefined);

async function updateAnalytics() {
    const eventId = document.getElementById('analytics-event-select').value || '333';

    try {
        const response = await fetch(`${API_BASE}/analytics/session-heatmap?event_id=${encodeURIComponent(eventId)}`);
        const data = await response.json();

        if (data.error || !data.sessions || data.sessions.length === 0) {
            showAnalyticsEmptyState(`No ${escapeHtml(getEventName(eventId))} sessions yet. Log a few solves to see analytics here.`);
            return;
        }

        // Each card shows the 10 most recent sessions, compared with the 10 before them
        const sessions = data.sessions;
        const recent = sessions.slice(0, 10);
        const older = sessions.slice(10, 20);

        const moreNeeded = 11 - sessions.length;
        const noTrendText = moreNeeded > 0
            ? `Trend shows after ${countLabel(moreNeeded, 'more session')}`
            : 'No earlier sessions with this score to compare with';

        METRICS.forEach(metric => {
            const key = `${metric}_score`;
            const now = averageScore(recent, key);
            const before = averageScore(older, key);
            updateMetricCard(metric, now, now !== null && before !== null ? now - before : null,
                metricDetail(metric, sessions, data), missingScoreText(metric, data), noTrendText);
        });
        showScoresNote(eventId, data);
        generateInsights(sessions, recent, older);
    } catch (error) {
        console.error('Error updating metrics:', error);
        showAnalyticsEmptyState('Could not load analytics right now.');
    }
}

// "Ao5", "Mo3" or "best of 3": what the event's typical result is measured in
function roundLabel(data) {
    if (data.result_kind === 'best') return `best of ${data.solves_per_round}`;
    return data.solves_per_round === 5 ? 'Ao5' : `Mo${data.solves_per_round}`;
}

// The latest session's raw figure behind a score, so the score isn't just a number
function metricDetail(metric, sessions, data) {
    if (metric === 'speed') {
        const latest = latestWith(sessions, 'speed_score');
        if (!latest || latest.typical_result === undefined) return '';
        const typical = latest.typical_result === null ? 'DNF' : formatTime(latest.typical_result);
        return `Latest session: typical ${roundLabel(data)} ${typical}`;
    }
    if (metric === 'consistency') {
        const latest = latestWith(sessions, 'consistency_score');
        if (!latest || latest.spread_percent == null) return '';
        return `Latest session: solves vary by about ${latest.spread_percent}%`;
    }
    return '';
}

// Why a card has no score
function missingScoreText(metric, data) {
    const noComparison = 'No WCA comparison for this event';
    if (metric === 'speed') {
        return data.has_speed_reference ? `Needs a full ${roundLabel(data)} of solves` : noComparison;
    }
    if (metric === 'consistency') {
        return data.has_consistency_reference ? `Needs ${data.min_pairs + 1} solves in a session` : noComparison;
    }
    return data.has_speed_reference && data.has_consistency_reference ? 'Needs both other scores' : noComparison;
}

function showScoresNote(eventId, data) {
    const date = iso => new Date(`${iso}T00:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
    const eventName = escapeHtml(getEventName(eventId));
    const docLink = `<a href="${SCORES_DOC_URL}" target="_blank" rel="noopener noreferrer">How the scores work</a>.`;
    document.getElementById('scores-note').innerHTML = !data.has_speed_reference && !data.has_consistency_reference
        ? `There isn't enough WCA data to score ${eventName}. ${docLink}`
        : `Each score is the percentage of WCA competitors in ${eventName} a session beats, ` +
          `using official results from ${date(data.reference_start)} to ${date(data.reference_date)}. ` +
          `${docLink} ${escapeHtml(data.wca_notice)}`;
}

function showAnalyticsEmptyState(message) {
    METRICS.forEach(metric => updateMetricCard(metric, null, null, '', 'No data yet'));
    document.getElementById('scores-note').innerHTML = '';

    document.getElementById('insights-container').innerHTML = `
        <div class="insight-item">
            <div class="insight-bullet neutral"></div>
            <div class="insight-content">
                <div class="insight-text">${message}</div>
            </div>
        </div>
    `;
}

function updateMetricCard(metric, value, trend, detail, missingText, noTrendText) {
    document.getElementById(`metric-${metric}`).textContent = value === null ? '--' : value.toFixed(1);
    setScoreBar(metric, value === null ? 0 : value);
    document.getElementById(`metric-${metric}-detail`).textContent = detail;

    let trendClass = 'neutral';
    let arrow = '→';
    let text = 'Steady';

    if (value === null) {
        arrow = '';
        text = missingText;
    } else if (trend === null) {
        text = noTrendText;
    } else if (trend > 2) {
        trendClass = 'positive';
        arrow = '↑';
        text = `${trend.toFixed(1)} better than before`;
    } else if (trend < -2) {
        trendClass = 'negative';
        arrow = '↓';
        text = `${Math.abs(trend).toFixed(1)} lower than before`;
    }

    const trendEl = document.getElementById(`metric-${metric}-trend`);
    trendEl.className = `metric-trend ${trendClass}`;
    trendEl.innerHTML = (arrow ? `<span class="trend-arrow">${arrow}</span>` : '') + `<span>${text}</span>`;
}

// Scores are out of 100; the bar is coloured from red (needs work) to green (excellent)
function setScoreBar(metric, value) {
    const bar = document.getElementById(`${metric}-bar`);
    const category = value >= 80 ? 'excellent' : value >= 60 ? 'good' : value >= 40 ? 'average' : 'poor';
    bar.className = `performance-bar-fill ${category}`;
    bar.style.width = `${Math.min(100, Math.max(0, value))}%`;
}

function generateInsights(sessions, recent, older) {
    const insights = [];
    const recentOverall = averageScore(recent, 'overall_score');
    const olderOverall = averageScore(older, 'overall_score');
    const improvement = recentOverall !== null && olderOverall !== null ? recentOverall - olderOverall : 0;

    if (improvement > 5) {
        insights.push({ type: 'positive', text: 'Strong improvement trend', detail: `Up ${improvement.toFixed(1)} points recently.` });
    } else if (improvement < -5) {
        insights.push({ type: 'negative', text: 'Performance has dipped', detail: 'It might be worth reviewing your technique.' });
    }

    const recentConsistency = averageScore(recent, 'consistency_score');
    if (recentConsistency !== null && recentConsistency < 30) {
        insights.push({ type: 'neutral', text: 'Focus on consistency', detail: 'Your solves vary more than most competitors\'. Try turning at a steady pace, even with a metronome.' });
    } else if (recentConsistency !== null && recentConsistency > 70) {
        insights.push({ type: 'positive', text: 'Excellent consistency', detail: 'Your solves are steadier than most competitors\'.' });
    }

    if (sessions.length < 10) {
        insights.push({ type: 'neutral', text: 'Build up more data', detail: `${10 - sessions.length} more sessions will make these trends more reliable.` });
    }

    if (insights.length === 0) {
        insights.push({ type: 'neutral', text: 'Keep training!', detail: 'Your performance is stable.' });
    }

    document.getElementById('insights-container').innerHTML = insights.map(insight => `
        <div class="insight-item">
            <div class="insight-bullet ${insight.type}"></div>
            <div class="insight-content">
                <div class="insight-text">${insight.text}</div>
                <div class="insight-detail">${insight.detail}</div>
            </div>
        </div>
    `).join('');
}

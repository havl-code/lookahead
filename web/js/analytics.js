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

const average = (items, key) => items.reduce((sum, item) => sum + item[key], 0) / items.length;

async function updateAnalytics() {
    const eventId = document.getElementById('analytics-event-select').value || '333';

    try {
        const response = await fetch(`${API_BASE}/analytics/session-heatmap?event_id=${encodeURIComponent(eventId)}`);
        const data = await response.json();

        if (data.error || !data.sessions || data.sessions.length === 0) {
            showAnalyticsEmptyState(`No ${escapeHtml(getEventName(eventId))} sessions yet. Log a few solves to see analytics here.`);
            return;
        }
        if (data.sessions.length < 2) {
            showAnalyticsEmptyState('Analytics need at least 2 sessions to compare, and you have 1 so far. Keep training!');
            return;
        }

        // Compare the 10 most recent sessions with the 10 before them
        const sessions = data.sessions;
        const recent = sessions.slice(0, 10);
        const older = sessions.slice(10, 20);

        ['speed', 'consistency', 'accuracy', 'overall'].forEach(metric => {
            const key = `${metric}_score`;
            const now = average(recent, key);
            const before = older.length > 0 ? average(older, key) : now;
            updateMetricCard(metric, now, now - before);
        });

        generateInsights(sessions, recent, older);
    } catch (error) {
        console.error('Error updating metrics:', error);
        showAnalyticsEmptyState('Could not load analytics right now.');
    }
}

function showAnalyticsEmptyState(message) {
    ['speed', 'consistency', 'accuracy', 'overall'].forEach(metric => {
        document.getElementById(`metric-${metric}`).textContent = '--';
        const trendEl = document.getElementById(`metric-${metric}-trend`);
        trendEl.className = 'metric-trend neutral';
        trendEl.innerHTML = '<span>No data yet</span>';
        setScoreBar(metric, 0);
    });

    document.getElementById('insights-container').innerHTML = `
        <div class="insight-item">
            <div class="insight-bullet neutral"></div>
            <div class="insight-content">
                <div class="insight-text">${message}</div>
            </div>
        </div>
    `;
}

function updateMetricCard(metric, value, trend) {
    document.getElementById(`metric-${metric}`).textContent = value.toFixed(1);
    setScoreBar(metric, value);

    let trendClass = 'neutral';
    let arrow = '→';
    let text = 'Steady';

    if (trend > 2) {
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
    trendEl.innerHTML = `<span class="trend-arrow">${arrow}</span><span>${text}</span>`;
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
    const improvement = average(recent, 'overall_score') - (older.length > 0 ? average(older, 'overall_score') : average(recent, 'overall_score'));

    if (improvement > 5) {
        insights.push({ type: 'positive', text: 'Strong improvement trend', detail: `Up ${improvement.toFixed(1)} points recently.` });
    } else if (improvement < -5) {
        insights.push({ type: 'negative', text: 'Performance has dipped', detail: 'It might be worth reviewing your technique.' });
    }

    const recentConsistency = average(recent, 'consistency_score');
    if (recentConsistency < 50) {
        insights.push({ type: 'neutral', text: 'Focus on consistency', detail: 'Try practising with a metronome.' });
    } else if (recentConsistency > 80) {
        insights.push({ type: 'positive', text: 'Excellent consistency', detail: 'Great muscle memory!' });
    }

    if (average(recent, 'accuracy_score') < 70) {
        insights.push({ type: 'negative', text: 'High penalty rate', detail: 'Slow down a little to cut out +2s and DNFs.' });
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

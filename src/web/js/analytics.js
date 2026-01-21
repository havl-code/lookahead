// analytics.js

// Load analytics tab
async function loadAnalyticsTab() {
    await loadHeatmapAnalytics();
}

async function loadHeatmapAnalytics() {
    // Ensure Plotly is loaded
    if (!AppState.plotlyLoaded) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.plot.ly/plotly-2.27.0.min.js';
            script.onload = () => {
                AppState.plotlyLoaded = true;
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load Plotly'));
            document.head.appendChild(script);
        });
    }
    
    await addAnalyticsControls();
    await renderAllHeatmaps();
}

async function addAnalyticsControls() {
    if (document.getElementById('analytics-event-select')) return;
    
    const response = await fetch(`${API_BASE}/events`);
    const events = await response.json();
    
    const analyticsSection = document.querySelector('#analytics');
    
    const controlsHTML = `
        <div class="chart-filters">
            <div style="display: flex; gap: 20px; align-items: flex-end; flex-wrap: wrap;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px;">Event:</label>
                    <select id="analytics-event-select" class="chart-select">
                    </select>
                </div>
                <button onclick="renderAllHeatmaps()" class="btn-primary">
                    Update Analytics
                </button>
            </div>
        </div>
    `;
    
    const h2 = analyticsSection.querySelector('h2');
    h2.insertAdjacentHTML('afterend', controlsHTML);
    
    const eventSelect = document.getElementById('analytics-event-select');
    events.forEach(eventId => {
        const option = document.createElement('option');
        option.value = eventId;
        option.textContent = getEventName(eventId);
        option.selected = eventId === '333';
        eventSelect.appendChild(option);
    });
}

async function renderAllHeatmaps() {
    await updateMetricsCards();
}


async function updateMetricsCards() {
    const eventId = document.getElementById('analytics-event-select')?.value || '333';
    
    try {
        const response = await fetch(`${API_BASE}/analytics/session-heatmap?event_id=${eventId}`);
        const data = await response.json();
        
        if (data.error || !data.sessions || data.sessions.length < 2) return;
        
        const sessions = data.sessions;
        const recent = sessions.slice(0, 10);
        const older = sessions.slice(10, 20);
        
        const recentSpeed = recent.reduce((sum, s) => sum + s.speed_score, 0) / recent.length;
        const recentConsistency = recent.reduce((sum, s) => sum + s.consistency_score, 0) / recent.length;
        const recentAccuracy = recent.reduce((sum, s) => sum + s.accuracy_score, 0) / recent.length;
        const recentOverall = recent.reduce((sum, s) => sum + s.overall_score, 0) / recent.length;
        
        const olderSpeed = older.length > 0 ? older.reduce((sum, s) => sum + s.speed_score, 0) / older.length : recentSpeed;
        const olderConsistency = older.length > 0 ? older.reduce((sum, s) => sum + s.consistency_score, 0) / older.length : recentConsistency;
        const olderAccuracy = older.length > 0 ? older.reduce((sum, s) => sum + s.accuracy_score, 0) / older.length : recentAccuracy;
        const olderOverall = older.length > 0 ? older.reduce((sum, s) => sum + s.overall_score, 0) / older.length : recentOverall;
        
        updateMetricCard('speed', recentSpeed, recentSpeed - olderSpeed);
        updateMetricCard('consistency', recentConsistency, recentConsistency - olderConsistency);
        updateMetricCard('accuracy', recentAccuracy, recentAccuracy - olderAccuracy);
        updateMetricCard('overall', recentOverall, recentOverall - olderOverall);
        
        updatePerformanceBar('speed', recentSpeed);
        updatePerformanceBar('consistency', recentConsistency);
        updatePerformanceBar('accuracy', recentAccuracy);
        updatePerformanceBar('overall', recentOverall);
        
        generateInsights(sessions, recent, older);
        
    } catch (error) {
        console.error('Error updating metrics:', error);
    }
}

function updateMetricCard(metric, value, trend) {
    const valueEl = document.getElementById(`metric-${metric}`);
    const trendEl = document.getElementById(`metric-${metric}-trend`);
    
    if (!valueEl || !trendEl) return;
    
    valueEl.textContent = value.toFixed(1);
    
    let trendClass = 'neutral';
    let arrow = '→';
    let text = 'No change';
    
    if (trend > 2) {
        trendClass = 'positive';
        arrow = '↑';
        text = `+${trend.toFixed(1)} improvement`;
    } else if (trend < -2) {
        trendClass = 'negative';
        arrow = '↓';
        text = `${trend.toFixed(1)} decline`;
    }
    
    trendEl.className = `metric-trend ${trendClass}`;
    trendEl.innerHTML = `<span class="trend-arrow">${arrow}</span><span>${text}</span>`;
}

function updatePerformanceBar(metric, value) {
    const barEl = document.getElementById(`${metric}-bar`);
    const valueEl = document.getElementById(`${metric}-score-value`);
    
    if (!barEl || !valueEl) return;
    
    const category = value >= 80 ? 'excellent' :
                     value >= 60 ? 'good' :
                     value >= 40 ? 'average' : 'poor';
    
    barEl.className = `performance-bar-fill ${category}`;
    barEl.style.width = `${value}%`;
    valueEl.textContent = `${value.toFixed(1)}/100`;
}

function generateInsights(sessions, recent, older) {
    const container = document.getElementById('insights-container');
    if (!container) return;
    
    const insights = [];
    const recentAvg = recent.reduce((sum, s) => sum + s.overall_score, 0) / recent.length;
    const olderAvg = older.length > 0 ? older.reduce((sum, s) => sum + s.overall_score, 0) / older.length : recentAvg;
    const improvement = recentAvg - olderAvg;
    
    if (improvement > 5) {
        insights.push({ type: 'positive', text: 'Strong improvement trend', detail: `Up ${improvement.toFixed(1)} points recently.` });
    } else if (improvement < -5) {
        insights.push({ type: 'negative', text: 'Performance decline', detail: `Consider reviewing technique.` });
    }
    
    const recentConsistency = recent.reduce((sum, s) => sum + s.consistency_score, 0) / recent.length;
    if (recentConsistency < 50) {
        insights.push({ type: 'neutral', text: 'Focus on consistency', detail: `Try metronome practice.` });
    } else if (recentConsistency > 80) {
        insights.push({ type: 'positive', text: 'Excellent consistency', detail: `Great muscle memory!` });
    }
    
    const recentAccuracy = recent.reduce((sum, s) => sum + s.accuracy_score, 0) / recent.length;
    if (recentAccuracy < 70) {
        insights.push({ type: 'negative', text: 'High penalty rate', detail: `Slow down to eliminate +2s.` });
    }
    
    if (sessions.length < 10) {
        insights.push({ type: 'neutral', text: 'Build more data', detail: `Need ${10 - sessions.length} more sessions.` });
    }
    
    if (insights.length === 0) {
        insights.push({ type: 'neutral', text: 'Keep training!', detail: 'Your performance is stable.' });
    }
    
    container.innerHTML = insights.map(insight => `
        <div class="insight-item">
            <div class="insight-bullet ${insight.type}"></div>
            <div class="insight-content">
                <div class="insight-text">${insight.text}</div>
                <div class="insight-detail">${insight.detail}</div>
            </div>
        </div>
    `).join('');
}
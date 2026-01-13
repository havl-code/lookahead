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
    await Promise.all([
        updateMetricsCards(),
        renderSessionPerformanceHeatmap(),
        renderTimeOfDayHeatmap(),
        renderSolveGrid(),
        renderPerformanceRadar()
    ]);
}

async function renderSessionPerformanceHeatmap() {
    const eventId = document.getElementById('analytics-event-select')?.value || '333';
    const container = document.getElementById('session-heatmap');
    
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/analytics/session-heatmap?event_id=${eventId}`);
        const data = await response.json();
        
        if (data.error || !data.sessions || data.sessions.length === 0) {
            container.innerHTML = `<div class="loading">${data.error || 'No data available'}</div>`;
            return;
        }
        
        const sessions = data.sessions;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        // Fix: Consolidate into a single trace with a 2D Z-matrix
        // This prevents the 't[e] is undefined' error by matching X and Y dimensions
        const trace = {
            x: sessions.map(s => s.date),
            y: ['Overall', 'Accuracy', 'Consistency', 'Speed'], 
            z: [
                sessions.map(s => s.overall_score),
                sessions.map(s => s.accuracy_score),
                sessions.map(s => s.consistency_score),
                sessions.map(s => s.speed_score)
            ],
            type: 'heatmap',
            colorscale: [
                [0, '#ef5350'],   // Red
                [0.5, '#ffa726'], // Orange
                [1, '#66bb6a']    // Green
            ],
            showscale: true,
            colorbar: {
                title: 'Score',
                titleside: 'right',
                tickmode: 'linear',
                tick0: 0,
                dtick: 20,
                tickfont: { color: isDark ? '#ffffff' : '#000000' }
            },
            hovertemplate: 'Date: %{x}<br>Metric: %{y}<br>Score: %{z:.1f}/100<extra></extra>'
        };
        
        const layout = {
            font: { family: 'Montserrat', size: 12, color: isDark ? '#ffffff' : '#000000' },
            plot_bgcolor: isDark ? '#2a2a2a' : '#ffffff',
            paper_bgcolor: isDark ? '#2a2a2a' : '#ffffff',
            title: {
                text: `Session Performance Metrics - ${getEventName(eventId)}`,
                font: { size: 16, color: isDark ? '#ffffff' : '#000000', weight: 600 }
            },
            xaxis: {
                title: 'Date',
                gridcolor: isDark ? '#404040' : '#e0e0e0',
                tickangle: -45,
                showline: true,
                linecolor: isDark ? '#555555' : '#cccccc'
            },
            yaxis: {
                title: '',
                gridcolor: isDark ? '#404040' : '#e0e0e0',
                showline: true,
                linecolor: isDark ? '#555555' : '#cccccc'
            },
            margin: { l: 100, r: 60, t: 80, b: 100 },
            height: 400
        };
        
        Plotly.newPlot(container, [trace], layout, chartConfig);
        
    } catch (error) {
        console.error('Session heatmap error:', error);
        container.innerHTML = `<div class="loading">Error loading heatmap</div>`;
    }
}

async function renderTimeOfDayHeatmap() {
    const eventId = document.getElementById('analytics-event-select')?.value || '333';
    const container = document.getElementById('time-of-day-chart');
    
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/analytics/time-of-day?event_id=${eventId}`);
        const data = await response.json();
        
        if (data.error || !data.data || data.data.length === 0) {
            container.innerHTML = `<div class="loading">${data.error || 'No data available'}</div>`;
            return;
        }
        
        const hourlyData = data.data;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        const trace = {
            x: hourlyData.map(d => d.hour_label),
            y: hourlyData.map(d => d.avg_time),
            type: 'bar',
            name: 'Average Time',
            marker: {
                color: hourlyData.map(d => d.avg_time),
                colorscale: [
                    [0, '#66bb6a'],   // Faster is Green
                    [0.5, '#ffa726'],
                    [1, '#ef5350']    // Slower is Red
                ],
                showscale: true,
                colorbar: {
                    title: 'Time (s)',
                    titleside: 'right',
                    tickfont: { color: isDark ? '#ffffff' : '#000000' }
                }
            },
            text: hourlyData.map(d => `${d.solve_count} solves`),
            hovertemplate: '<b>%{x}</b><br>Avg: %{y:.2f}s<br>%{text}<extra></extra>'
        };
        
        const layout = {
            font: { family: 'Montserrat', size: 12, color: isDark ? '#ffffff' : '#000000' },
            plot_bgcolor: isDark ? '#2a2a2a' : '#ffffff',
            paper_bgcolor: isDark ? '#2a2a2a' : '#ffffff',
            title: {
                text: `Performance by Time of Day - ${getEventName(eventId)}`,
                font: { size: 16, color: isDark ? '#ffffff' : '#000000', weight: 600 }
            },
            xaxis: {
                title: 'Hour of Day',
                gridcolor: isDark ? '#404040' : '#e0e0e0',
                showline: true,
                linecolor: isDark ? '#555555' : '#cccccc'
            },
            yaxis: {
                title: 'Average Time (seconds)',
                gridcolor: isDark ? '#404040' : '#e0e0e0',
                showline: true,
                linecolor: isDark ? '#555555' : '#cccccc'
            },
            margin: { l: 60, r: 30, t: 80, b: 60 }
        };
        
        Plotly.newPlot(container, [trace], layout, chartConfig);
        
    } catch (error) {
        console.error('Time of day chart error:', error);
        container.innerHTML = `<div class="loading">Error loading chart</div>`;
    }
}

async function renderSolveGrid() {
    const eventId = document.getElementById('analytics-event-select')?.value || '333';
    const container = document.getElementById('solve-grid');
    
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/analytics/solve-grid?event_id=${eventId}&limit=100`);
        const data = await response.json();
        
        if (data.error || !data.solves || data.solves.length === 0) {
            container.innerHTML = `<div class="loading">${data.error || 'No data available'}</div>`;
            return;
        }
        
        const solves = data.solves;
        
        // Create grid HTML
        let gridHTML = '<div class="solve-grid-container">';
        
        solves.forEach(solve => {
            const categoryClass = `solve-cell-${solve.category}`;
            const timeDisplay = solve.dnf ? 'DNF' : 
                                solve.plus_two ? `${solve.time.toFixed(2)}+` :
                                solve.time.toFixed(2);
            
            gridHTML += `
                <div class="solve-cell ${categoryClass}" 
                     title="Session ${solve.session_id} - ${solve.date}\nSolve #${solve.solve_number}\n${timeDisplay}s"
                     onclick="viewSolveDetails(${solve.session_id})">
                    <span class="solve-time">${timeDisplay}</span>
                </div>
            `;
        });
        
        gridHTML += '</div>';
        
        // Add legend
        gridHTML += `
            <div class="solve-grid-legend">
                <div class="legend-item"><div class="legend-color solve-cell-excellent"></div><span>Top 25%</span></div>
                <div class="legend-item"><div class="legend-color solve-cell-good"></div><span>25-50%</span></div>
                <div class="legend-item"><div class="legend-color solve-cell-average"></div><span>50-75%</span></div>
                <div class="legend-item"><div class="legend-color solve-cell-slow"></div><span>Bottom 25%</span></div>
                <div class="legend-item"><div class="legend-color solve-cell-penalty"></div><span>+2 Penalty</span></div>
                <div class="legend-item"><div class="legend-color solve-cell-dnf"></div><span>DNF</span></div>
            </div>
        `;
        
        container.innerHTML = gridHTML;
        
    } catch (error) {
        console.error('Solve grid error:', error);
        container.innerHTML = `<div class="loading">Error loading grid</div>`;
    }
}

async function renderPerformanceRadar() {
    const eventId = document.getElementById('analytics-event-select')?.value || '333';
    const container = document.getElementById('performance-radar');
    
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/analytics/session-heatmap?event_id=${eventId}`);
        const data = await response.json();
        
        if (data.error || !data.sessions || data.sessions.length === 0) {
            container.innerHTML = `<div class="loading">${data.error || 'No data available'}</div>`;
            return;
        }
        
        const sessions = data.sessions;
        const avgSpeed = sessions.reduce((sum, s) => sum + s.speed_score, 0) / sessions.length;
        const avgConsistency = sessions.reduce((sum, s) => sum + s.consistency_score, 0) / sessions.length;
        const avgAccuracy = sessions.reduce((sum, s) => sum + s.accuracy_score, 0) / sessions.length;
        
        const recent = sessions.slice(0, 10);
        const recentSpeed = recent.reduce((sum, s) => sum + s.speed_score, 0) / recent.length;
        const recentConsistency = recent.reduce((sum, s) => sum + s.consistency_score, 0) / recent.length;
        const recentAccuracy = recent.reduce((sum, s) => sum + s.accuracy_score, 0) / recent.length;
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        const traces = [
            {
                type: 'scatterpolar',
                r: [avgSpeed, avgConsistency, avgAccuracy, avgSpeed],
                theta: ['Speed', 'Consistency', 'Accuracy', 'Speed'],
                fill: 'toself',
                name: 'Overall Average',
                line: { color: '#ffa726', width: 2 },
                fillcolor: 'rgba(255, 167, 38, 0.2)'
            },
            {
                type: 'scatterpolar',
                r: [recentSpeed, recentConsistency, recentAccuracy, recentSpeed],
                theta: ['Speed', 'Consistency', 'Accuracy', 'Speed'],
                fill: 'toself',
                name: 'Recent (Last 10)',
                line: { color: '#4a90e2', width: 2 },
                fillcolor: 'rgba(74, 144, 226, 0.2)'
            }
        ];
        
        const layout = {
            font: { family: 'Montserrat', size: 12, color: isDark ? '#ffffff' : '#000000' },
            paper_bgcolor: isDark ? '#2a2a2a' : '#ffffff',
            title: {
                text: `Performance Profile - ${getEventName(eventId)}`,
                font: { size: 16, color: isDark ? '#ffffff' : '#000000', weight: 600 }
            },
            polar: {
                radialaxis: {
                    visible: true,
                    range: [0, 100],
                    gridcolor: isDark ? '#404040' : '#e0e0e0',
                    tickfont: { color: isDark ? '#ffffff' : '#000000' }
                },
                angularaxis: {
                    gridcolor: isDark ? '#404040' : '#e0e0e0',
                    tickfont: { color: isDark ? '#ffffff' : '#000000' }
                },
                bgcolor: isDark ? '#2a2a2a' : '#ffffff'
            },
            showlegend: true,
            legend: { font: { color: isDark ? '#ffffff' : '#000000' } },
            margin: { l: 80, r: 80, t: 80, b: 60 }
        };
        
        Plotly.newPlot(container, traces, layout, chartConfig);
        
    } catch (error) {
        console.error('Performance radar error:', error);
        container.innerHTML = `<div class="loading">Error loading radar</div>`;
    }
}

function viewSolveDetails(sessionId) {
    switchTab('sessions');
    setTimeout(() => {
        showSolveDetails(sessionId);
    }, 100);
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
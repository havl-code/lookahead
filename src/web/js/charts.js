// charts.js - Chart visualization functions

async function loadCharts() {
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
    
    await addChartEventSelector();
    await loadSessionsForCharts();
    await renderAllCharts();
}

async function addChartEventSelector() {
    if (document.getElementById('chart-event-select')) return;
    
    const response = await fetch(`${API_BASE}/events`);
    const events = await response.json();
    
    const chartSection = document.querySelector('#charts');
    
    const selectorHTML = `
        <div class="chart-filters">
            <div style="display: flex; gap: 20px; align-items: flex-end; flex-wrap: wrap;">
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px;">Event:</label>
                    <select id="chart-event-select" class="chart-select">
                    </select>
                </div>
                <div>
                    <label style="display: block; margin-bottom: 8px; font-weight: 500; font-size: 14px;">Session:</label>
                    <select id="chart-session-select" class="chart-select">
                        <option value="all">All Sessions</option>
                    </select>
                </div>
                <button onclick="renderAllCharts()" class="btn-primary">
                    Update Charts
                </button>
            </div>
        </div>
    `;
    
    const h2 = chartSection.querySelector('h2');
    h2.insertAdjacentHTML('afterend', selectorHTML);
    
    const eventSelect = document.getElementById('chart-event-select');
    events.forEach(eventId => {
        const option = document.createElement('option');
        option.value = eventId;
        option.textContent = getEventName(eventId);
        option.selected = eventId === '333';
        eventSelect.appendChild(option);
    });
    
    eventSelect.addEventListener('change', () => loadSessionsForCharts());
}

async function loadSessionsForCharts() {
    const response = await fetch(`${API_BASE}/sessions`);
    const sessions = await response.json();
    
    const sessionSelect = document.getElementById('chart-session-select');
    if (!sessionSelect) return;
    
    const currentEvent = document.getElementById('chart-event-select').value;
    const currentSession = sessionSelect.value;
    
    sessionSelect.innerHTML = '<option value="all">All Sessions</option>';
    
    const filteredSessions = sessions.filter(s => s.event_id === currentEvent);
    
    filteredSessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = `${session.date} - ${session.solve_count} solves (Best: ${session.best_single}s)`;
        sessionSelect.appendChild(option);
    });
    
    if (currentSession !== 'all') {
        const optionExists = Array.from(sessionSelect.options).some(opt => opt.value === currentSession);
        if (optionExists) sessionSelect.value = currentSession;
    }
}

async function renderAllCharts() {
    await Promise.all([
        loadProgressChart(),
        loadDistributionChart(),
        loadRollingChart(),
        loadConsistencyChart()
    ]);
}

async function loadProgressChart() {
    const eventId = document.getElementById('chart-event-select')?.value || '333';
    const sessionId = document.getElementById('chart-session-select')?.value || 'all';
    
    const container = document.getElementById('progress-chart');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const url = sessionId === 'all' 
            ? `${API_BASE}/charts/progress?event_id=${eventId}`
            : `${API_BASE}/charts/session-progress?session_id=${sessionId}`;
            
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error || !data.data || data.data.length === 0) {
            container.innerHTML = `<div class="loading">${data.error || 'No data available'}</div>`;
            return;
        }
        
        const traces = [];
        const isSessionView = sessionId !== 'all';
        
        if (isSessionView) {
            // Single session view
            traces.push({
                x: data.data.map(d => d.solve_number),
                y: data.data.map(d => d.time),
                name: 'Time',
                type: 'scatter',
                mode: 'lines+markers',
                line: { color: COLORS.primary, width: 3 },
                marker: { size: 6, color: COLORS.primary }
            });
            
            if (data.data.some(d => d.mean)) {
                traces.push({
                    x: data.data.map(d => d.solve_number),
                    y: data.data.map(d => d.mean),
                    name: 'Running Mean',
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: COLORS.secondary, width: 2, dash: 'dash' }
                });
            }
            
            if (data.data.some(d => d.ao5)) {
                traces.push({
                    x: data.data.map(d => d.solve_number),
                    y: data.data.map(d => d.ao5),
                    name: 'Ao5',
                    type: 'scatter',
                    mode: 'lines',
                    line: { color: COLORS.tertiary, width: 2 }
                });
            }
        } else {
            // All sessions view
            traces.push({
                x: data.data.map((_, i) => i + 1),
                y: data.data.map(d => d.best),
                name: 'Best Single',
                type: 'scatter',
                mode: 'lines+markers',
                line: { color: COLORS.primary, width: 3 },
                marker: { size: 7, color: COLORS.primary }
            });
            
            traces.push({
                x: data.data.map((_, i) => i + 1),
                y: data.data.map(d => d.mean),
                name: 'Session Mean',
                type: 'scatter',
                mode: 'lines+markers',
                line: { color: COLORS.secondary, width: 3 },
                marker: { size: 7, color: COLORS.secondary }
            });
            
            if (data.data.some(d => d.ao5)) {
                traces.push({
                    x: data.data.map((_, i) => i + 1),
                    y: data.data.map(d => d.ao5),
                    name: 'Ao5',
                    type: 'scatter',
                    mode: 'lines+markers',
                    line: { color: COLORS.tertiary, width: 3 },
                    marker: { size: 7, color: COLORS.tertiary }
                });
            }
        }
        
        const layout = {
            ...chartLayout,
            title: {
                text: sessionId === 'all' ? 
                    `Progress Over Time - ${getEventName(eventId)}` : 
                    `Session Detail - ${getEventName(eventId)}`,
                font: { size: 16, color: '#000', family: 'Montserrat', weight: 600 }
            },
            xaxis: { 
                ...chartLayout.xaxis, 
                title: { text: sessionId === 'all' ? 'Session Number' : 'Solve Number', font: { size: 13 } },
                type: 'linear'
            },
            yaxis: {
                ...chartLayout.yaxis,
                title: { text: 'Time (seconds)', font: { size: 13 } }
            }
        };
        
        Plotly.newPlot(container, traces, layout, chartConfig);
        
    } catch (error) {
        console.error('Progress chart error:', error);
        container.innerHTML = `<div class="loading">Error loading chart</div>`;
    }
}

async function loadDistributionChart() {
    const eventId = document.getElementById('chart-event-select')?.value || '333';
    const sessionId = document.getElementById('chart-session-select')?.value || 'all';
    
    const container = document.getElementById('distribution-chart');
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const url = sessionId === 'all'
            ? `${API_BASE}/charts/distribution?event_id=${eventId}`
            : `${API_BASE}/charts/session-distribution?session_id=${sessionId}`;
            
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error || !data.times || data.times.length === 0) {
            container.innerHTML = `<div class="loading">${data.error || 'Need at least 5 solves'}</div>`;
            return;
        }
        
        const times = data.times;
        const mean = times.reduce((a, b) => a + b) / times.length;
        const sorted = [...times].sort((a, b) => a - b);
        const median = sorted[Math.floor(times.length / 2)];
        const stdDev = Math.sqrt(times.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / times.length);
        
        const trace = {
            x: times,
            type: 'histogram',
            nbinsx: Math.min(30, Math.max(10, Math.floor(times.length / 5))),
            marker: {
                color: COLORS.primary,
                line: { color: '#fff', width: 1 }
            },
            name: 'Times',
            opacity: 0.85
        };
        
        const layout = {
            ...chartLayout,
            title: {
                text: `Time Distribution - ${getEventName(eventId)}<br><sub style="font-size: 12px;">Mean: ${mean.toFixed(2)}s | Median: ${median.toFixed(2)}s | Std Dev: ${stdDev.toFixed(2)}s</sub>`,
                font: { size: 16, color: '#000', family: 'Montserrat', weight: 600 }
            },
            xaxis: { 
                ...chartLayout.xaxis, 
                title: { text: 'Time (seconds)', font: { size: 13 } },
                type: 'linear'
            },
            yaxis: { 
                ...chartLayout.yaxis, 
                title: { text: 'Frequency', font: { size: 13 } }
            },
            shapes: [{
                type: 'line',
                x0: median, x1: median,
                y0: 0, y1: 1,
                yref: 'paper',
                line: { color: COLORS.danger, width: 2, dash: 'dash' }
            }],
            annotations: [{
                x: median,
                y: 1,
                yref: 'paper',
                text: `Median: ${median.toFixed(2)}s`,
                showarrow: true,
                arrowhead: 2,
                ax: 40,
                ay: -40,
                font: { size: 11, color: COLORS.danger }
            }]
        };
        
        Plotly.newPlot(container, [trace], layout, chartConfig);
        
    } catch (error) {
        console.error('Distribution chart error:', error);
        container.innerHTML = `<div class="loading">Error loading chart</div>`;
    }
}

async function loadRollingChart() {
    const eventId = document.getElementById('chart-event-select')?.value || '333';
    const sessionId = document.getElementById('chart-session-select')?.value || 'all';
    
    const container = document.getElementById('breakdown-chart');
    if (!container) return;
    
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const url = sessionId === 'all'
            ? `${API_BASE}/charts/rolling-average?event_id=${eventId}`
            : `${API_BASE}/charts/session-rolling?session_id=${sessionId}`;
            
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error || !data.times || data.times.length === 0) {
            container.innerHTML = `<div class="loading">${data.error || 'Need at least 12 solves'}</div>`;
            return;
        }
        
        const times = data.times;
        const rolling5 = [];
        const rolling12 = [];
        
        for (let i = 0; i < times.length; i++) {
            if (i >= 4) {
                const slice5 = times.slice(i - 4, i + 1);
                rolling5.push(slice5.reduce((a, b) => a + b) / 5);
            } else {
                rolling5.push(null);
            }
            
            if (i >= 11) {
                const slice12 = times.slice(i - 11, i + 1);
                rolling12.push(slice12.reduce((a, b) => a + b) / 12);
            } else {
                rolling12.push(null);
            }
        }
        
        const traces = [
            {
                x: times.map((_, i) => i + 1),
                y: times,
                name: 'Individual Times',
                type: 'scatter',
                mode: 'markers',
                marker: { color: COLORS.gray, size: 4, opacity: 0.3 }
            },
            {
                x: times.map((_, i) => i + 1),
                y: rolling5,
                name: 'Rolling Ao5',
                type: 'scatter',
                mode: 'lines',
                line: { color: COLORS.secondary, width: 3 }
            },
            {
                x: times.map((_, i) => i + 1),
                y: rolling12,
                name: 'Rolling Ao12',
                type: 'scatter',
                mode: 'lines',
                line: { color: COLORS.quaternary, width: 3 }
            }
        ];
        
        const layout = {
            ...chartLayout,
            title: {
                text: `Rolling Averages - ${getEventName(eventId)}`,
                font: { size: 16, color: '#000', family: 'Montserrat', weight: 600 }
            },
            xaxis: { 
                ...chartLayout.xaxis, 
                title: { text: 'Solve Number', font: { size: 13 } },
                type: 'linear'
            },
            yaxis: {
                ...chartLayout.yaxis,
                title: { text: 'Time (seconds)', font: { size: 13 } }
            }
        };
        
        Plotly.newPlot(container, traces, layout, chartConfig);
        
    } catch (error) {
        console.error('Rolling chart error:', error);
        container.innerHTML = `<div class="loading">Error loading chart</div>`;
    }
}

async function loadConsistencyChart() {
    const eventId = document.getElementById('chart-event-select')?.value || '333';
    const sessionId = document.getElementById('chart-session-select')?.value || 'all';
    
    const container = document.getElementById('consistency-chart');
    if (!container) return;
    
    if (sessionId !== 'all') {
        container.innerHTML = '<div class="loading">Consistency chart only available for all sessions view</div>';
        return;
    }
    
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    try {
        const response = await fetch(`${API_BASE}/charts/consistency?event_id=${eventId}`);
        const data = await response.json();
        
        if (data.error || !data.sessions || data.sessions.length === 0) {
            container.innerHTML = `<div class="loading">${data.error || 'Need at least 2 sessions'}</div>`;
            return;
        }
        
        const traces = data.sessions.map((session, idx) => ({
            y: session.times,
            type: 'box',
            name: session.date,
            marker: { color: [COLORS.primary, COLORS.secondary, COLORS.tertiary, COLORS.quaternary, COLORS.info][idx % 5] },
            boxmean: 'sd'
        }));
        
        const layout = {
            ...chartLayout,
            title: {
                text: `Consistency Across Sessions - ${getEventName(eventId)}`,
                font: { size: 16, color: '#000', family: 'Montserrat', weight: 600 }
            },
            yaxis: { 
                ...chartLayout.yaxis, 
                title: { text: 'Time (seconds)', font: { size: 13 } }
            },
            showlegend: false
        };
        
        Plotly.newPlot(container, traces, layout, chartConfig);
        
    } catch (error) {
        console.error('Consistency chart error:', error);
        container.innerHTML = `<div class="loading">Error loading chart</div>`;
    }
}
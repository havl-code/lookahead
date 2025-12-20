// dashboard.js - Dashboard tab functionality

async function loadDashboard() {
    await loadAvailableEvents();
    await loadStats();
    await loadRecentSessions();
}

async function loadAvailableEvents() {
    try {
        const response = await fetch(`${API_BASE}/events`);
        const events = await response.json();
        
        const select = document.getElementById('event-select');
        const allOption = select.querySelector('option[value="all"]');
        select.innerHTML = '';
        select.appendChild(allOption);
        
        events.forEach(eventId => {
            const option = document.createElement('option');
            option.value = eventId;
            option.textContent = getEventName(eventId);
            if (eventId === AppState.currentEvent) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Failed to load events:', error);
    }
}

function changeEvent() {
    AppState.currentEvent = document.getElementById('event-select').value;
    loadStats();
}

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats?event_id=${AppState.currentEvent}`);
        const data = await response.json();
        
        if (data.error) {
            console.error('Error loading stats:', data.error);
            return;
        }
        
        document.getElementById('stat-pb').textContent = 
            data.pb ? `${data.pb}s` : 'No data';
        document.getElementById('stat-avg').textContent = 
            data.average ? `${data.average}s` : 'No data';
        document.getElementById('stat-solves').textContent = 
            data.total_solves || '0';
        document.getElementById('stat-sessions').textContent = 
            data.total_sessions || '0';
        document.getElementById('stat-rank').textContent = 
            data.wca_rank && data.wca_rank !== 'N/A' ? `~${data.wca_rank}` : 'No data';
        document.getElementById('stat-percentile').textContent = 
            data.wca_percentile && data.wca_percentile !== 'N/A' ? `Top ${data.wca_percentile}%` : 'No data';
        
        if (data.wca_percentile && data.wca_percentile !== 'N/A') {
            const noteElement = document.querySelector('#stat-percentile').nextElementSibling.nextElementSibling;
            noteElement.textContent = `Top ${data.wca_percentile}% worldwide`;
        }
        
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

async function loadRecentSessions() {
    try {
        const response = await fetch(`${API_BASE}/sessions`);
        const sessions = await response.json();
        
        if (sessions.error) return;
        
        const tbody = document.getElementById('recent-sessions-tbody');
        
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">No sessions yet.</td></tr>';
            return;
        }
        
        const recentSessions = sessions.slice(0, 5);
        
        tbody.innerHTML = recentSessions.map(session => `
            <tr>
                <td>${session.date || 'N/A'}</td>
                <td>${getEventName(session.event_id) || 'N/A'}</td>
                <td>${session.solve_count || 0}</td>
                <td>${formatTime(session.best_single)}</td>
                <td>${formatTime(session.session_mean)}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load recent sessions:', error);
    }
}
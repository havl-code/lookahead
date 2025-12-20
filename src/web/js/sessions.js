// sessions.js - Session management with filters and solve management

async function loadSessionsTab() {
    try {
        const response = await fetch(`${API_BASE}/sessions`);
        AppState.allSessions = await response.json();
        
        if (AppState.allSessions.error) {
            console.error('Error loading sessions:', AppState.allSessions.error);
            return;
        }
        
        addSessionFilters();
        displayFilteredSessions(AppState.allSessions);
        await loadCubesForDropdown();
    } catch (error) {
        console.error('Failed to load sessions:', error);
    }
}

function addSessionFilters() {
    if (document.getElementById('session-filters')) return;
    
    const sessionSection = document.querySelector('#tab-sessions .sessions-section');
    const sectionHeader = sessionSection.querySelector('.section-header');
    
    const filtersHTML = `
        <div id="session-filters" class="filters-container">
            <div class="filters-grid">
                <div class="form-group">
                    <label>Event:</label>
                    <select id="filter-event" onchange="applySessionFilters()">
                        <option value="">All Events</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Date From:</label>
                    <input type="date" id="filter-date-from" onchange="applySessionFilters()">
                </div>
                <div class="form-group">
                    <label>Date To:</label>
                    <input type="date" id="filter-date-to" onchange="applySessionFilters()">
                </div>
                <div class="form-group">
                    <label>Min Best (s):</label>
                    <input type="number" step="0.1" id="filter-min-time" onchange="applySessionFilters()" placeholder="10">
                </div>
                <div class="form-group">
                    <label>Max Best (s):</label>
                    <input type="number" step="0.1" id="filter-max-time" onchange="applySessionFilters()" placeholder="30">
                </div>
                <div class="form-group">
                    <label>Sort By:</label>
                    <select id="filter-sort" onchange="applySessionFilters()">
                        <option value="date-desc">Date (Newest First)</option>
                        <option value="date-asc">Date (Oldest First)</option>
                        <option value="best-asc">Best Time (Fastest First)</option>
                        <option value="best-desc">Best Time (Slowest First)</option>
                        <option value="solves-desc">Most Solves First</option>
                        <option value="solves-asc">Least Solves First</option>
                    </select>
                </div>
            </div>
            <button class="btn-secondary" onclick="clearSessionFilters()" style="margin-top: 16px;">Clear All Filters</button>
        </div>
    `;
    
    sectionHeader.insertAdjacentHTML('afterend', filtersHTML);
    
    // Populate event filter
    const eventFilter = document.getElementById('filter-event');
    const uniqueEvents = [...new Set(AppState.allSessions.map(s => s.event_id))];
    uniqueEvents.forEach(eventId => {
        const option = document.createElement('option');
        option.value = eventId;
        option.textContent = getEventName(eventId);
        eventFilter.appendChild(option);
    });
}

function applySessionFilters() {
    const eventFilter = document.getElementById('filter-event').value;
    const dateFrom = document.getElementById('filter-date-from').value;
    const dateTo = document.getElementById('filter-date-to').value;
    const minTime = parseFloat(document.getElementById('filter-min-time').value);
    const maxTime = parseFloat(document.getElementById('filter-max-time').value);
    const sortBy = document.getElementById('filter-sort').value;
    
    let filtered = [...AppState.allSessions];
    
    // Apply filters
    if (eventFilter) {
        filtered = filtered.filter(s => s.event_id === eventFilter);
    }
    
    if (dateFrom) {
        filtered = filtered.filter(s => s.date >= dateFrom);
    }
    
    if (dateTo) {
        filtered = filtered.filter(s => s.date <= dateTo);
    }
    
    if (!isNaN(minTime)) {
        filtered = filtered.filter(s => s.best_single && s.best_single >= minTime);
    }
    
    if (!isNaN(maxTime)) {
        filtered = filtered.filter(s => s.best_single && s.best_single <= maxTime);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
        switch(sortBy) {
            case 'date-desc':
                return (b.date || '').localeCompare(a.date || '');
            case 'date-asc':
                return (a.date || '').localeCompare(b.date || '');
            case 'best-asc':
                return (a.best_single || 999) - (b.best_single || 999);
            case 'best-desc':
                return (b.best_single || 0) - (a.best_single || 0);
            case 'solves-desc':
                return (b.solve_count || 0) - (a.solve_count || 0);
            case 'solves-asc':
                return (a.solve_count || 0) - (b.solve_count || 0);
            default:
                return 0;
        }
    });
    
    displayFilteredSessions(filtered);
}

function clearSessionFilters() {
    document.getElementById('filter-event').value = '';
    document.getElementById('filter-date-from').value = '';
    document.getElementById('filter-date-to').value = '';
    document.getElementById('filter-min-time').value = '';
    document.getElementById('filter-max-time').value = '';
    document.getElementById('filter-sort').value = 'date-desc';
    displayFilteredSessions(AppState.allSessions);
}

function displayFilteredSessions(sessions) {
    const tbody = document.getElementById('sessions-tbody');
    
    if (sessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No sessions match your filters.</td></tr>';
        return;
    }
    
    tbody.innerHTML = sessions.map(session => `
        <tr>
            <td>${session.date || 'N/A'}</td>
            <td>${getEventName(session.event_id) || 'N/A'}</td>
            <td>${session.solve_count || 0}</td>
            <td>${formatTime(session.best_single)}</td>
            <td>${formatTime(session.session_mean)}</td>
            <td>${formatTime(session.ao5)}</td>
            <td>${formatTime(session.ao12)}</td>
            <td>
                <button class="action-btn" onclick="viewSessionSolves(${session.id})">View</button>
                <button class="action-btn danger" onclick="deleteSession(${session.id})">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function deleteSession(sessionId) {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    
    try {
        const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Session deleted successfully');
            loadSessionsTab();
            loadStats();
        }
    } catch (error) {
        showError(error.message);
    }
}

function showAddSessionForm() {
    document.getElementById('add-session-form').style.display = 'block';
}

function hideAddSessionForm() {
    document.getElementById('add-session-form').style.display = 'none';
}

async function addSession(event) {
    event.preventDefault();
    
    const eventId = document.getElementById('new-event-id').value;
    const cubeId = document.getElementById('new-cube-id').value || null;
    const notes = document.getElementById('new-session-notes').value;
    
    try {
        const response = await fetch(`${API_BASE}/sessions/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: eventId,
                cube_id: cubeId,
                notes: notes
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Session created successfully');
            hideAddSessionForm();
            loadSessionsTab();
            loadStats();
            document.getElementById('new-event-id').value = '333';
            document.getElementById('new-cube-id').value = '';
            document.getElementById('new-session-notes').value = '';
        }
    } catch (error) {
        showError(error.message);
    }
}

// ============================================
// SOLVE MANAGEMENT
// ============================================

async function viewSessionSolves(sessionId) {
    AppState.currentSessionId = sessionId;
    document.getElementById('current-session-id').value = sessionId;
    document.getElementById('solve-modal-title').textContent = `Session ${sessionId} - Solves`;
    
    try {
        const response = await fetch(`${API_BASE}/sessions/${sessionId}/solves`);
        const solves = await response.json();
        
        const tbody = document.getElementById('solves-tbody');
        
        if (solves.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">No solves yet. Add some below!</td></tr>';
        } else {
            tbody.innerHTML = solves.map(solve => `
                <tr>
                    <td>${solve.solve_number}</td>
                    <td>${formatTime(solve.time_seconds)}</td>
                    <td>${solve.penalty || '-'}</td>
                    <td style="font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">${solve.scramble || '-'}</td>
                    <td>
                        <button class="action-btn danger" onclick="deleteSolve(${solve.id})">Delete</button>
                    </td>
                </tr>
            `).join('');
        }
        
        document.getElementById('solve-details-modal').style.display = 'flex';
    } catch (error) {
        showError('Error loading solves: ' + error.message);
    }
}

function closeSolveModal() {
    document.getElementById('solve-details-modal').style.display = 'none';
    document.getElementById('add-solve-form').reset();
}

async function addSolveToSession(event) {
    event.preventDefault();
    
    const sessionId = document.getElementById('current-session-id').value;
    const timeSeconds = parseFloat(document.getElementById('new-solve-time').value);
    const penalty = document.getElementById('new-solve-penalty').value || null;
    const scramble = document.getElementById('new-solve-scramble').value;
    
    try {
        const response = await fetch(`${API_BASE}/sessions/${sessionId}/solves/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                time_seconds: timeSeconds,
                penalty: penalty,
                scramble: scramble
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            viewSessionSolves(sessionId);
            document.getElementById('new-solve-time').value = '';
            document.getElementById('new-solve-penalty').value = '';
            document.getElementById('new-solve-scramble').value = '';
            loadStats();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function deleteSolve(solveId) {
    if (!confirm('Delete this solve?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/solves/${solveId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.error) {
            showError(result.error);
        } else {
            viewSessionSolves(AppState.currentSessionId);
            loadStats();
        }
    } catch (error) {
        showError(error.message);
    }
}
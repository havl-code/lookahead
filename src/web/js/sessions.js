// sessions.js - Session management with filters and solve management

// Global variables for sorting
let currentSolves = [];
let currentSortColumn = 'number';
let currentSortDirection = 'asc';

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
                    <label>Sort By:</label>
                    <select id="filter-sort" onchange="applySessionFilters()">
                        <option value="date-desc">Date Imported (Newest First)</option>
                        <option value="date-asc">Date Imported (Oldest First)</option>
                        <option value="best-asc">Best Time (Fastest First)</option>
                        <option value="best-desc">Best Time (Slowest First)</option>
                        <option value="solves-desc">Most Solves First</option>
                        <option value="solves-asc">Least Solves First</option>
                    </select>
                </div>
            </div>
            <button class="btn-secondary" onclick="clearSessionFilters()" style="margin-top: 16px;">Clear Filters</button>
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
    const sortBy = document.getElementById('filter-sort').value;
    
    let filtered = [...AppState.allSessions];
    
    // Apply filters
    if (eventFilter) {
        filtered = filtered.filter(s => s.event_id === eventFilter);
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
// SOLVE MANAGEMENT WITH SORTING
// ============================================

async function viewSessionSolves(sessionId) {
    AppState.currentSessionId = sessionId;
    document.getElementById('current-session-id').value = sessionId;
    document.getElementById('solve-modal-title').textContent = `Session ${sessionId} - Solves`;
    
    try {
        const response = await fetch(`${API_BASE}/sessions/${sessionId}/solves`);
        const solves = await response.json();
        
        // Store solves globally and reset sort
        currentSolves = solves.map(solve => ({
            id: solve.id,
            solve_number: solve.solve_number,
            time: solve.time_seconds,
            penalty: solve.penalty || '',
            scramble: solve.scramble || ''
        }));
        
        currentSortColumn = 'number';
        currentSortDirection = 'asc';
        
        renderSolvesTable();
        
        document.getElementById('solve-details-modal').style.display = 'flex';
    } catch (error) {
        showError('Error loading solves: ' + error.message);
    }
}

function renderSolvesTable() {
    const tbody = document.getElementById('solves-tbody');
    
    if (currentSolves.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No solves yet. Add some below!</td></tr>';
        return;
    }
    
    tbody.innerHTML = currentSolves.map(solve => `
        <tr>
            <td>${solve.solve_number}</td>
            <td>${solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.time)}</td>
            <td>${solve.penalty || '-'}</td>
            <td class="scramble-cell">${solve.scramble || '-'}</td>
            <td>
                <button class="action-btn danger" onclick="deleteSolve(${solve.id})">Delete</button>
            </td>
        </tr>
    `).join('');
    
    updateSortArrows();
}

function sortSolves(column) {
    // Toggle direction if same column, otherwise default to ascending
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    
    // Sort the solves array
    currentSolves.sort((a, b) => {
        let valA, valB;
        
        switch(column) {
            case 'number':
                valA = a.solve_number;
                valB = b.solve_number;
                break;
            case 'time':
                // Handle DNF as infinitely large
                valA = a.penalty === 'DNF' ? Infinity : parseFloat(a.time);
                valB = b.penalty === 'DNF' ? Infinity : parseFloat(b.time);
                break;
            case 'penalty':
                // Sort order: None < +2 < DNF
                const penaltyOrder = { '': 0, '+2': 1, 'DNF': 2 };
                valA = penaltyOrder[a.penalty || ''];
                valB = penaltyOrder[b.penalty || ''];
                break;
            default:
                return 0;
        }
        
        if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    // Re-render the table
    renderSolvesTable();
}

function updateSortArrows() {
    // Clear all arrows
    document.querySelectorAll('.sort-arrow').forEach(arrow => {
        arrow.textContent = '';
        arrow.className = 'sort-arrow';
    });
    
    // Add arrow to current column
    const headers = document.querySelectorAll('.solves-table th.sortable');
    headers.forEach(header => {
        const onclickAttr = header.getAttribute('onclick');
        if (onclickAttr) {
            const match = onclickAttr.match(/sortSolves\('(\w+)'\)/);
            if (match && match[1] === currentSortColumn) {
                const arrow = header.querySelector('.sort-arrow');
                if (arrow) {
                    arrow.textContent = currentSortDirection === 'asc' ? '▲' : '▼';
                    arrow.className = `sort-arrow ${currentSortDirection}`;
                }
            }
        }
    });
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
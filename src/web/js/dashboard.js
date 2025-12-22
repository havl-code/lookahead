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
        
        // Make PB clickable (no underline)
        const pbElement = document.getElementById('stat-pb');
        pbElement.style.cursor = data.pb ? 'pointer' : 'default';
        pbElement.textContent = data.pb ? `${data.pb}s` : 'No data';
        
        if (data.pb) {
            pbElement.onclick = () => showPBDetails(data.pb, AppState.currentEvent);
        } else {
            pbElement.onclick = null;
        }
        
        document.getElementById('stat-avg').textContent = 
            data.average ? `${data.average}s` : 'No data';
        document.getElementById('stat-solves').textContent = 
            data.total_solves || '0';
        
        // Make Total Sessions clickable
        const sessionsElement = document.getElementById('stat-sessions');
        sessionsElement.style.cursor = data.total_sessions > 0 ? 'pointer' : 'default';
        sessionsElement.textContent = data.total_sessions || '0';
        
        if (data.total_sessions > 0) {
            sessionsElement.onclick = () => jumpToSessionsTab();
        } else {
            sessionsElement.onclick = null;
        }
        
        // Make Total Cubes clickable
        const cubesElement = document.getElementById('stat-cubes');
        cubesElement.style.cursor = data.total_cubes > 0 ? 'pointer' : 'default';
        cubesElement.textContent = data.total_cubes || '0';
        
        if (data.total_cubes > 0) {
            cubesElement.onclick = () => jumpToCubesTab();
        } else {
            cubesElement.onclick = null;
        }
        
        document.getElementById('stat-rank').textContent = 
            data.wca_rank && data.wca_rank !== 'N/A' ? `~${data.wca_rank}` : 'No data';
        document.getElementById('stat-percentile').textContent = 
            data.wca_percentile && data.wca_percentile !== 'N/A' ? `Top ${data.wca_percentile}%` : 'No data';
        
        // Update stat notes to clarify single vs average
        const rankNote = document.querySelector('#stat-rank').nextElementSibling.nextElementSibling;
        rankNote.textContent = 'based on single best';
        
        const percentileNote = document.querySelector('#stat-percentile').nextElementSibling.nextElementSibling;
        percentileNote.textContent = 'based on single best';
        
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

function jumpToSessionsTab() {
    // Switch to sessions tab
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.getElementById('tab-sessions').classList.add('active');
    const sessionTab = Array.from(document.querySelectorAll('.tab')).find(t => t.textContent === 'Sessions');
    if (sessionTab) sessionTab.classList.add('active');
    
    // Load sessions tab if not loaded
    if (!AppState.allSessions || AppState.allSessions.length === 0) {
        loadSessionsTab();
    }
}

function jumpToCubesTab() {
    // Switch to cubes tab
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.getElementById('tab-cubes').classList.add('active');
    const cubesTab = Array.from(document.querySelectorAll('.tab')).find(t => t.textContent === 'Cubes');
    if (cubesTab) cubesTab.classList.add('active');
    
    // Load cubes tab if not loaded
    if (!AppState.allCubes || AppState.allCubes.length === 0) {
        loadCubesTab();
    }
}

async function showPBDetails(pbTime, eventId) {
    try {
        // Fetch the solve that matches the PB
        const response = await fetch(`${API_BASE}/pb-details?event_id=${eventId}&pb_time=${pbTime}`);
        
        if (!response.ok) {
            showError('Could not fetch PB details');
            return;
        }
        
        const data = await response.json();
        
        if (data.error) {
            showError('Could not fetch PB details');
            return;
        }
        
        // Create modal HTML (without session ID)
        const modalHTML = `
            <div id="pb-modal" class="modal" style="display: flex;">
                <div class="modal-content" style="max-width: 600px;">
                    <div class="modal-header">
                        <h3>Personal Best Details</h3>
                        <button class="modal-close" onclick="closePBModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div style="text-align: center; margin-bottom: 24px;">
                            <div style="font-size: 48px; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">
                                ${pbTime}s
                            </div>
                            <div style="font-size: 16px; color: var(--text-secondary);">
                                ${getEventName(eventId)}
                            </div>
                        </div>
                        
                        <div style="background: var(--bg-secondary); padding: 20px; border-radius: 8px; margin-bottom: 16px;">
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">DATE</div>
                            <div style="font-size: 18px; font-weight: 500;">${data.date || 'N/A'}</div>
                        </div>
                        
                        <div style="background: var(--bg-secondary); padding: 20px; border-radius: 8px;">
                            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 8px;">SCRAMBLE</div>
                            <div style="font-family: monospace; font-size: 13px; line-height: 1.6; word-break: break-word;">
                                ${data.scramble || 'No scramble recorded'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove existing modal if any
        const existingModal = document.getElementById('pb-modal');
        if (existingModal) existingModal.remove();
        
        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
    } catch (error) {
        console.error('Error showing PB details:', error);
        showError('Failed to load PB details');
    }
}

function closePBModal() {
    const modal = document.getElementById('pb-modal');
    if (modal) modal.remove();
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
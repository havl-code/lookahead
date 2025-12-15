// API Base URL
const API_BASE = 'http://localhost:5000/api';

// Global variables
let selectedFile = null;
let currentSessionId = null;

// Load data on page load
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    setupFileUpload();
});

// Tab Switching
function switchTab(tabName) {
    // Hide all tab contents
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`tab-${tabName}`).classList.add('active');
    event.target.classList.add('active');
    
    // Load data for the tab
    if (tabName === 'sessions') {
        loadSessionsTab();
    } else if (tabName === 'cubes') {
        loadCubesTab();
    } else if (tabName === 'charts') {
        loadCharts();
    }
}

// Load Dashboard
async function loadDashboard() {
    await loadStats();
    await loadRecentSessions();
}

// Load Statistics
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/stats`);
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
            data.wca_rank ? `~${data.wca_rank}` : 'No data';
        document.getElementById('stat-percentile').textContent = 
            data.wca_percentile ? `Top ${data.wca_percentile}%` : 'No data';
        
        // Update the note text
        if (data.wca_percentile) {
            const noteElement = document.querySelector('#stat-percentile').nextElementSibling.nextElementSibling;
            noteElement.textContent = `Top ${data.wca_percentile}% worldwide`;
        }
        
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load Recent Sessions (for dashboard)
async function loadRecentSessions() {
    try {
        const response = await fetch(`${API_BASE}/sessions`);
        const sessions = await response.json();
        
        if (sessions.error) {
            return;
        }
        
        const tbody = document.getElementById('recent-sessions-tbody');
        
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="loading">No sessions yet.</td></tr>';
            return;
        }
        
        // Show only last 5 sessions
        const recentSessions = sessions.slice(0, 5);
        
        tbody.innerHTML = recentSessions.map(session => `
            <tr>
                <td>${session.date || 'N/A'}</td>
                <td>${session.event_id || 'N/A'}</td>
                <td>${session.solve_count || 0}</td>
                <td>${session.best_single ? session.best_single + 's' : 'N/A'}</td>
                <td>${session.session_mean ? session.session_mean + 's' : 'N/A'}</td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load recent sessions:', error);
    }
}

// Load Sessions Tab
async function loadSessionsTab() {
    try {
        const response = await fetch(`${API_BASE}/sessions`);
        const sessions = await response.json();
        
        if (sessions.error) {
            console.error('Error loading sessions:', sessions.error);
            return;
        }
        
        const tbody = document.getElementById('sessions-tbody');
        
        if (sessions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading">No sessions yet. Import your CSTimer data to get started!</td></tr>';
            return;
        }
        
        tbody.innerHTML = sessions.map(session => `
            <tr>
                <td>${session.id || 'N/A'}</td>
                <td>${session.date || 'N/A'}</td>
                <td>${session.event_id || 'N/A'}</td>
                <td>${session.solve_count || 0}</td>
                <td>${session.best_single ? session.best_single + 's' : 'N/A'}</td>
                <td>${session.session_mean ? session.session_mean + 's' : 'N/A'}</td>
                <td>${session.ao5 ? session.ao5 + 's' : 'N/A'}</td>
                <td>${session.ao12 ? session.ao12 + 's' : 'N/A'}</td>
                <td>
                    <button class="action-btn" onclick="viewSessionSolves(${session.id})">View Solves</button>
                    <button class="action-btn danger" onclick="deleteSession(${session.id})">Delete</button>
                </td>
            </tr>
        `).join('');
        
        // Load cubes for dropdown
        await loadCubesForDropdown();
        
    } catch (error) {
        console.error('Failed to load sessions:', error);
    }
}

// Delete Session
async function deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session? This cannot be undone.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            alert('Session deleted successfully');
            loadSessionsTab();
            loadStats();
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Show/Hide Add Session Form
function showAddSessionForm() {
    document.getElementById('add-session-form').style.display = 'block';
}

function hideAddSessionForm() {
    document.getElementById('add-session-form').style.display = 'none';
}

// Add Session
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
            alert(`Error: ${result.error}`);
        } else {
            alert('Session created successfully');
            hideAddSessionForm();
            loadSessionsTab();
            loadStats();
            document.getElementById('new-event-id').value = '333';
            document.getElementById('new-cube-id').value = '';
            document.getElementById('new-session-notes').value = '';
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Load Cubes Tab
async function loadCubesTab() {
    try {
        const response = await fetch(`${API_BASE}/cubes`);
        const cubes = await response.json();
        
        if (cubes.error) {
            console.error('Error loading cubes:', cubes.error);
            return;
        }
        
        const tbody = document.getElementById('cubes-tbody');
        
        if (cubes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No cubes in inventory yet.</td></tr>';
            return;
        }
        
        tbody.innerHTML = cubes.map(cube => `
            <tr>
                <td>${cube.id || 'N/A'}</td>
                <td>${cube.name || 'N/A'}</td>
                <td>${cube.brand || 'N/A'}</td>
                <td>${cube.model || 'N/A'}</td>
                <td>${cube.purchase_date || 'N/A'}</td>
                <td>${cube.is_active ? 'Active' : 'Inactive'}</td>
                <td>
                    <button class="action-btn danger" onclick="deleteCube(${cube.id})">Deactivate</button>
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('Failed to load cubes:', error);
    }
}

// Load Cubes for Dropdown
async function loadCubesForDropdown() {
    try {
        const response = await fetch(`${API_BASE}/cubes`);
        const cubes = await response.json();
        
        const select = document.getElementById('new-cube-id');
        select.innerHTML = '<option value="">None</option>';
        
        cubes.forEach(cube => {
            if (cube.is_active) {
                const option = document.createElement('option');
                option.value = cube.id;
                option.textContent = `${cube.name} (${cube.brand || 'No brand'})`;
                select.appendChild(option);
            }
        });
    } catch (error) {
        console.error('Failed to load cubes for dropdown:', error);
    }
}

// Delete Cube
async function deleteCube(cubeId) {
    if (!confirm('Are you sure you want to deactivate this cube?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/cubes/${cubeId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            alert('Cube deactivated successfully');
            loadCubesTab();
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Show/Hide Add Cube Form
function showAddCubeForm() {
    document.getElementById('add-cube-form').style.display = 'block';
}

function hideAddCubeForm() {
    document.getElementById('add-cube-form').style.display = 'none';
}

// Add Cube
async function addCube(event) {
    event.preventDefault();
    
    const name = document.getElementById('new-cube-name').value;
    const brand = document.getElementById('new-cube-brand').value;
    const model = document.getElementById('new-cube-model').value;
    const purchaseDate = document.getElementById('new-cube-date').value;
    const notes = document.getElementById('new-cube-notes').value;
    
    try {
        const response = await fetch(`${API_BASE}/cubes/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                brand: brand,
                model: model,
                purchase_date: purchaseDate,
                notes: notes
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            alert('Cube added successfully');
            hideAddCubeForm();
            loadCubesTab();
            document.getElementById('new-cube-name').value = '';
            document.getElementById('new-cube-brand').value = '';
            document.getElementById('new-cube-model').value = '';
            document.getElementById('new-cube-date').value = '';
            document.getElementById('new-cube-notes').value = '';
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Load Charts
async function loadCharts() {
    console.log('Loading charts...');
    
    // Load progress chart
    try {
        const response = await fetch(`${API_BASE}/charts/progress`);
        const data = await response.json();
        
        const progressContainer = document.getElementById('progress-chart');
        
        if (data.error) {
            progressContainer.innerHTML = `<div class="loading">${data.error}</div>`;
            console.error('Progress chart error:', data.error);
        } else if (data.html) {
            progressContainer.innerHTML = data.html;
            console.log('Progress chart loaded');
        } else {
            progressContainer.innerHTML = '<div class="loading">No chart data</div>';
        }
    } catch (error) {
        console.error('Failed to load progress chart:', error);
        document.getElementById('progress-chart').innerHTML = 
            `<div class="loading">Error loading chart: ${error.message}</div>`;
    }
    
    // Load distribution chart
    try {
        const response = await fetch(`${API_BASE}/charts/distribution`);
        const data = await response.json();
        
        const distContainer = document.getElementById('distribution-chart');
        
        if (data.error) {
            distContainer.innerHTML = `<div class="loading">${data.error}</div>`;
            console.error('Distribution chart error:', data.error);
        } else if (data.html) {
            distContainer.innerHTML = data.html;
            console.log('Distribution chart loaded');
        } else {
            distContainer.innerHTML = '<div class="loading">No chart data</div>';
        }
    } catch (error) {
        console.error('Failed to load distribution chart:', error);
        document.getElementById('distribution-chart').innerHTML = 
            `<div class="loading">Error loading chart: ${error.message}</div>`;
    }
}

// View Session Solves
async function viewSessionSolves(sessionId) {
    currentSessionId = sessionId;
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
                    <td>${solve.time_seconds}s</td>
                    <td>${solve.penalty || '-'}</td>
                    <td>${solve.scramble || '-'}</td>
                    <td>
                        <button class="action-btn danger" onclick="deleteSolve(${solve.id})">Delete</button>
                    </td>
                </tr>
            `).join('');
        }
        
        document.getElementById('solve-details-modal').style.display = 'flex';
    } catch (error) {
        alert(`Error loading solves: ${error.message}`);
    }
}

// Close Solve Modal
function closeSolveModal() {
    document.getElementById('solve-details-modal').style.display = 'none';
    document.getElementById('add-solve-form').reset();
}

// Add Solve to Session
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
            alert(`Error: ${result.error}`);
        } else {
            viewSessionSolves(sessionId);
            document.getElementById('new-solve-time').value = '';
            document.getElementById('new-solve-penalty').value = '';
            document.getElementById('new-solve-scramble').value = '';
            loadStats();
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Delete Solve
async function deleteSolve(solveId) {
    if (!confirm('Delete this solve?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/solves/${solveId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.error) {
            alert(`Error: ${result.error}`);
        } else {
            viewSessionSolves(currentSessionId);
            loadStats();
        }
    } catch (error) {
        alert(`Error: ${error.message}`);
    }
}

// Setup File Upload with Preview
function setupFileUpload() {
    const fileInput = document.getElementById('file-input');
    const fileNameSpan = document.getElementById('file-name');
    const previewBtn = document.getElementById('preview-btn');
    const statusDiv = document.getElementById('import-status');
    
    // Check if elements exist (they're only on Import tab)
    if (!previewBtn) {
        console.log('Preview button not found - Import tab not loaded yet');
        return;
    }
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            selectedFile = file;
            fileNameSpan.textContent = file.name;
            previewBtn.style.display = 'inline-block';
            statusDiv.textContent = '';
            statusDiv.className = '';
            const sessionSelection = document.getElementById('session-selection');
            if (sessionSelection) {
                sessionSelection.style.display = 'none';
            }
        }
    });
    
    previewBtn.addEventListener('click', previewSessions);
}

// Preview Sessions
async function previewSessions() {
    if (!selectedFile) return;
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    document.getElementById('import-status').textContent = 'Loading sessions...';
    
    try {
        const response = await fetch(`${API_BASE}/import/preview`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.error) {
            document.getElementById('import-status').textContent = `Error: ${result.error}`;
            document.getElementById('import-status').className = 'error';
            return;
        }
        
        const checkboxesDiv = document.getElementById('session-checkboxes');
        checkboxesDiv.innerHTML = result.sessions.map(session => `
            <div class="session-checkbox">
                <input type="checkbox" id="session-${session.key}" value="${session.key}" checked>
                <label for="session-${session.key}" class="session-info">
                    <strong>${session.key}</strong>
                    Solves: ${session.solve_count} | 
                    Best: ${session.best ? session.best.toFixed(2) + 's' : 'N/A'} | 
                    Mean: ${session.mean ? session.mean.toFixed(2) + 's' : 'N/A'}
                </label>
            </div>
        `).join('');
        
        document.getElementById('session-selection').style.display = 'block';
        document.getElementById('import-status').textContent = '';
    } catch (error) {
        document.getElementById('import-status').textContent = `Error: ${error.message}`;
        document.getElementById('import-status').className = 'error';
    }
}

// Import Selected Sessions
async function importSelectedSessions() {
    const checkboxes = document.querySelectorAll('#session-checkboxes input[type="checkbox"]:checked');
    const selectedSessions = Array.from(checkboxes).map(cb => cb.value);
    
    if (selectedSessions.length === 0) {
        alert('Please select at least one session to import');
        return;
    }
    
    const statusDiv = document.getElementById('import-status');
    statusDiv.textContent = 'Importing...';
    statusDiv.className = '';
    
    try {
        const response = await fetch(`${API_BASE}/import/selected`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: selectedFile.name,
                sessions: selectedSessions
            })
        });
        
        const result = await response.json();
        
        if (result.error) {
            statusDiv.textContent = `Error: ${result.error}`;
            statusDiv.className = 'error';
        } else {
            statusDiv.textContent = result.message;
            statusDiv.className = 'success';
            
            setTimeout(() => {
                loadStats();
                loadRecentSessions();
            }, 1000);
            
            document.getElementById('file-input').value = '';
            document.getElementById('file-name').textContent = '';
            document.getElementById('preview-btn').style.display = 'none';
            document.getElementById('session-selection').style.display = 'none';
            selectedFile = null;
        }
    } catch (error) {
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.className = 'error';
    }
}

// Cancel Import
function cancelImport() {
    document.getElementById('session-selection').style.display = 'none';
    document.getElementById('import-status').textContent = '';
}
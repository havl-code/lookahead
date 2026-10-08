// import.js: the Import tab (CSTimer import)

registerActions('click', {
    'choose-import-file': () => document.getElementById('file-input').click(),
    'import-selected': () => importSelectedSessions(),
    'cancel-import': () => cancelImport()
});

// Set up the file upload listeners when the tab loads
function loadImportTab() {
    setupFileUpload();
}

function setupFileUpload() {
    const fileInput = document.getElementById('file-input');
    const fileNameSpan = document.getElementById('file-name');
    const previewBtn = document.getElementById('preview-btn');
    const statusDiv = document.getElementById('import-status');
    
    if (!previewBtn) return;
    
    // Remove old listeners to prevent duplicates
    const newFileInput = fileInput.cloneNode(true);
    fileInput.parentNode.replaceChild(newFileInput, fileInput);
    
    const newPreviewBtn = previewBtn.cloneNode(true);
    previewBtn.parentNode.replaceChild(newPreviewBtn, previewBtn);
    
    // Add fresh listeners
    newFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            AppState.selectedFile = file;
            fileNameSpan.textContent = file.name;
            newPreviewBtn.style.display = 'inline-block';
            statusDiv.textContent = '';
            statusDiv.className = '';
            const sessionSelection = document.getElementById('session-selection');
            if (sessionSelection) {
                sessionSelection.style.display = 'none';
            }
        }
    });
    
    newPreviewBtn.addEventListener('click', previewSessions);
}

async function previewSessions() {
    if (!AppState.selectedFile) return;
    
    const formData = new FormData();
    formData.append('file', AppState.selectedFile);
    
    document.getElementById('import-status').textContent = 'Loading sessions...';
    
    try {
        const response = await apiFetch(`/import/preview`, {
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
        // Session names come from the file, so they're escaped, and the ids use the position
        // rather than the name (which may contain spaces or quotes).
        checkboxesDiv.innerHTML = result.sessions.map((session, i) => `
            <div class="session-checkbox">
                <input type="checkbox" id="import-session-${i}" value="${escapeHtml(session.key)}" checked>
                <label for="import-session-${i}" class="session-info">
                    <strong>${escapeHtml(session.key)}</strong><br>
                    <span class="session-meta">
                        ${countLabel(session.solve_count, 'solve')} |
                        Best: ${session.best ? session.best.toFixed(2) + 's' : 'N/A'} |
                        Mean: ${session.mean ? session.mean.toFixed(2) + 's' : 'N/A'}
                    </span>
                </label>
            </div>
        `).join('');
        
        document.getElementById('session-selection').style.display = 'block';
        document.getElementById('import-status').textContent = '';
    } catch (error) {
        console.error('Preview error:', error);
        document.getElementById('import-status').textContent = `Error: ${error.message}`;
        document.getElementById('import-status').className = 'error';
    }
}

async function importSelectedSessions() {
    const checkboxes = document.querySelectorAll('#session-checkboxes input[type="checkbox"]:checked');
    const selectedSessions = Array.from(checkboxes).map(cb => cb.value);
    const eventId = document.getElementById('import-event-select').value;
    
    if (selectedSessions.length === 0) {
        showError('Please select at least one session to import');
        return;
    }
    
    const statusDiv = document.getElementById('import-status');
    statusDiv.textContent = `Importing ${selectedSessions.length} session(s) as ${getEventName(eventId)}...`;
    statusDiv.className = '';
    
    // The server doesn't keep the previewed file around, so send it again with the selection.
    const formData = new FormData();
    formData.append('file', AppState.selectedFile);
    formData.append('sessions', JSON.stringify(selectedSessions));
    formData.append('event_id', eventId);

    try {
        const response = await apiFetch(`/import/selected`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (result.error) {
            statusDiv.textContent = `Error: ${result.error}`;
            statusDiv.className = 'error';
        } else {
            statusDiv.textContent = `✓ ${result.message}`;
            statusDiv.className = 'success';
            
            setTimeout(() => {
                loadAvailableEvents();
                loadStats();
                loadRecentSessions();
            }, 1000);
            
            document.getElementById('file-input').value = '';
            document.getElementById('file-name').textContent = '';
            document.getElementById('preview-btn').style.display = 'none';
            document.getElementById('session-selection').style.display = 'none';
            AppState.selectedFile = null;
        }
    } catch (error) {
        console.error('Import error:', error);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.className = 'error';
    }
}

function cancelImport() {
    document.getElementById('session-selection').style.display = 'none';
    document.getElementById('import-status').textContent = '';
}
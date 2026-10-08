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
        AppState.importPreview = result.sessions;
        // Session names come from the file, so they're escaped, and the ids use the position
        // rather than the name (which may contain spaces or quotes). Sessions with nothing new
        // to bring in start unticked.
        checkboxesDiv.innerHTML = result.sessions.map((session, i) => {
            const empty = session.solve_count === 0;
            const imported = !empty && session.solve_count === session.already_imported;
            const nothingNew = empty || imported;
            const notes = [];
            if (empty) {
                notes.push('No solves to import');
            } else if (session.already_imported) {
                notes.push(imported ? 'Already in the app' : `${countLabel(session.already_imported, 'solve')} already in the app`);
            }
            if (session.unreadable) {
                notes.push(`${countLabel(session.unreadable, 'row')} can't be read and will be left out`);
            }
            return `
                <div class="session-checkbox${imported ? ' imported' : ''}${empty ? ' empty' : ''}">
                    <input type="checkbox" id="import-session-${i}" value="${escapeHtml(session.key)}" ${nothingNew ? '' : 'checked'}>
                    <label for="import-session-${i}" class="session-info">
                        <strong>${escapeHtml(session.name)}</strong>
                        <span class="session-meta">
                            ${countLabel(session.solve_count, 'solve')}${session.days ? ` | ${escapeHtml(formatDateRange(session.first_date, session.last_date))}` : ''}${session.days > 1 ? ` (${session.days} days)` : ''} |
                            Best: ${session.best ? formatTime(session.best) : 'N/A'} |
                            Mean: ${session.mean ? formatTime(session.mean) : 'N/A'}
                        </span>
                        ${notes.length ? `<span class="session-meta session-warning">${notes.join('. ')}.</span>` : ''}
                    </label>
                </div>
            `;
        }).join('');
        
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
    // Everything picked was imported before, so there's nothing to do (the server would skip
    // it all anyway)
    const picked = (AppState.importPreview || []).filter(s => selectedSessions.includes(s.key));
    if (picked.length && picked.every(s => s.solve_count === s.already_imported)) {
        showError('Everything you picked is already in the app, so there\'s nothing new to import.');
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
    formData.append('split_by_day', document.getElementById('import-split-by-day').checked ? 'true' : 'false');

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

// "1 Sept 2026", or "1 Sept to 3 Sept 2026" for a session that spans days
function formatDateRange(first, last) {
    const format = iso => new Date(`${iso}T00:00:00`).toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' });
    return first === last ? format(first) : `${format(first)} to ${format(last)}`;
}

function cancelImport() {
    document.getElementById('session-selection').style.display = 'none';
    document.getElementById('import-status').textContent = '';
}
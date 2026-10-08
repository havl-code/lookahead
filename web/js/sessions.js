// sessions.js: the Sessions tab (session list with an event filter, and each session's solves)

// Column values for sorting session tables (this one and the dashboard's Recent Sessions)
const SESSION_SORT_GETTERS = {
    date: s => s.date,
    event: s => getEventName(s.event_id),
    solves: s => s.solve_count,
    best: s => s.best_single,
    mean: s => s.session_mean,
    ao5: s => s.ao5,
    ao12: s => s.ao12
};

registerActions('click', {
    'show-add-session': () => showAddSessionForm(),
    'hide-add-session': () => hideAddSessionForm(),
    'view-session': button => viewSessionSolves(Number(button.dataset.sessionId)),
    'delete-session': button => deleteSession(Number(button.dataset.sessionId)),
    'delete-session-solve': button => deleteSessionSolve(Number(button.dataset.solveId)),
    'close-solve-modal': () => closeSolveModal(),
    'load-more-solves': () => loadMoreSessionSolves()
});
registerActions('change', { 'filter-sessions': () => applySessionFilters() });
registerActions('submit', {
    'add-session': (form, event) => addSession(event),
    'add-solve': (form, event) => addSolveToSession(event)
});

async function loadSessionsTab() {
    try {
        const response = await apiFetch(`/sessions`);
        const sessions = await response.json();

        if (sessions.error) {
            console.error('Error loading sessions:', sessions.error);
            return;
        }

        AppState.allSessions = sessions;
        populateEventFilter();
        applySessionFilters();
        await loadCubesForDropdown();
    } catch (error) {
        console.error('Failed to load sessions:', error);
    }
}

// (Re)fill the event filter from the current sessions, keeping the selection if it still exists
function populateEventFilter() {
    const eventFilter = document.getElementById('filter-event');
    const selected = eventFilter.value;
    eventFilter.innerHTML = '<option value="">All Events</option>';
    const uniqueEvents = [...new Set(AppState.allSessions.map(s => s.event_id))];
    uniqueEvents.forEach(eventId => {
        const option = document.createElement('option');
        option.value = eventId;
        option.textContent = getEventName(eventId);
        eventFilter.appendChild(option);
    });
    eventFilter.value = uniqueEvents.includes(selected) ? selected : '';
}

// Show the sessions for the chosen event, in the table's current sort order
function applySessionFilters() {
    const eventFilter = document.getElementById('filter-event').value;
    const filtered = eventFilter
        ? AppState.allSessions.filter(s => s.event_id === eventFilter)
        : AppState.allSessions;
    displayFilteredSessions(sortRows('sessions-table', filtered, SESSION_SORT_GETTERS));
}

function displayFilteredSessions(sessions) {
    const tbody = document.getElementById('sessions-tbody');

    if (sessions.length === 0) {
        const message = AppState.allSessions.length === 0
            ? 'No sessions yet. Use the timer, add one above, or import from CSTimer.'
            : 'No sessions for this event.';
        tbody.innerHTML = `<tr><td colspan="8" class="loading">${message}</td></tr>`;
        return;
    }

    tbody.innerHTML = sessions.map(session => `
        <tr>
            <td>${escapeHtml(session.date || 'N/A')}</td>
            <td>${escapeHtml(getEventName(session.event_id) || 'N/A')}</td>
            <td class="num">${Number(session.solve_count || 0).toLocaleString('en-NZ')}</td>
            <td class="num">${formatTime(session.best_single)}</td>
            <td class="num">${formatTime(session.session_mean)}</td>
            <td class="num">${formatTime(session.ao5)}</td>
            <td class="num">${formatTime(session.ao12)}</td>
            <td class="actions-col">
                <button class="action-btn" data-action="view-session" data-session-id="${session.id}">View</button>
                <button class="action-btn danger" data-action="delete-session" data-session-id="${session.id}">Delete</button>
            </td>
        </tr>
    `).join('');
}

async function deleteSession(sessionId) {
    const sure = await confirmDialog("Delete this session and all its solves? This can't be undone.",
        { title: 'Delete session', confirmLabel: 'Delete session' });
    if (!sure) return;

    try {
        const response = await apiFetch(`/sessions/${sessionId}`, {
            method: 'DELETE'
        });
        const result = await response.json();

        if (result.error) {
            showError(result.error);
        } else {
            showSuccess('Session deleted');
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
        const response = await apiFetch(`/sessions/add`, {
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
            showSuccess('Session created');
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
// ONE SESSION'S SOLVES
// ============================================
// A session can hold tens of thousands of solves, so the server sorts them and the table
// loads a page at a time ("Show more" loads the next page).

const SOLVES_PAGE_SIZE = 100;
const solvesView = {
    sessionId: null,
    solves: [],     // the rows loaded so far, in the current order
    total: 0,
    request: 0      // bumped on every load, so a slow older response can't overwrite a newer one
};

async function viewSessionSolves(sessionId) {
    solvesView.sessionId = sessionId;
    document.getElementById('current-session-id').value = sessionId;
    document.getElementById('solve-modal-title').textContent = `Solves in Session ${sessionId}`;

    tableSorts['solves-table'] = { key: 'number', dir: 'asc' };
    updateSortArrows('solves-table');

    await loadSessionSolvesPage(true);
    document.getElementById('solve-details-modal').style.display = 'flex';
}

// Load the first page (reset) or the next page of the open session's solves
async function loadSessionSolvesPage(reset) {
    const request = ++solvesView.request;
    const { key, dir } = tableSorts['solves-table'];
    const params = new URLSearchParams({
        sort: key,
        dir: dir,
        offset: reset ? 0 : solvesView.solves.length,
        limit: SOLVES_PAGE_SIZE
    });

    try {
        const response = await apiFetch(`/sessions/${solvesView.sessionId}/solves?${params}`);
        const data = await response.json();
        if (request !== solvesView.request) return;

        solvesView.total = data.total;
        solvesView.solves = reset ? data.solves : solvesView.solves.concat(data.solves);
        renderSolvesTable();
    } catch (error) {
        showError(`Couldn't load the solves: ${error.message}`);
    }
}

function loadMoreSessionSolves() {
    loadSessionSolvesPage(false);
}

function renderSolvesTable() {
    const tbody = document.getElementById('solves-tbody');
    const { solves, total } = solvesView;

    if (solves.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No solves yet. Add some above!</td></tr>';
    } else {
        tbody.innerHTML = solves.map(solve => {
            const penalty = solve.penalty === 'OK' ? '' : (solve.penalty || '');  // timer solves save 'OK'
            return `
                <tr>
                    <td class="num">${solve.solve_number}</td>
                    <td class="num">${solve.result_seconds == null ? 'DNF' : formatTime(solve.result_seconds)}</td>
                    <td>${escapeHtml(penalty || '-')}</td>
                    <td class="scramble-cell" title="${escapeHtml(solve.scramble)}">${escapeHtml(solve.scramble || '-')}</td>
                    <td class="actions-col">
                        <button class="action-btn danger" data-action="delete-session-solve" data-solve-id="${solve.id}">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('solves-count-note').textContent = total > solves.length
        ? `Showing ${solves.length.toLocaleString('en-NZ')} of ${countLabel(total, 'solve')}`
        : countLabel(total, 'solve');
    document.getElementById('solves-more-btn').style.display = total > solves.length ? '' : 'none';
}

initSortableTable('sessions-table', 'date', 'desc', applySessionFilters);
initSortableTable('solves-table', 'number', 'asc', () => loadSessionSolvesPage(true));

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
        const response = await apiFetch(`/sessions/${sessionId}/solves/add`, {
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
            if (timeSeconds >= WCA_LONGEST_LIMIT_SECONDS) {
                showToast(`Solve added. It's past ${WCA_LIMIT}, but that's fine for practice.`, { duration: 10000 });
            }
            document.getElementById('add-solve-form').reset();
            await loadSessionSolvesPage(true);
            loadSessionsTab();
            loadStats();
        }
    } catch (error) {
        showError(error.message);
    }
}

async function deleteSessionSolve(solveId) {
    if (!(await confirmDialog("Delete this solve? This can't be undone.", { title: 'Delete solve' }))) return;

    try {
        const response = await apiFetch(`/solves/${solveId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (result.error) {
            showError(result.error);
        } else {
            await loadSessionSolvesPage(true);
            loadSessionsTab();
            loadStats();
        }
    } catch (error) {
        showError(error.message);
    }
}

// Close the solves window by clicking the dark area around it
document.getElementById('solve-details-modal').addEventListener('click', (e) => {
    if (e.target.id === 'solve-details-modal') closeSolveModal();
});

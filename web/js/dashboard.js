// dashboard.js: the Dashboard tab

let recentSessions = [];  // the 5 most recent sessions, shown in the Recent Sessions table

async function loadDashboard() {
    await loadAvailableEvents();
    await loadStats();
    await loadRecentSessions();
}

async function loadAvailableEvents() {
    try {
        const response = await apiFetch(`/events`);
        const events = await response.json();

        const select = document.getElementById('event-select');
        select.innerHTML = '<option value="all">All Events</option>';
        events.forEach(eventId => {
            const option = document.createElement('option');
            option.value = eventId;
            option.textContent = getEventName(eventId);
            select.appendChild(option);
        });

        // Show all events if there's nothing logged for the current one yet
        if (AppState.currentEvent !== 'all' && !events.includes(AppState.currentEvent)) {
            AppState.currentEvent = 'all';
        }
        select.value = AppState.currentEvent;
    } catch (error) {
        console.error('Failed to load events:', error);
    }
}

registerActions('change', { 'change-dashboard-event': () => changeEvent() });
registerActions('click', { 'close-pb-modal': () => closePBModal() });

function changeEvent() {
    AppState.currentEvent = document.getElementById('event-select').value;
    loadStats();
}

// Show a stat, and make it a link to somewhere when there's something to see. A clickable stat
// is a button to a keyboard (Tab to it, then Enter or Space) and to a screen reader, which
// hears its card's name with it, such as "Personal Best 9.83s".
function setStat(id, text, onClick = null) {
    const element = document.getElementById(id);
    element.textContent = text;
    element.classList.toggle('clickable', Boolean(onClick));
    element.onclick = onClick;
    if (onClick) {
        const card = element.closest('.stat-card');
        const name = card?.querySelector('.stat-label')?.textContent.trim();
        element.setAttribute('role', 'button');
        element.tabIndex = 0;
        element.setAttribute('aria-label', name ? `${name} ${text}` : text);
        element.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick(e);
            }
        };
    } else {
        element.removeAttribute('role');
        element.removeAttribute('tabindex');
        element.removeAttribute('aria-label');
        element.onkeydown = null;
    }
}

async function loadStats() {
    try {
        const response = await apiFetch(`/stats?event_id=${encodeURIComponent(AppState.currentEvent)}`);
        const data = await response.json();

        if (data.error) {
            console.error('Error loading stats:', data.error);
            return;
        }

        setStat('stat-pb', data.pb ? formatTime(data.pb) : 'No data',
            data.pb ? () => showPBDetails(data.pb, AppState.currentEvent) : null);
        // Times from different events can't be averaged together, so with All Events chosen
        // the card asks for one instead
        const allEvents = AppState.currentEvent === 'all';
        setStat('stat-avg', allEvents ? '-' : (data.average ? formatTime(data.average) : 'No data'));
        document.getElementById('stat-avg-note').textContent = allEvents
            ? 'Choose an event above to see it' : 'of every solve in the event';
        setStat('stat-solves', Number(data.total_solves || 0).toLocaleString('en-NZ'));
        setStat('stat-sessions', data.total_sessions || '0',
            data.total_sessions > 0 ? () => switchTab('sessions') : null);
        setStat('stat-cubes', data.total_cubes || '0',
            data.total_cubes > 0 ? () => switchTab('cubes') : null);
        document.getElementById('stat-cubes-note').textContent = `${data.active_cubes || 0} active`;
        showBestAverages(data.best_averages);

        // The rankings only list the fastest 1,000 in each event, so a slower best single gets
        // no rank rather than a guess (see wca.estimate_rank)
        const rankNote = document.getElementById('stat-rank-note');
        if (data.wca_rank != null) {
            setStat('stat-rank', `~${Number(data.wca_rank).toLocaleString('en-NZ')}`);
            // Anything under 0.01% (faster than nearly everyone ranked) rounds to 0, so show 0.01%
            rankNote.textContent = data.wca_percentile != null
                ? `Top ${Math.max(data.wca_percentile, 0.01)}% worldwide, by best single`
                : 'by best single';
        } else if (data.wca_outside_top != null) {
            setStat('stat-rank', `${Number(data.wca_outside_top).toLocaleString('en-NZ')}+`);
            rankNote.textContent = `Outside the top ${Number(data.wca_outside_top).toLocaleString('en-NZ')}, so no estimate`;
        } else {
            setStat('stat-rank', 'No data');
            rankNote.textContent = 'based on your best single';
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// The event's best Ao5, Ao12, Ao50, and Ao100. They need an event: averaging times from
// different events would mean nothing.
const AVERAGE_SIZES = { ao5: 5, ao12: 12, ao50: 50, ao100: 100 };

function showBestAverages(averages) {
    Object.entries(AVERAGE_SIZES).forEach(([kind, size]) => {
        const best = averages ? averages[kind] : null;
        setStat(`best-${kind}`, best ? formatTime(best.value) : '-',
            best ? () => showPBDetails(best.value, AppState.currentEvent, kind) : null);
        document.getElementById(`best-${kind}-note`).textContent = !averages
            ? 'Choose an event above'
            : best ? formatDate(best.date) : `Needs ${size} solves in a session`;
    });
}

// The details of a PB: a single's date and scramble, or an average's date and solves (with the
// dropped ones in brackets, the way cubers write them). Its event comes from the server, since
// with All Events chosen the fastest single could be from any event.
async function showPBDetails(pbTime, eventId, kind = 'single') {
    try {
        const response = await apiFetch(`/pb-details?event_id=${encodeURIComponent(eventId)}&kind=${kind}`);
        const data = await response.json();

        if (!response.ok || data.error) {
            showError('Could not fetch PB details');
            return;
        }

        const isAverage = kind !== 'single';
        const label = isAverage ? `Best Ao${AVERAGE_SIZES[kind]}, ` : '';
        const solves = isAverage
            ? data.solves.map(s => {
                const time = s.result == null ? 'DNF' : formatClock(s.result);
                return s.counted ? time : `(${time})`;
            }).join(' ')
            : '';
        const lastBox = isAverage
            ? `<div class="detail-box">
                   <div class="detail-label">Solves (the dropped ones are in brackets)</div>
                   <div class="detail-value mono">${escapeHtml(solves)}</div>
               </div>`
            : `<div class="detail-box">
                   <div class="detail-label">Scramble</div>
                   <div class="detail-value mono">${escapeHtml(data.scramble || 'No scramble recorded')}</div>
               </div>`;

        const modalHTML = `
            <div id="pb-modal" class="modal">
                <div class="modal-content modal-small" role="dialog" aria-modal="true" aria-labelledby="pb-modal-title">
                    <div class="modal-header">
                        <h3 id="pb-modal-title">Personal Best</h3>
                        <button class="modal-close" data-action="close-pb-modal" aria-label="Close">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="pb-time">${formatTime(pbTime)}</div>
                        <div class="pb-event">${escapeHtml(label + getEventName(data.event_id))}</div>
                        <div class="detail-box">
                            <div class="detail-label">Date</div>
                            <div class="detail-value">${escapeHtml(data.date || 'N/A')}</div>
                        </div>
                        ${lastBox}
                    </div>
                </div>
            </div>
        `;

        closePBModal();
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modal = document.getElementById('pb-modal');
        windowOpened(modal);
        // Clicking the dark area around the window closes it
        modal.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closePBModal();
        });
    } catch (error) {
        console.error('Error showing PB details:', error);
        showError('Failed to load PB details');
    }
}

function closePBModal() {
    const modal = document.getElementById('pb-modal');
    modal?.remove();
    windowClosed(modal);
}

async function loadRecentSessions() {
    try {
        const response = await apiFetch(`/sessions`);
        const sessions = await response.json();
        if (sessions.error) return;

        recentSessions = sessions.slice(0, 5);  // the server lists the newest first
        renderRecentSessions();
    } catch (error) {
        console.error('Failed to load recent sessions:', error);
    }
}

function renderRecentSessions() {
    const tbody = document.getElementById('recent-sessions-tbody');

    if (recentSessions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="loading">No sessions yet. Start the timer or import your CSTimer data.</td></tr>';
        return;
    }

    tbody.innerHTML = sortRows('recent-sessions-table', recentSessions, SESSION_SORT_GETTERS).map(session => `
        <tr>
            <td>${escapeHtml(session.date || 'N/A')}</td>
            <td>${escapeHtml(getEventName(session.event_id) || 'N/A')}</td>
            <td class="num">${Number(session.solve_count || 0).toLocaleString('en-NZ')}</td>
            <td class="num">${formatTime(session.best_single)}</td>
            <td class="num">${formatTime(session.session_mean)}</td>
        </tr>
    `).join('');
}

initSortableTable('recent-sessions-table', 'date', 'desc', renderRecentSessions);

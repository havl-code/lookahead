// timer.js: the live speed timer (3x3x3 only for now)

const TimerState = {
    event: '333',
    scramble: '',
    time: 0,
    startTime: 0,
    running: false,
    inspection: false,
    inspectionTime: 15,
    inspectionInterval: null,
    spacePressed: false,
    readyToStart: false,
    holdTimer: null,
    currentSolves: [],      // the latest solves in the session, newest first
    stats: null,            // the session's stats, worked out by the server
    currentSessionId: null,
    // Whether the timer follows the calendar: times go into today's session, and the first solve
    // of a new day starts one. Picking a session from the menu turns this off until next time.
    followToday: true,
    isFullscreen: false,
    showingResult: false,   // true while the last result is on screen
    settings: {
        inspectionEnabled: true,
        inspectionSeconds: 15,
        hideTimer: false,
        hideStats: false
    }
};

// Generate a random-move 3x3x3 scramble
function generate333Scramble() {
    const moves = ['R', 'L', 'U', 'D', 'F', 'B'];
    const modifiers = ['', "'", '2'];
    const scrambleLength = 20;

    const scramble = [];
    let lastMove = '';
    let lastAxis = '';

    for (let i = 0; i < scrambleLength; i++) {
        let move;
        let axis;

        do {
            move = moves[Math.floor(Math.random() * moves.length)];
            axis = getAxis(move);
        } while (move === lastMove || axis === lastAxis);

        const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
        scramble.push(move + modifier);

        lastMove = move;
        lastAxis = axis;
    }

    return scramble.join(' ');
}

function getAxis(move) {
    if (move === 'R' || move === 'L') return 'RL';
    if (move === 'U' || move === 'D') return 'UD';
    if (move === 'F' || move === 'B') return 'FB';
}

// Set up the timer tab (called every time it's opened)
async function loadTimerTab() {
    const supported = TimerState.event === '333';
    setUnderConstruction(!supported);
    if (!supported) return;

    await loadSessionSelector();
    setupTimerKeyboard();
    setupScrambleMenu();
    // Leave the display and scramble alone if a solve is in progress.
    if (!TimerState.running && !TimerState.inspection) {
        resetTimerDisplay();
        generateNewScramble();
    }
}

// Only 3x3x3 has a timer so far. For other events, swap the timer for a notice. It's hidden
// rather than replaced, so switching back to 3x3x3 still works.
function setUnderConstruction(show) {
    const content = document.querySelector('.timer-main-content');
    let notice = document.getElementById('timer-under-construction');
    if (!notice) {
        notice = document.createElement('div');
        notice.id = 'timer-under-construction';
        notice.className = 'under-construction';
        notice.innerHTML = `
            <h3>Coming soon</h3>
            <p>The timer for other events is still being built. Only 3x3x3 is available for now.</p>
        `;
        content.after(notice);
    }
    content.style.display = show ? 'none' : '';
    notice.style.display = show ? '' : 'none';
}

function resetTimerDisplay() {
    const display = document.getElementById('timer-display');
    display.textContent = '0.00';
    display.className = 'timer-display';
    TimerState.showingResult = false;
}

function generateNewScramble() {
    TimerState.scramble = generate333Scramble();
    document.getElementById('scramble-text').textContent = TimerState.scramble;
}

// Scramble menu (copy / new scramble), opened by clicking the scramble. Clicks on its items
// carry on to the page's action listener, which runs them (and they close the menu).
function setupScrambleMenu() {
    document.querySelector('.scramble-display').onclick = (e) => {
        if (!e.target.closest('.scramble-menu-item')) {
            document.querySelector('.scramble-menu').classList.toggle('show');
        }
    };
}

// Clicking anywhere else closes the scramble menu.
document.addEventListener('click', (e) => {
    if (!e.target.closest('.scramble-display')) {
        document.querySelector('.scramble-menu')?.classList.remove('show');
    }
});

function copyScramble() {
    navigator.clipboard.writeText(TimerState.scramble).catch(() => {
        // Clipboard access can be refused; there's nothing useful to do about it.
    });
    document.querySelector('.scramble-menu').classList.remove('show');
}

function newScramble() {
    generateNewScramble();
    document.querySelector('.scramble-menu').classList.remove('show');
}

// Session selector: lists this event's sessions and keeps showing the one being timed into.
async function loadSessionSelector() {
    try {
        const response = await apiFetch(`/sessions`);
        const sessions = await response.json();

        const selector = document.getElementById('timer-session-select');
        // Newest first, so the first one dated today is today's latest session
        const timerSessions = sessions.filter(s => s.event_id === TimerState.event);

        // Back to following today if the picked session has been deleted
        if (!timerSessions.some(s => s.id === TimerState.currentSessionId)) {
            TimerState.followToday = true;
        }
        if (TimerState.followToday) {
            const todays = timerSessions.find(s => s.date === localToday());
            TimerState.currentSessionId = todays ? todays.id : null;
        }

        selector.innerHTML = '<option value="new">+ Create New Session</option>';
        if (!TimerState.currentSessionId) {
            // A selected placeholder, so picking "+ Create New Session" still counts as a change.
            selector.insertAdjacentHTML('beforeend',
                `<option value="" disabled>Today's session starts with your first solve</option>`);
        }
        timerSessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session.id;
            option.textContent = `${session.date} (${countLabel(session.solve_count, 'solve')})`;
            selector.appendChild(option);
        });
        selector.value = TimerState.currentSessionId || '';

        selector.onchange = async (e) => {
            if (e.target.value === 'new') {
                await createTimerSession();
                TimerState.followToday = true;  // the new session is today's latest
                await loadSessionSelector();
            } else {
                TimerState.followToday = false;
                TimerState.currentSessionId = parseInt(e.target.value, 10);
                await loadSessionSolves(TimerState.currentSessionId);
            }
        };

        await loadSessionSolves(TimerState.currentSessionId);
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

// How many recent solves the timer lists. The stats cover the whole session, and the full
// list is in the Sessions tab, so a session with thousands of solves stays quick.
const TIMER_LIST_LIMIT = 50;

async function loadSessionSolves(sessionId) {
    if (!sessionId) {
        TimerState.currentSolves = [];
        TimerState.stats = null;
    } else {
        try {
            const response = await apiFetch(`/timer/session/${sessionId}/solves?limit=${TIMER_LIST_LIMIT}`);
            const data = await response.json();
            TimerState.currentSolves = data.solves || [];
            TimerState.stats = data.stats || null;
        } catch (error) {
            console.error('Error loading solves:', error);
        }
    }
    updateTimerStats();
    updateSolvesList();
}

// Settings modal
function showTimerSettings() {
    const modal = document.createElement('div');
    modal.id = 'timer-settings-modal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="timer-settings-modal">
            <h3>Timer Settings</h3>
            <div class="settings-grid">
                <div class="setting-item">
                    <span class="setting-label">Inspection</span>
                    <div class="setting-toggle ${TimerState.settings.inspectionEnabled ? 'active' : ''}"
                         data-action="toggle-timer-setting" data-setting="inspectionEnabled"></div>
                </div>
                <div class="setting-item">
                    <span class="setting-label">Inspection Time</span>
                    <select class="setting-select" data-change="change-inspection-time">
                        <option value="8" ${TimerState.settings.inspectionSeconds === 8 ? 'selected' : ''}>8 seconds</option>
                        <option value="12" ${TimerState.settings.inspectionSeconds === 12 ? 'selected' : ''}>12 seconds</option>
                        <option value="15" ${TimerState.settings.inspectionSeconds === 15 ? 'selected' : ''}>15 seconds</option>
                        <option value="17" ${TimerState.settings.inspectionSeconds === 17 ? 'selected' : ''}>17 seconds</option>
                    </select>
                </div>
                <div class="setting-item">
                    <span class="setting-label">Hide Timer While Solving</span>
                    <div class="setting-toggle ${TimerState.settings.hideTimer ? 'active' : ''}"
                         data-action="toggle-timer-setting" data-setting="hideTimer"></div>
                </div>
                <div class="setting-item">
                    <span class="setting-label">Hide Stats</span>
                    <div class="setting-toggle ${TimerState.settings.hideStats ? 'active' : ''}"
                         data-action="toggle-timer-setting" data-setting="hideStats"></div>
                </div>
            </div>
            <div class="form-actions align-end">
                <button class="btn-secondary" data-action="close-timer-settings">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeTimerSettings();
        }
    });
}

function toggleTimerSetting(setting, element) {
    TimerState.settings[setting] = !TimerState.settings[setting];
    element.classList.toggle('active');

    if (setting === 'hideStats') {
        document.querySelector('.timer-session-stats')
            ?.classList.toggle('hidden', TimerState.settings.hideStats);
    }
}

function changeInspectionTime(value) {
    TimerState.settings.inspectionSeconds = parseInt(value, 10);
}

function closeTimerSettings() {
    // Look this modal up by its own id: the first ".modal" on the page is a different one.
    document.getElementById('timer-settings-modal')?.remove();
}

// Timer keyboard controls
function setupTimerKeyboard() {
    document.removeEventListener('keydown', handleTimerKeyDown);
    document.removeEventListener('keyup', handleTimerKeyUp);

    document.addEventListener('keydown', handleTimerKeyDown);
    document.addEventListener('keyup', handleTimerKeyUp);
}

// The space bar only drives the timer while the Timer tab is showing, and never while you're
// typing in a text box or have the timer settings open. Otherwise it would block typing spaces
// anywhere in the app, and could quietly start an inspection that ends in a DNF.
function timerOwnsSpaceBar(e) {
    if (!document.getElementById('tab-timer').classList.contains('active')) return false;
    if (TimerState.event !== '333' || document.getElementById('timer-settings-modal')) return false;
    if (document.querySelector('.confirm-dialog')) return false;
    const target = e.target;
    return !(target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
}

// Start the hold that has to last 300ms before releasing the space bar starts the timer
function startHoldTimer() {
    TimerState.spacePressed = true;
    TimerState.readyToStart = false;

    const display = document.getElementById('timer-display');

    TimerState.holdTimer = setTimeout(() => {
        if (TimerState.spacePressed && !TimerState.running) {
            TimerState.readyToStart = true;
            display.classList.remove('holding');
            display.classList.add('ready');
        }
    }, 300);
}

function handleTimerKeyDown(e) {
    if (e.key !== ' ' || !timerOwnsSpaceBar(e)) return;
    e.preventDefault();

    if (e.repeat) return;

    // If the timer is running, stop it
    if (TimerState.running) {
        stopTimer();
        return;
    }

    // If in inspection, get ready to start the timer
    if (TimerState.inspection) {
        const display = document.getElementById('timer-display');
        display.classList.remove('inspection');
        display.classList.add('holding');
        startHoldTimer();
        return;
    }

    // From a shown result or the initial 0.00: start inspection, or get ready to start
    TimerState.showingResult = false;
    if (TimerState.settings.inspectionEnabled) {
        startInspection();
    } else {
        startHoldTimer();
    }
}

function handleTimerKeyUp(e) {
    // Always finish a hold that started on the timer, even if focus has moved since.
    if (e.key !== ' ' || !(timerOwnsSpaceBar(e) || TimerState.spacePressed)) return;
    e.preventDefault();

    if (TimerState.holdTimer) {
        clearTimeout(TimerState.holdTimer);
        TimerState.holdTimer = null;
    }

    TimerState.spacePressed = false;

    // Start the timer if the hold was long enough
    if (TimerState.readyToStart && !TimerState.running) {
        startTimer();
    }

    document.getElementById('timer-display').classList.remove('ready', 'holding');
}

// Inspection countdown
function startInspection() {
    TimerState.inspection = true;
    TimerState.inspectionTime = TimerState.settings.inspectionSeconds;

    const display = document.getElementById('timer-display');
    display.className = 'timer-display inspection';
    display.textContent = TimerState.settings.hideTimer ? 'inspect' : TimerState.inspectionTime;

    TimerState.inspectionInterval = setInterval(() => {
        TimerState.inspectionTime--;

        if (!TimerState.settings.hideTimer) {
            display.textContent = TimerState.inspectionTime;
        }

        if (TimerState.inspectionTime <= 0) {
            clearInterval(TimerState.inspectionInterval);
            // Running out of inspection time is a DNF
            TimerState.inspection = false;
            TimerState.time = 0;
            display.textContent = 'DNF';
            display.className = 'timer-display stopped';
            TimerState.showingResult = true;
            saveSolve('DNF');
            setTimeout(generateNewScramble, 100);
        }

        if (!TimerState.inspection) {
            clearInterval(TimerState.inspectionInterval);
        }
    }, 1000);
}

function startTimer() {
    if (TimerState.inspection) {
        TimerState.inspection = false;
        if (TimerState.inspectionInterval) {
            clearInterval(TimerState.inspectionInterval);
            TimerState.inspectionInterval = null;
        }
    }

    TimerState.running = true;
    TimerState.readyToStart = false;
    // performance.now() is a steady clock: unlike Date.now(), it can't jump when the computer's
    // clock is changed (say, by a time sync or daylight saving) part-way through a solve.
    TimerState.startTime = performance.now();

    const display = document.getElementById('timer-display');
    display.className = 'timer-display running';

    // Show "solve" instead of the time if Hide Timer is on
    if (TimerState.settings.hideTimer) {
        display.textContent = 'solve';
    }

    const interval = setInterval(() => {
        if (!TimerState.running) {
            clearInterval(interval);
            return;
        }

        const elapsed = (performance.now() - TimerState.startTime) / 1000;
        display.textContent = TimerState.settings.hideTimer ? 'solve' : elapsed.toFixed(2);
    }, 10);
}

function stopTimer() {
    if (!TimerState.running) return;

    TimerState.running = false;
    TimerState.time = (performance.now() - TimerState.startTime) / 1000;
    TimerState.showingResult = true;

    const display = document.getElementById('timer-display');
    display.className = 'timer-display stopped';
    display.textContent = TimerState.time.toFixed(2);

    // Save straight away, then show a new scramble while keeping the time on screen
    saveSolve('OK');
    setTimeout(generateNewScramble, 100);
}

async function saveSolve(penalty) {
    let finalTime = TimerState.time;
    let isDNF = false;

    if (penalty === '+2') {
        finalTime += 2;
    } else if (penalty === 'DNF') {
        isDNF = true;
    }

    const scramble = TimerState.scramble;

    try {
        // The server picks the session when following today (it may start a new one), and says
        // which session it used.
        const response = await apiFetch(`/timer/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: TimerState.currentSessionId,
                follow_today: TimerState.followToday,
                event_id: TimerState.event,
                time: finalTime,
                scramble: scramble,
                penalty: penalty,
                dnf: isDNF
            })
        });

        const result = await response.json();

        if (result.success && result.session_id !== TimerState.currentSessionId) {
            TimerState.currentSessionId = result.session_id;
            await loadSessionSelector();
        } else if (result.success) {
            await loadSessionSolves(TimerState.currentSessionId);
        }
    } catch (error) {
        console.error('Error saving solve:', error);
        showError("Couldn't save that solve. Check the app is still running, then try again.");
    }
}

// The session's stats come from the server, which uses the WCA rules: Ao5 drops the best and
// worst of the last 5 solves (a DNF counts as the worst), and two or more DNFs make it a DNF.
function updateTimerStats() {
    const stats = TimerState.stats || { solve_count: 0 };
    const show = value => (value == null ? '-' : value.toFixed(2));

    document.getElementById('stat-count').textContent = Number(stats.solve_count).toLocaleString('en-NZ');
    document.getElementById('stat-best').textContent = show(stats.best);
    document.getElementById('stat-mean').textContent = show(stats.mean);
    document.getElementById('stat-ao5').textContent =
        stats.ao5 == null && stats.solve_count >= 5 ? 'DNF' : show(stats.ao5);
}

function updateSolvesList() {
    const container = document.querySelector('.solves-list-container');
    const stats = TimerState.stats || { solve_count: 0 };
    const note = document.getElementById('timer-solves-note');
    note.textContent = stats.solve_count > TimerState.currentSolves.length
        ? `Showing your latest ${TimerState.currentSolves.length} of ${countLabel(stats.solve_count, 'solve')}. ` +
          'The Sessions tab has them all.'
        : '';

    if (TimerState.currentSolves.length === 0) {
        container.innerHTML = '<div class="empty-note">No solves yet</div>';
        return;
    }

    // Highlight the session's best and worst results
    const matches = (solve, target) => target != null && !solve.dnf && solve.time.toFixed(2) === target.toFixed(2);

    container.innerHTML = TimerState.currentSolves.map(solve => {
        const isBest = matches(solve, stats.best);
        const isWorst = matches(solve, stats.worst) && stats.solve_count > 2;

        let timeDisplay = solve.dnf ? 'DNF' : solve.time.toFixed(2);
        if (solve.penalty === '+2' && !solve.dnf) {
            timeDisplay += ' (+2)';
        }
        const scramble = escapeHtml(solve.scramble);

        return `
            <div class="solve-item">
                <span class="solve-number">#${solve.solve_number}</span>
                <span class="solve-time ${isBest ? 'best' : ''} ${isWorst ? 'worst' : ''}">${timeDisplay}</span>
                <span class="solve-scramble" title="${scramble}">${scramble}</span>
                <div class="solve-actions">
                    <select class="solve-action-select" data-change="change-solve-penalty" data-solve-id="${solve.id}">
                        <option value="OK" ${solve.penalty === 'OK' ? 'selected' : ''}>OK</option>
                        <option value="+2" ${solve.penalty === '+2' ? 'selected' : ''}>+2</option>
                        <option value="DNF" ${solve.penalty === 'DNF' ? 'selected' : ''}>DNF</option>
                    </select>
                    <button class="solve-action-btn delete" data-action="delete-timer-solve" data-solve-id="${solve.id}">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function changeSolvePenalty(solveId, newPenalty) {
    try {
        const response = await apiFetch(`/timer/solve/${solveId}/penalty`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ penalty: newPenalty })
        });

        if (response.ok) {
            await loadSessionSolves(TimerState.currentSessionId);
        }
    } catch (error) {
        console.error('Error updating penalty:', error);
    }
}

async function deleteTimerSolve(solveId) {
    if (!(await confirmDialog("Delete this solve? This can't be undone.", { title: 'Delete solve' }))) return;

    try {
        const response = await apiFetch(`/timer/solve/${solveId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadSessionSolves(TimerState.currentSessionId);
        }
    } catch (error) {
        console.error('Error deleting solve:', error);
    }
}

async function createTimerSession() {
    try {
        const response = await apiFetch(`/timer/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event_id: TimerState.event })
        });

        const result = await response.json();

        if (result.success) {
            TimerState.currentSessionId = result.session_id;
            await loadSessionSolves(result.session_id);
        }
    } catch (error) {
        console.error('Error creating session:', error);
    }
}

// Fullscreen mode
function toggleFullscreen() {
    const timerSection = document.querySelector('.timer-section');
    TimerState.isFullscreen = !TimerState.isFullscreen;
    timerSection.classList.toggle('timer-fullscreen', TimerState.isFullscreen);
    document.getElementById('fullscreen-btn').textContent =
        TimerState.isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen';
}

// Called off part-way through: stop inspection, a hold or a running solve without saving
// anything, and keep the same scramble for the next try.
function cancelAttempt() {
    clearInterval(TimerState.inspectionInterval);
    clearTimeout(TimerState.holdTimer);
    TimerState.inspectionInterval = null;
    TimerState.holdTimer = null;
    TimerState.inspection = false;
    TimerState.running = false;  // the running display stops itself on its next tick
    TimerState.spacePressed = false;
    TimerState.readyToStart = false;
    resetTimerDisplay();
}

// Escape cancels an attempt in progress; otherwise it leaves fullscreen.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (TimerState.inspection || TimerState.running || TimerState.spacePressed) {
        e.preventDefault();
        cancelAttempt();
    } else if (TimerState.isFullscreen) {
        toggleFullscreen();
    }
});

function changeTimerEvent(eventId) {
    TimerState.event = eventId;
    loadTimerTab();
}

registerActions('click', {
    'show-timer-settings': () => showTimerSettings(),
    'close-timer-settings': () => closeTimerSettings(),
    'toggle-timer-setting': toggle => toggleTimerSetting(toggle.dataset.setting, toggle),
    'toggle-fullscreen': () => toggleFullscreen(),
    'copy-scramble': () => copyScramble(),
    'new-scramble': () => newScramble(),
    'delete-timer-solve': button => deleteTimerSolve(Number(button.dataset.solveId))
});
registerActions('change', {
    'change-timer-event': select => changeTimerEvent(select.value),
    'change-inspection-time': select => changeInspectionTime(select.value),
    'change-solve-penalty': select => changeSolvePenalty(Number(select.dataset.solveId), select.value)
});

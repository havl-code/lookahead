// timer.js: the live speed timer (for the events in SCRAMBLES, in scramble.js)

const TimerState = {
    event: '333',
    scramble: '',
    time: 0,
    startTime: 0,
    running: false,
    inspection: false,
    inspectionStart: 0,     // performance.now() when inspection began
    inspectionInterval: null,
    callsMade: [],          // the inspection calls (8 and 12 seconds) made so far
    pendingPenalty: 'OK',   // what inspection earned the solve that's running: OK or +2
    spacePressed: false,    // the space bar (or a finger on the time) is down
    readyToStart: false,
    holdTimer: null,
    currentSolves: [],      // the latest solves in the session, newest first
    stats: null,            // the session's stats, worked out by the server
    currentSessionId: null,
    savingSolve: false,     // true while a solve is on its way to the server
    shownSolveId: null,     // the saved solve whose result is on screen, if there is one
    // Whether the timer follows the calendar: times go into today's session, and the first solve
    // of a new day starts one. Picking a session from the menu turns this off until next time.
    followToday: true,
    isFullscreen: false,
    showingResult: false,   // true while the last result is on screen
    settings: {
        inspectionEnabled: true,
        inspectionCalls: 'off',   // a sound at 8 and 12 seconds: 'off', 'beep', or 'voice'
        hideTimer: false,
        hideStats: false
    }
};

// WCA inspection (Regulations A3 and A4): the competitor has 15 seconds to inspect and start
// the solve. Starting at 15.00 seconds or later but before 17.00 is a +2 (A4d1, which says
// exactly 15.00 is a +2), and 17.00 or later is a DNF (A4d2). Inspection is timed until the
// timer starts (A3b5). The judge calls "8 SECONDS" and "12 SECONDS" (A3b3 and A3b4).
const INSPECTION = { plusTwoAt: 15, dnfAt: 17, calls: [8, 12] };

// The penalty for starting a solve after this many seconds of inspection: 'OK', '+2', or 'DNF'
function inspectionPenalty(elapsedSeconds) {
    if (elapsedSeconds >= INSPECTION.dnfAt) return 'DNF';
    if (elapsedSeconds >= INSPECTION.plusTwoAt) return '+2';
    return 'OK';
}

// The timer settings live in the app's database (see /api/settings/timer), so they're the same
// after a reload, in another browser, and after restoring a backup.
let timerSettingsLoaded = false;

async function loadTimerSettings() {
    if (!timerSettingsLoaded) {
        try {
            const response = await apiFetch('/settings/timer');
            if (response.ok) {
                Object.assign(TimerState.settings, await response.json());
                timerSettingsLoaded = true;
            }
        } catch (error) {
            console.error('Error loading the timer settings:', error);
        }
    }
    document.querySelector('.timer-session-stats')
        ?.classList.toggle('hidden', TimerState.settings.hideStats);
}

async function saveTimerSettings() {
    try {
        const response = await apiFetch('/settings/timer', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(TimerState.settings)
        });
        if (!response.ok) throw new Error((await response.json()).error);
    } catch (error) {
        showError(`Couldn't save the timer settings: ${error.message}`);
    }
}

// Set up the timer tab (called every time it's opened)
async function loadTimerTab() {
    await loadTimerSettings();
    const supported = hasTimer(TimerState.event);
    setUnderConstruction(!supported);
    if (!supported) return;

    await loadSessionSelector();
    setupTimerKeyboard();
    setupTimerTouch();
    setupScrambleMenu();
    // Leave the display and scramble alone if a solve is in progress.
    if (!TimerState.running && !TimerState.inspection) {
        resetTimerDisplay();
        generateNewScramble();
    }
}

// Only some events have a timer so far. For the others, swap the timer for a notice. It's
// hidden rather than replaced, so switching back to an event with a timer still works.
function setUnderConstruction(show) {
    const content = document.querySelector('.timer-main-content');
    let notice = document.getElementById('timer-under-construction');
    if (!notice) {
        const names = Object.keys(SCRAMBLES).map(getEventName);
        notice = document.createElement('div');
        notice.id = 'timer-under-construction';
        notice.className = 'under-construction';
        notice.innerHTML = `
            <h3>Coming soon</h3>
            <p>The timer for this event is still being built. For now, it's ready for
               ${escapeHtml(names.slice(0, -1).join(', '))}, and ${escapeHtml(names.at(-1))}.</p>
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
    TimerState.shownSolveId = null;
}

function generateNewScramble() {
    // A solve asks for its next scramble a moment after it stops, and the event may have been
    // switched to one without a timer (and so without scrambles) in the meantime
    if (!hasTimer(TimerState.event)) return;
    TimerState.scramble = generateScramble(TimerState.event);
    const text = document.getElementById('scramble-text');
    text.textContent = TimerState.scramble;
    // The big cubes' scrambles (60 to 100 moves) are set a little smaller, so they fit
    text.classList.toggle('long', SCRAMBLES[TimerState.event].length > 40);
}

// Scramble menu (copy / new scramble), opened by clicking the scramble or its options button
// (which is how a keyboard opens it, with Enter). Clicks on its items carry on to the page's
// action listener, which runs them (and they close the menu).
function setScrambleMenu(open) {
    document.querySelector('.scramble-menu')?.classList.toggle('show', open);
    document.querySelector('.scramble-options-btn')?.setAttribute('aria-expanded', String(open));
}

function scrambleMenuOpen() {
    return Boolean(document.querySelector('.scramble-menu.show'));
}

function setupScrambleMenu() {
    document.querySelector('.scramble-display').onclick = (e) => {
        if (e.target.closest('.scramble-menu-item')) return;
        setScrambleMenu(!scrambleMenuOpen());
        // Opened from the keyboard (a click with no mouse behind it), so go to its first item
        if (scrambleMenuOpen() && e.detail === 0) document.querySelector('.scramble-menu-item').focus();
    };
}

// Clicking anywhere else closes the scramble menu.
document.addEventListener('click', (e) => {
    if (!e.target.closest('.scramble-display')) setScrambleMenu(false);
});

function copyScramble() {
    navigator.clipboard.writeText(TimerState.scramble).catch(() => {
        // Clipboard access can be refused; there's nothing useful to do about it.
    });
    setScrambleMenu(false);
}

function newScramble() {
    generateNewScramble();
    setScrambleMenu(false);
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
        <div class="timer-settings-modal" role="dialog" aria-modal="true" aria-labelledby="timer-settings-title">
            <h3 id="timer-settings-title">Timer Settings</h3>
            <div class="settings-grid">
                <div class="setting-item">
                    <span class="setting-label" id="setting-inspection">WCA Inspection (15 seconds)</span>
                    ${settingSwitch('inspectionEnabled', 'setting-inspection')}
                </div>
                <div class="setting-item">
                    <label class="setting-label" for="setting-calls">Sound at 8 and 12 Seconds</label>
                    <select class="setting-select" id="setting-calls" data-change="change-inspection-calls">
                        <option value="off" ${TimerState.settings.inspectionCalls === 'off' ? 'selected' : ''}>Off</option>
                        <option value="beep" ${TimerState.settings.inspectionCalls === 'beep' ? 'selected' : ''}>Beep</option>
                        <option value="voice" ${TimerState.settings.inspectionCalls === 'voice' ? 'selected' : ''}>Voice</option>
                    </select>
                </div>
                <p class="setting-note">
                    Starting after 15 seconds of inspection is a +2, and after 17 seconds a DNF, as
                    in WCA competitions. The calls at 8 and 12 seconds always show on screen.
                </p>
                <div class="setting-item">
                    <span class="setting-label" id="setting-hide-timer">Hide Timer While Solving</span>
                    ${settingSwitch('hideTimer', 'setting-hide-timer')}
                </div>
                <div class="setting-item">
                    <span class="setting-label" id="setting-hide-stats">Hide Stats</span>
                    ${settingSwitch('hideStats', 'setting-hide-stats')}
                </div>
            </div>
            <div class="form-actions align-end">
                <button class="btn-secondary" data-action="close-timer-settings">Close</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    windowOpened(modal);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeTimerSettings();
        }
    });
}

// An on/off setting: a switch that a keyboard reaches and a screen reader announces as on or off
function settingSwitch(setting, labelId) {
    const on = Boolean(TimerState.settings[setting]);
    return `<button type="button" class="setting-toggle${on ? ' active' : ''}" role="switch" aria-checked="${on}"
                    aria-labelledby="${labelId}" data-action="toggle-timer-setting" data-setting="${setting}"></button>`;
}

function toggleTimerSetting(setting, element) {
    TimerState.settings[setting] = !TimerState.settings[setting];
    element.classList.toggle('active', TimerState.settings[setting]);
    element.setAttribute('aria-checked', String(TimerState.settings[setting]));

    if (setting === 'hideStats') {
        document.querySelector('.timer-session-stats')
            ?.classList.toggle('hidden', TimerState.settings.hideStats);
    }
    saveTimerSettings();
}

function changeInspectionCalls(value) {
    TimerState.settings.inspectionCalls = value;
    saveTimerSettings();
}

function closeTimerSettings() {
    // Look this modal up by its own id: the first ".modal" on the page is a different one.
    const modal = document.getElementById('timer-settings-modal');
    modal?.remove();
    windowClosed(modal);
}

// Timer keyboard controls
function setupTimerKeyboard() {
    document.removeEventListener('keydown', handleTimerKeyDown);
    document.removeEventListener('keyup', handleTimerKeyUp);
    document.removeEventListener('keydown', handleTimerShortcut);

    document.addEventListener('keydown', handleTimerKeyDown);
    document.addEventListener('keyup', handleTimerKeyUp);
    document.addEventListener('keydown', handleTimerShortcut);
}

// The timer's keys (the space bar and the shortcuts) only work while the Timer tab is showing,
// and never while you're typing in a text box or have a window open. Otherwise the space bar
// would block typing spaces anywhere in the app, and could quietly start an inspection that
// ends in a DNF.
function timerOwnsKeys(e) {
    if (!document.getElementById('tab-timer').classList.contains('active')) return false;
    if (!hasTimer(TimerState.event) || document.getElementById('timer-settings-modal')) return false;
    if (isDialogOpen()) return false;
    const target = e.target;
    return !(target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
}

// Shortcuts for the latest solve, as in csTimer: Ctrl+1, Ctrl+2, and Ctrl+3 make it OK, +2, or
// DNF, and Ctrl+Z deletes it (with Undo). Many browsers keep Ctrl and a number for switching
// tabs, so Alt works with the numbers too (Option on a Mac, and Cmd+Z there). They wait while a
// solve is being timed or saved, so they can't change the wrong one.
const PENALTY_KEYS = { Digit1: 'OK', Digit2: '+2', Digit3: 'DNF', Numpad1: 'OK', Numpad2: '+2', Numpad3: 'DNF' };

function handleTimerShortcut(e) {
    const penalty = (e.ctrlKey || e.altKey) && !e.shiftKey ? PENALTY_KEYS[e.code] : null;
    const undo = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z';
    if (!(penalty || undo) || !timerOwnsKeys(e)) return;
    e.preventDefault();
    if (TimerState.running || TimerState.inspection || TimerState.spacePressed || TimerState.savingSolve) return;

    const latest = TimerState.currentSolves[0];
    if (!latest) return;
    if (undo) {
        deleteTimerSolve(latest.id);
    } else if (solvePenalty(latest) !== penalty) {
        changeSolvePenalty(latest.id, penalty);
    }
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
    if (e.key !== ' ' || !timerOwnsKeys(e)) return;
    e.preventDefault();

    if (e.repeat) return;
    timerPress();
}

function handleTimerKeyUp(e) {
    // Always finish a hold that started on the timer, even if focus has moved since.
    if (e.key !== ' ' || !(timerOwnsKeys(e) || TimerState.spacePressed)) return;
    e.preventDefault();
    timerRelease();
}

// Touchscreens: press and hold the time until it turns green, let go to start, and tap it to
// stop, just as with the space bar. Only fingers and pens count, so a mouse click on the time
// can't start anything by surprise.
function setupTimerTouch() {
    const display = document.getElementById('timer-display');
    const isTouch = e => e.pointerType === 'touch' || e.pointerType === 'pen';
    display.onpointerdown = (e) => {
        if (!isTouch(e) || !timerOwnsKeys(e)) return;
        e.preventDefault();
        try {
            display.setPointerCapture(e.pointerId);  // so letting go off the time still counts
        } catch (error) {
            // Nothing to capture (the pointer has already gone); the hold still works
        }
        timerPress();
    };
    display.onpointerup = (e) => {
        if (!isTouch(e) || !(timerOwnsKeys(e) || TimerState.spacePressed)) return;
        e.preventDefault();
        timerRelease();
    };
    // The browser took the touch back (say, for a system gesture): call off the hold, and
    // don't start the timer
    display.onpointercancel = (e) => {
        if (isTouch(e)) cancelHold();
    };
    // A long press would otherwise open the browser's menu for the text
    display.oncontextmenu = (e) => e.preventDefault();
}

// The space bar or a finger going down
function timerPress() {
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

// The space bar or a finger coming up: starts the timer if it was held long enough
function timerRelease() {
    const ready = TimerState.readyToStart && !TimerState.running;
    cancelHold();
    if (ready) startTimer();
}

function cancelHold() {
    if (TimerState.holdTimer) {
        clearTimeout(TimerState.holdTimer);
        TimerState.holdTimer = null;
    }
    TimerState.spacePressed = false;
    TimerState.readyToStart = false;
    document.getElementById('timer-display').classList.remove('ready', 'holding');
}

// Inspection: counts down from 15, shows +2 from 15 to 17 seconds, and ends the attempt as a
// DNF at 17. It's timed with performance.now(), checked ten times a second, so it never drifts.
function startInspection() {
    TimerState.inspection = true;
    TimerState.inspectionStart = performance.now();
    TimerState.callsMade = [];
    showInspectionCall('');
    const display = document.getElementById('timer-display');
    display.className = 'timer-display inspection';
    updateInspection();
    TimerState.inspectionInterval = setInterval(updateInspection, 100);
}

function inspectionElapsed() {
    return (performance.now() - TimerState.inspectionStart) / 1000;
}

function updateInspection() {
    if (!TimerState.inspection) {
        clearInterval(TimerState.inspectionInterval);
        return;
    }
    const elapsed = inspectionElapsed();
    const display = document.getElementById('timer-display');
    const penalty = inspectionPenalty(elapsed);

    if (penalty === 'DNF') {
        // Seventeen seconds without starting: the attempt is a DNF, with no time (A4d2)
        endInspection();
        TimerState.time = 0;
        display.textContent = 'DNF';
        display.className = 'timer-display stopped';
        TimerState.showingResult = true;
        saveSolve('DNF');
        setTimeout(generateNewScramble, 100);
        return;
    }

    INSPECTION.calls.forEach(call => {
        if (elapsed >= call && !TimerState.callsMade.includes(call)) {
            TimerState.callsMade.push(call);
            makeInspectionCall(call);
        }
    });

    // Holding the space bar keeps its own colour; otherwise show the time left, or +2
    const holding = display.classList.contains('holding') || display.classList.contains('ready');
    if (penalty === '+2') {
        display.textContent = '+2';
        if (!holding) display.className = 'timer-display inspection plus-two';
    } else {
        display.textContent = TimerState.settings.hideTimer ? 'inspect' : Math.ceil(INSPECTION.plusTwoAt - elapsed);
    }
}

function endInspection() {
    TimerState.inspection = false;
    clearInterval(TimerState.inspectionInterval);
    TimerState.inspectionInterval = null;
    showInspectionCall('');
}

// The judge's calls: always on screen, and with a sound if the settings ask for one
function makeInspectionCall(seconds) {
    showInspectionCall(`${seconds} seconds`);
    if (TimerState.settings.inspectionCalls === 'voice' && speakCall(`${seconds} seconds`)) return;
    if (TimerState.settings.inspectionCalls !== 'off') beep();
}

function showInspectionCall(text) {
    const call = document.getElementById('inspection-call');
    if (call) call.textContent = text;
}

// A short beep made in the browser, so it works offline
let audioContext = null;
function beep() {
    try {
        audioContext = audioContext || new AudioContext();
        const tone = audioContext.createOscillator();
        const volume = audioContext.createGain();
        tone.frequency.value = 880;
        volume.gain.value = 0.15;
        tone.connect(volume).connect(audioContext.destination);
        tone.start();
        tone.stop(audioContext.currentTime + 0.15);
    } catch (e) {
        // No sound available; the call still shows on screen
    }
}

// Says the call with one of the computer's own voices (so it works offline). Returns false if
// there isn't one, so a beep can be used instead.
function speakCall(text) {
    if (!('speechSynthesis' in window)) return false;
    const voices = speechSynthesis.getVoices();
    const voice = voices.find(v => v.localService && v.lang.startsWith('en')) || voices.find(v => v.localService);
    if (!voice) return false;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    speechSynthesis.speak(utterance);
    return true;
}

function startTimer() {
    TimerState.pendingPenalty = 'OK';
    if (TimerState.inspection) {
        // Starting the timer ends inspection (A3b5); starting after 15 seconds earns a +2
        TimerState.pendingPenalty = inspectionPenalty(inspectionElapsed()) === '+2' ? '+2' : 'OK';
        endInspection();
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

    let noticeShown = false;
    const interval = setInterval(() => {
        if (!TimerState.running) {
            clearInterval(interval);
            return;
        }

        const elapsed = (performance.now() - TimerState.startTime) / 1000;
        if (elapsed >= MAX_SOLVE_SECONDS) {
            clearInterval(interval);
            stopAtTimeLimit();
            return;
        }
        if (elapsed >= WCA_LONGEST_LIMIT_SECONDS && !noticeShown) {
            noticeShown = true;
            showToast(`This solve has passed ${WCA_LIMIT}. That's fine for practice, and the ` +
                      'timer keeps going until 2 hours.', { duration: 15000 });
        }
        display.textContent = TimerState.settings.hideTimer ? 'solve' : formatClock(truncatedSeconds(elapsed * 1000));
    }, 10);
}

// At 2 hours, the longest solve the app keeps, the timer stops by itself and the attempt is a
// DNF, the way a judge stops a solve that reaches its time limit and records a DNF
// (Regulation A1a4).
function stopAtTimeLimit() {
    TimerState.running = false;
    TimerState.time = MAX_SOLVE_SECONDS;
    TimerState.showingResult = true;
    TimerState.pendingPenalty = 'OK';
    const display = document.getElementById('timer-display');
    display.className = 'timer-display stopped';
    display.textContent = 'DNF';
    showToast('The solve reached 2 hours, the longest the app keeps, so the timer stopped and saved ' +
              'it as a DNF, as a judge does when a solve reaches its time limit.', { type: 'error', duration: 20000 });
    saveSolve('DNF');
    setTimeout(generateNewScramble, 100);
}

function stopTimer() {
    if (!TimerState.running) return;

    TimerState.running = false;
    // Whole milliseconds, cut off rather than rounded, so the time saved can never show a
    // hundredth more than the one on screen
    const ms = Math.floor(performance.now() - TimerState.startTime);
    TimerState.time = ms / 1000;
    TimerState.showingResult = true;

    const display = document.getElementById('timer-display');
    display.className = 'timer-display stopped';
    display.textContent = formatClock(truncatedSeconds(ms));

    // Save straight away (with any +2 from inspection), then show a new scramble while keeping
    // the time on screen
    const penalty = TimerState.pendingPenalty;
    TimerState.pendingPenalty = 'OK';
    if (penalty === '+2') display.textContent = `${formatClock(truncatedSeconds(ms + 2000))} (+2)`;
    saveSolve(penalty);
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

    await sendSolve({
        session_id: TimerState.currentSessionId,
        follow_today: TimerState.followToday,
        event_id: TimerState.event,
        time: finalTime,
        scramble: TimerState.scramble,
        penalty: penalty,
        dnf: isDNF
    });
}

// Send a solve to be saved. The server picks the session when following today (it may start a
// new one), and says which session it used. If the solve can't be saved, whether the server
// turns it down or can't be reached, it isn't lost: an error toast says why and offers Retry,
// which sends exactly the same solve again.
async function sendSolve(solve) {
    TimerState.savingSolve = true;
    try {
        const response = await apiFetch('/timer/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(solve)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.error || `the app replied with an error (${response.status})`);
        }

        // The time on screen is this solve's, unless another attempt has started since
        if (TimerState.showingResult) TimerState.shownSolveId = result.solve_id;
        if (result.session_id !== TimerState.currentSessionId) {
            TimerState.currentSessionId = result.session_id;
            await loadSessionSelector();
        } else {
            await loadSessionSolves(TimerState.currentSessionId);
        }
    } catch (error) {
        console.error('Error saving solve:', error);
        // fetch() fails with a TypeError when the app can't be reached at all
        const reason = error instanceof TypeError ? "the app isn't responding" : error.message.replace(/\.$/, '');
        showToast(`Couldn't save that solve: ${reason}.`, {
            type: 'error', actionLabel: 'Retry', onAction: () => sendSolve(solve), duration: 20000
        });
    } finally {
        TimerState.savingSolve = false;
    }
}

// The session's stats come from the server, which uses the WCA rules: Ao5 drops the best and
// worst of the last 5 solves (a DNF counts as the worst), and two or more DNFs make it a DNF.
function updateTimerStats() {
    const stats = TimerState.stats || { solve_count: 0 };
    const show = value => (value == null ? '-' : formatClock(value));

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
    const matches = (solve, target) => target != null && !solve.dnf && Math.abs(solve.time - target) < 0.005;

    container.innerHTML = TimerState.currentSolves.map(solve => {
        const isBest = matches(solve, stats.best);
        const isWorst = matches(solve, stats.worst) && stats.solve_count > 2;

        const scramble = escapeHtml(solve.scramble);
        const note = escapeHtml(solve.notes);

        return `
            <div class="solve-item">
                <span class="solve-number">#${solve.solve_number}</span>
                <span class="solve-time ${isBest ? 'best' : ''} ${isWorst ? 'worst' : ''}">${solveResultText(solve)}</span>
                <span class="solve-scramble" title="${scramble}">${scramble}</span>
                <div class="solve-actions">
                    <select class="solve-action-select" data-change="change-solve-penalty" data-solve-id="${solve.id}"
                            aria-label="Penalty for solve ${solve.solve_number}">
                        ${penaltyOptions(solve)}
                    </select>
                    <button class="solve-action-btn${note ? ' has-note' : ''}" data-action="edit-timer-solve-note"
                            data-solve-id="${solve.id}" title="${note ? 'Edit the note' : 'Add a note'}">Note</button>
                    <button class="solve-action-btn delete" data-action="delete-timer-solve" data-solve-id="${solve.id}">Delete</button>
                </div>
                ${note ? `<p class="solve-note">${note}</p>` : ''}
            </div>
        `;
    }).join('');
}

// A solve's result the way the timer shows it: 12.34, 14.34 (+2), or DNF
function solveResultText(solve) {
    if (solve.dnf) return 'DNF';
    return solve.penalty === '+2' ? `${formatClock(solve.time)} (+2)` : formatClock(solve.time);
}

async function refreshTimerSolves() {
    await loadSessionSolves(TimerState.currentSessionId);
}

async function changeSolvePenalty(solveId, newPenalty) {
    if (await updateSolve(solveId, { penalty: newPenalty })) {
        await refreshTimerSolves();
        // If that solve's time is still on screen, show it with its new penalty
        const solve = TimerState.currentSolves.find(s => s.id === solveId);
        if (solve && TimerState.showingResult && TimerState.shownSolveId === solveId) {
            document.getElementById('timer-display').textContent = solveResultText(solve);
        }
    } else {
        updateSolvesList();  // put the menu back to the penalty it has
    }
}

async function editTimerSolveNote(solveId) {
    const solve = TimerState.currentSolves.find(s => s.id === solveId);
    if (solve && await editSolveNote(solve)) await refreshTimerSolves();
}

async function deleteTimerSolve(solveId) {
    const onScreen = TimerState.showingResult && TimerState.shownSolveId === solveId;
    if (await deleteSolve(solveId, refreshTimerSolves) && onScreen) resetTimerDisplay();
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
    endInspection();
    clearTimeout(TimerState.holdTimer);
    TimerState.holdTimer = null;
    TimerState.pendingPenalty = 'OK';
    TimerState.running = false;  // the running display stops itself on its next tick
    TimerState.spacePressed = false;
    TimerState.readyToStart = false;
    resetTimerDisplay();
}

// Escape closes the scramble menu, or cancels an attempt in progress; otherwise it leaves
// fullscreen. (An open window, such as the timer settings, closes first: see ui.js.)
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (scrambleMenuOpen()) {
        setScrambleMenu(false);
        document.querySelector('.scramble-options-btn').focus();
    } else if (TimerState.inspection || TimerState.running || TimerState.spacePressed) {
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
    'edit-timer-solve-note': button => editTimerSolveNote(Number(button.dataset.solveId)),
    'delete-timer-solve': button => deleteTimerSolve(Number(button.dataset.solveId))
});
registerActions('change', {
    'change-timer-event': select => changeTimerEvent(select.value),
    'change-inspection-calls': select => changeInspectionCalls(select.value),
    'change-solve-penalty': select => changeSolvePenalty(Number(select.dataset.solveId), select.value)
});

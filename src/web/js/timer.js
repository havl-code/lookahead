// timer.js - Speed Timer Functionality

// Timer state
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
    currentSolves: [],
    currentSessionId: null,
    isFullscreen: false,
    showingResult: false, // NEW: Track if showing result
    settings: {
        inspectionEnabled: true,
        inspectionSeconds: 15,
        hideTimer: false,
        hideStats: false
    }
};

// Generate 3x3 scramble
function generate333Scramble() {
    const moves = ['R', 'L', 'U', 'D', 'F', 'B'];
    const modifiers = ['', "'", '2'];
    const scrambleLength = 20;
    
    let scramble = [];
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

// Initialize timer tab
async function loadTimerTab() {
    if (TimerState.event !== '333') {
        showUnderConstruction();
        return;
    }
    
    await loadSessionSelector();
    initializeTimer();
    setupTimerKeyboard();
    generateNewScramble();
    setupScrambleMenu();
}

function showUnderConstruction() {
    const timerContainer = document.querySelector('.timer-main-content');
    if (timerContainer) {
        timerContainer.innerHTML = `
            <div class="under-construction">
                <div class="under-construction-icon">🚧</div>
                <h3>Coming Soon</h3>
                <p>Timer for other events is under construction.</p>
                <p style="margin-top: 8px;">Currently only 3x3x3 is available.</p>
            </div>
        `;
    }
}

function initializeTimer() {
    document.getElementById('timer-display').textContent = '0.00';
    document.getElementById('timer-display').className = 'timer-display';
    updateTimerStats();
    updateSolvesList();
}

function generateNewScramble() {
    TimerState.scramble = generate333Scramble();
    document.getElementById('scramble-text').textContent = TimerState.scramble;
}

// Scramble menu
function setupScrambleMenu() {
    const scrambleDisplay = document.querySelector('.scramble-display');
    const scrambleMenu = document.querySelector('.scramble-menu');
    
    if (scrambleDisplay) {
        scrambleDisplay.onclick = (e) => {
            e.stopPropagation();
            scrambleMenu.classList.toggle('show');
        };
    }
    
    document.addEventListener('click', () => {
        if (scrambleMenu) {
            scrambleMenu.classList.remove('show');
        }
    });
}

function copyScramble() {
    navigator.clipboard.writeText(TimerState.scramble).then(() => {
        console.log('Scramble copied to clipboard');
    }).catch(err => {
        console.error('Failed to copy scramble:', err);
    });
    document.querySelector('.scramble-menu').classList.remove('show');
}

function newScramble() {
    generateNewScramble();
    document.querySelector('.scramble-menu').classList.remove('show');
}

// Session selector
async function loadSessionSelector() {
    try {
        const response = await fetch(`${API_BASE}/sessions`);
        const sessions = await response.json();
        
        const selector = document.getElementById('timer-session-select');
        if (!selector) return;
        
        selector.innerHTML = '<option value="new">+ Create New Session</option>';
        
        const threeSessions = sessions.filter(s => s.event_id === '333');
        
        threeSessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session.id;
            option.textContent = `${session.date} - ${session.solve_count} solves`;
            selector.appendChild(option);
        });
        
        if (threeSessions.length > 0 && !TimerState.currentSessionId) {
            TimerState.currentSessionId = threeSessions[0].id;
            selector.value = threeSessions[0].id;
            await loadSessionSolves(threeSessions[0].id);
        }
        
        selector.onchange = async (e) => {
            if (e.target.value === 'new') {
                await createTimerSession();
                await loadSessionSelector();
            } else {
                TimerState.currentSessionId = parseInt(e.target.value);
                await loadSessionSolves(TimerState.currentSessionId);
            }
        };
    } catch (error) {
        console.error('Error loading sessions:', error);
    }
}

async function loadSessionSolves(sessionId) {
    try {
        const response = await fetch(`${API_BASE}/timer/session/${sessionId}/solves`);
        const data = await response.json();
        
        TimerState.currentSolves = data.solves || [];
        updateTimerStats();
        updateSolvesList();
    } catch (error) {
        console.error('Error loading solves:', error);
    }
}

// Settings modal
function showTimerSettings() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="timer-settings-modal">
            <h3>Timer Settings</h3>
            <div class="settings-grid">
                <div class="setting-item">
                    <span class="setting-label">Inspection</span>
                    <div class="setting-toggle ${TimerState.settings.inspectionEnabled ? 'active' : ''}" 
                         onclick="toggleTimerSetting('inspectionEnabled', this)"></div>
                </div>
                <div class="setting-item">
                    <span class="setting-label">Inspection Time</span>
                    <select class="setting-select" onchange="changeInspectionTime(this.value)">
                        <option value="8" ${TimerState.settings.inspectionSeconds === 8 ? 'selected' : ''}>8 seconds</option>
                        <option value="12" ${TimerState.settings.inspectionSeconds === 12 ? 'selected' : ''}>12 seconds</option>
                        <option value="15" ${TimerState.settings.inspectionSeconds === 15 ? 'selected' : ''}>15 seconds</option>
                        <option value="17" ${TimerState.settings.inspectionSeconds === 17 ? 'selected' : ''}>17 seconds</option>
                    </select>
                </div>
                <div class="setting-item">
                    <span class="setting-label">Hide Timer While Solving</span>
                    <div class="setting-toggle ${TimerState.settings.hideTimer ? 'active' : ''}" 
                         onclick="toggleTimerSetting('hideTimer', this)"></div>
                </div>
                <div class="setting-item">
                    <span class="setting-label">Hide Stats</span>
                    <div class="setting-toggle ${TimerState.settings.hideStats ? 'active' : ''}" 
                         onclick="toggleTimerSetting('hideStats', this)"></div>
                </div>
            </div>
            <div style="margin-top: 20px; text-align: right;">
                <button class="btn-secondary" onclick="closeTimerSettings()">Close</button>
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
        const stats = document.querySelector('.timer-session-stats');
        if (stats) {
            if (TimerState.settings.hideStats) {
                stats.classList.add('hidden');
            } else {
                stats.classList.remove('hidden');
            }
        }
    }
}

function changeInspectionTime(value) {
    TimerState.settings.inspectionSeconds = parseInt(value);
}

function closeTimerSettings() {
    const modal = document.querySelector('.modal');
    if (modal) modal.remove();
}

// Timer keyboard controls
function setupTimerKeyboard() {
    document.removeEventListener('keydown', handleTimerKeyDown);
    document.removeEventListener('keyup', handleTimerKeyUp);
    
    document.addEventListener('keydown', handleTimerKeyDown);
    document.addEventListener('keyup', handleTimerKeyUp);
}

function handleTimerKeyDown(e) {
    if (e.key !== ' ') return;
    e.preventDefault();
    
    if (e.repeat) return;
    
    // If timer is running, stop it
    if (TimerState.running) {
        stopTimer();
        return;
    }
    
    // If in inspection, prepare to start timer
    if (TimerState.inspection) {
        TimerState.spacePressed = true;
        TimerState.readyToStart = false;
        
        const display = document.getElementById('timer-display');
        display.classList.remove('inspection');
        display.classList.add('holding');
        
        TimerState.holdTimer = setTimeout(() => {
            if (TimerState.spacePressed && TimerState.inspection) {
                TimerState.readyToStart = true;
                display.classList.remove('holding');
                display.classList.add('ready');
            }
        }, 300);
        return;
    }
    
    // If showing result, go directly to inspection/ready (no need to show 0.00)
    if (TimerState.showingResult) {
        TimerState.showingResult = false;
        
        if (TimerState.settings.inspectionEnabled) {
            startInspection();
        } else {
            // Start holding immediately
            TimerState.spacePressed = true;
            TimerState.readyToStart = false;
            
            TimerState.holdTimer = setTimeout(() => {
                if (TimerState.spacePressed) {
                    TimerState.readyToStart = true;
                    document.getElementById('timer-display').classList.add('ready');
                }
            }, 300);
        }
        return;
    }
    
    // Initial state (0.00) - start inspection or prepare to start
    if (!TimerState.inspection && !TimerState.running) {
        if (TimerState.settings.inspectionEnabled) {
            startInspection();
        } else {
            TimerState.spacePressed = true;
            TimerState.readyToStart = false;
            
            TimerState.holdTimer = setTimeout(() => {
                if (TimerState.spacePressed && !TimerState.running) {
                    TimerState.readyToStart = true;
                    document.getElementById('timer-display').classList.add('ready');
                }
            }, 300);
        }
    }
}

function handleTimerKeyUp(e) {
    if (e.key !== ' ') return;
    e.preventDefault();
    
    if (TimerState.holdTimer) {
        clearTimeout(TimerState.holdTimer);
        TimerState.holdTimer = null;
    }
    
    TimerState.spacePressed = false;
    
    // Start timer if ready
    if (TimerState.readyToStart && !TimerState.running) {
        startTimer();
    }
    
    const display = document.getElementById('timer-display');
    display.classList.remove('ready', 'holding');
}

// Inspection countdown
function startInspection() {
    TimerState.inspection = true;
    TimerState.inspectionTime = TimerState.settings.inspectionSeconds;
    
    const display = document.getElementById('timer-display');
    display.className = 'timer-display inspection';
    
    if (TimerState.settings.hideTimer) {
        display.textContent = 'inspect';
    } else {
        display.textContent = TimerState.inspectionTime;
    }
    
    TimerState.inspectionInterval = setInterval(() => {
        TimerState.inspectionTime--;
        
        if (!TimerState.settings.hideTimer) {
            display.textContent = TimerState.inspectionTime;
        }
        
        if (TimerState.inspectionTime <= 0) {
            clearInterval(TimerState.inspectionInterval);
            // Auto DNF when inspection time runs out
            TimerState.inspection = false;
            display.textContent = 'DNF';
            display.className = 'timer-display stopped';
            TimerState.showingResult = true;
            saveSolve('DNF');
            setTimeout(() => {
                generateNewScramble();
            }, 100);
        }
        
        if (!TimerState.inspection) {
            clearInterval(TimerState.inspectionInterval);
        }
    }, 1000);
}

// Start timer
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
    TimerState.startTime = Date.now();
    
    const display = document.getElementById('timer-display');
    display.className = 'timer-display running';
    
    // Show "solve" if hide timer is enabled
    if (TimerState.settings.hideTimer) {
        display.textContent = 'solve';
    }
    
    const interval = setInterval(() => {
        if (!TimerState.running) {
            clearInterval(interval);
            return;
        }
        
        const elapsed = (Date.now() - TimerState.startTime) / 1000;
        
        if (TimerState.settings.hideTimer) {
            display.textContent = 'solve';
        } else {
            display.textContent = elapsed.toFixed(2);
        }
    }, 10);
}

// Stop timer
function stopTimer() {
    if (!TimerState.running) return;
    
    TimerState.running = false;
    TimerState.time = (Date.now() - TimerState.startTime) / 1000;
    TimerState.showingResult = true; // Set flag that we're showing result
    
    const display = document.getElementById('timer-display');
    display.className = 'timer-display stopped';
    display.textContent = TimerState.time.toFixed(2);
    
    // Auto-save and generate new scramble
    saveSolve('OK');
    
    // Generate new scramble immediately but keep time displayed
    setTimeout(() => {
        generateNewScramble();
    }, 100);
}

async function saveSolve(penalty) {
    let finalTime = TimerState.time;
    let isDNF = false;
    
    if (penalty === '+2') {
        finalTime += 2;
    } else if (penalty === 'DNF') {
        isDNF = true;
    }
    
    if (!TimerState.currentSessionId) {
        await createTimerSession();
    }
    
    try {
        const response = await fetch(`${API_BASE}/timer/solve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: TimerState.currentSessionId,
                time: finalTime,
                scramble: TimerState.scramble,
                penalty: penalty,
                dnf: isDNF
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            TimerState.currentSolves.unshift({
                id: result.solve_id,
                time: finalTime,
                penalty: penalty,
                dnf: isDNF,
                scramble: TimerState.scramble
            });
            
            updateTimerStats();
            updateSolvesList();
        }
    } catch (error) {
        console.error('Error saving solve:', error);
        alert('Failed to save solve');
    }
}

// Update stats
function updateTimerStats() {
    const validSolves = TimerState.currentSolves.filter(s => !s.dnf);
    
    if (validSolves.length === 0) {
        document.getElementById('stat-count').textContent = '0';
        document.getElementById('stat-best').textContent = '-';
        document.getElementById('stat-mean').textContent = '-';
        document.getElementById('stat-ao5').textContent = '-';
        return;
    }
    
    const times = validSolves.map(s => s.time);
    const best = Math.min(...times);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    
    document.getElementById('stat-count').textContent = TimerState.currentSolves.length;
    document.getElementById('stat-best').textContent = best.toFixed(2);
    document.getElementById('stat-mean').textContent = mean.toFixed(2);
    
    if (validSolves.length >= 5) {
        const last5 = times.slice(0, 5).sort((a, b) => a - b);
        const ao5 = last5.slice(1, 4).reduce((a, b) => a + b, 0) / 3;
        document.getElementById('stat-ao5').textContent = ao5.toFixed(2);
    } else {
        document.getElementById('stat-ao5').textContent = '-';
    }
}

// Update solves list
function updateSolvesList() {
    const container = document.querySelector('.solves-list-container');
    
    if (TimerState.currentSolves.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-tertiary);">No solves yet</div>';
        return;
    }
    
    const validTimes = TimerState.currentSolves.filter(s => !s.dnf).map(s => s.time);
    const best = validTimes.length > 0 ? Math.min(...validTimes) : null;
    const worst = validTimes.length > 0 ? Math.max(...validTimes) : null;
    
    container.innerHTML = TimerState.currentSolves.map((solve, index) => {
        const isBest = !solve.dnf && solve.time === best;
        const isWorst = !solve.dnf && solve.time === worst && validTimes.length > 2;
        
        let timeDisplay = solve.dnf ? 'DNF' : solve.time.toFixed(2);
        if (solve.penalty === '+2' && !solve.dnf) {
            timeDisplay += ' (+2)';
        }
        
        return `
            <div class="solve-item">
                <span class="solve-number">#${TimerState.currentSolves.length - index}</span>
                <span class="solve-time ${isBest ? 'best' : ''} ${isWorst ? 'worst' : ''}">${timeDisplay}</span>
                <span class="solve-scramble" title="${solve.scramble || ''}">${solve.scramble || ''}</span>
                <div class="solve-actions">
                    <select class="solve-action-select" onchange="changeSolvePenalty(${solve.id}, this.value)">
                        <option value="OK" ${solve.penalty === 'OK' ? 'selected' : ''}>OK</option>
                        <option value="+2" ${solve.penalty === '+2' ? 'selected' : ''}>+2</option>
                        <option value="DNF" ${solve.penalty === 'DNF' ? 'selected' : ''}>DNF</option>
                    </select>
                    <button class="solve-action-btn delete" onclick="deleteSolve(${solve.id})">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

async function changeSolvePenalty(solveId, newPenalty) {
    try {
        const response = await fetch(`${API_BASE}/timer/solve/${solveId}/penalty`, {
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

async function deleteSolve(solveId) {
    if (!confirm('Delete this solve?')) return;
    
    try {
        const response = await fetch(`${API_BASE}/timer/solve/${solveId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            TimerState.currentSolves = TimerState.currentSolves.filter(s => s.id !== solveId);
            updateTimerStats();
            updateSolvesList();
        }
    } catch (error) {
        console.error('Error deleting solve:', error);
    }
}

// Create timer session
async function createTimerSession() {
    try {
        const response = await fetch(`${API_BASE}/timer/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event_id: TimerState.event
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            TimerState.currentSessionId = result.session_id;
            TimerState.currentSolves = [];
        }
    } catch (error) {
        console.error('Error creating session:', error);
    }
}

// Fullscreen mode
function toggleFullscreen() {
    const timerSection = document.querySelector('.timer-section');
    
    if (!TimerState.isFullscreen) {
        timerSection.classList.add('timer-fullscreen');
        TimerState.isFullscreen = true;
        document.getElementById('fullscreen-btn').textContent = 'Exit Fullscreen (Esc)';
    } else {
        timerSection.classList.remove('timer-fullscreen');
        TimerState.isFullscreen = false;
        document.getElementById('fullscreen-btn').textContent = 'Fullscreen';
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && TimerState.isFullscreen) {
        toggleFullscreen();
    }
});

function changeTimerEvent(eventId) {
    TimerState.event = eventId;
    
    if (eventId !== '333') {
        showUnderConstruction();
    } else {
        const timerContainer = document.querySelector('.timer-main-content');
        if (timerContainer && timerContainer.querySelector('.under-construction')) {
            loadTimerTab();
        }
    }
}
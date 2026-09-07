// local-api.js - Replaces the old Flask backend. Every one of the ~40 fetch(`${API_BASE}...`)
// calls already made throughout the UI files is transparently routed here (by intercepting
// window.fetch for URLs under API_BASE) instead of hitting a server, so none of those UI
// files needed to change. Everything below reads/writes IndexedDB (via db.js) using the
// same request/response contracts the old Flask routes had, so this is effectively the old
// route files (sessions.py, cubes.py, stats.py, charts.py, analytics.py, imports.py,
// timer.py, user_settings.py) ported to run in the browser.

// ============================================================
// Data layer - core CRUD, shared by the route handlers below and by cstimer-import.js
// ============================================================

const Data = {};

function todayDateString() {
    return new Date().toISOString().slice(0, 10);
}

Data.createSession = async function (eventId = '333', notes = '', cubeId = null) {
    const session = {
        date: todayDateString(),
        event_id: eventId,
        cube_id: cubeId || null,
        solve_count: 0,
        best_single: null,
        worst_single: null,
        session_mean: null,
        ao5: null,
        ao12: null,
        notes: notes || '',
        created_at: new Date().toISOString()
    };
    return dbAdd('sessions', session);
};

Data.addSolve = async function (sessionId, timeSeconds, scramble = '', penalty = null, notes = '') {
    const existing = await dbGetAllByIndex('solves', 'session_id', sessionId);
    const solveNumber = existing.length + 1;
    const solve = {
        session_id: sessionId,
        solve_number: solveNumber,
        time_ms: Math.round((timeSeconds || 0) * 1000),
        scramble: scramble || '',
        penalty: penalty || null,
        dnf: penalty === 'DNF',
        notes: notes || '',
        timestamp: new Date().toISOString()
    };
    return dbAdd('solves', solve);
};

// One transaction instead of three (read solves, read session, write session) - this runs
// after every single solve add/delete (Timer, Sessions tab) and once per session on
// import, so it's a hot path worth keeping cheap.
Data.recomputeSessionStats = function (sessionId) {
    return dbBatch(['solves', 'sessions'], 'readwrite', (tx) => {
        tx.objectStore('solves').index('session_id').getAll(IDBKeyRange.only(sessionId)).onsuccess = (event) => {
            const solves = event.target.result.sort((a, b) => a.solve_number - b.solve_number);
            const stats = computeSessionStats(solves);
            const sessionStore = tx.objectStore('sessions');
            sessionStore.get(sessionId).onsuccess = (event2) => {
                const session = event2.target.result;
                if (!session) return;
                Object.assign(session, stats);
                sessionStore.put(session);
            };
        };
    });
};

// Adds many solves to a *freshly created, empty* session in one IndexedDB transaction
// (instead of one transaction per solve - for a real cstimer history of thousands of
// solves, one-transaction-per-record is slow enough to hang or crash the tab). `records`
// are plain {time_ms, scramble, penalty, dnf} objects; solve_number is assigned here in
// order, which is safe because the session has no existing solves yet.
Data.bulkAddSolves = function (sessionId, records) {
    return dbBatch('solves', 'readwrite', (tx) => {
        const store = tx.objectStore('solves');
        records.forEach((record, i) => {
            store.add({
                session_id: sessionId,
                solve_number: i + 1,
                time_ms: record.time_ms,
                scramble: record.scramble || '',
                penalty: record.penalty || null,
                dnf: !!record.dnf,
                notes: '',
                timestamp: new Date().toISOString()
            });
        });
    });
};

// Deletes one solve and renumbers whatever's left in that session, all in one transaction
// (a session can hold thousands of solves, so renumbering them via one dbPut() call each -
// the previous approach - was the same slow-transaction-per-record problem as import).
Data.deleteSolve = async function (solveId) {
    const solve = await dbGet('solves', solveId);
    if (!solve) return false;
    const sessionId = solve.session_id;

    await dbBatch('solves', 'readwrite', (tx) => {
        const store = tx.objectStore('solves');
        store.delete(solveId);

        const remaining = [];
        store.index('session_id').openCursor(IDBKeyRange.only(sessionId)).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                if (cursor.primaryKey !== solveId) remaining.push(cursor.value);
                cursor.continue();
                return;
            }
            remaining.sort((a, b) => a.solve_number - b.solve_number);
            remaining.forEach((rec, i) => {
                if (rec.solve_number !== i + 1) {
                    rec.solve_number = i + 1;
                    store.put(rec);
                }
            });
        };
    });

    await Data.recomputeSessionStats(sessionId);
    return true;
};

// Deletes a session and every solve in it in one transaction (same reasoning as above -
// a session's solve count can be in the thousands).
Data.deleteSession = function (sessionId) {
    return dbBatch(['solves', 'sessions'], 'readwrite', (tx) => {
        tx.objectStore('solves').index('session_id').openCursor(IDBKeyRange.only(sessionId)).onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.objectStore('sessions').delete(sessionId);
    });
};

Data.listSessions = async function () {
    const sessions = await dbGetAllCached('sessions');
    sessions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return sessions.map(s => ({
        id: s.id,
        date: s.date,
        event_id: s.event_id,
        solve_count: s.solve_count || 0,
        best_single: s.best_single != null ? round2(s.best_single / 1000) : null,
        session_mean: s.session_mean != null ? round2(s.session_mean / 1000) : null,
        ao5: s.ao5 != null ? round2(s.ao5 / 1000) : null,
        ao12: s.ao12 != null ? round2(s.ao12 / 1000) : null,
        notes: s.notes || ''
    }));
};

Data.getSessionSolvesSorted = async function (sessionId) {
    const solves = await dbGetAllByIndex('solves', 'session_id', sessionId);
    return solves.sort((a, b) => a.solve_number - b.solve_number);
};

Data.addCube = async function (cubeType, brand = '', model = '', purchaseDate = null, notes = '') {
    return dbAdd('cubes', {
        cube_type: cubeType,
        brand: brand || '',
        model: model || '',
        purchase_date: purchaseDate || null,
        notes: notes || '',
        is_active: true,
        created_at: new Date().toISOString()
    });
};

Data.listCubes = async function () {
    const cubes = await dbGetAllCached('cubes');
    cubes.sort((a, b) => (a.cube_type || '').localeCompare(b.cube_type || ''));
    return cubes.map(c => ({
        id: c.id,
        cube_type: c.cube_type,
        brand: c.brand || '',
        model: c.model || '',
        purchase_date: c.purchase_date,
        is_active: !!c.is_active,
        notes: c.notes || ''
    }));
};

Data.updateCube = async function (cubeId, fields) {
    const allowed = ['cube_type', 'brand', 'model', 'purchase_date', 'notes', 'is_active'];
    const cube = await dbGet('cubes', cubeId);
    if (!cube) return false;
    let applied = false;
    for (const key of allowed) {
        if (Object.prototype.hasOwnProperty.call(fields, key)) {
            cube[key] = key === 'is_active' ? !!fields[key] : fields[key];
            applied = true;
        }
    }
    if (!applied) return false;
    await dbPut('cubes', cube);
    return true;
};

Data.deactivateCube = async function (cubeId) {
    const cube = await dbGet('cubes', cubeId);
    if (!cube) return;
    cube.is_active = false;
    await dbPut('cubes', cube);
};

// ============================================================
// Small stats helpers (quantile/stddev) used by the chart routes
// ============================================================

function sampleStdDev(values) {
    const n = values.length;
    if (n < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1));
}

function populationStdDev(values) {
    const n = values.length;
    if (n === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / n;
    return Math.sqrt(values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n);
}

function quantile(sortedValues, q) {
    const n = sortedValues.length;
    if (n === 0) return null;
    const index = q * (n - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sortedValues[lower];
    return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

// ============================================================
// Route handlers
// ============================================================

async function routeGetEvents() {
    const sessions = await dbGetAllCached('sessions');
    const events = [...new Set(sessions.map(s => s.event_id))].sort();
    return [200, events];
}

async function routeGetStats(query) {
    const eventId = query.get('event_id') || '333';
    const sessions = await dbGetAllCached('sessions');
    const solves = await dbGetAllCached('solves');
    const sessionById = new Map(sessions.map(s => [s.id, s]));

    const relevantSolves = solves.filter(sol => {
        const sess = sessionById.get(sol.session_id);
        if (!sess) return false;
        return eventId === 'all' || sess.event_id === eventId;
    });

    const nonDnfTimes = relevantSolves.filter(s => !s.dnf).map(s => s.time_ms / 1000);
    const pb = nonDnfTimes.length ? Math.min(...nonDnfTimes) : null;
    const avg = nonDnfTimes.length ? nonDnfTimes.reduce((a, b) => a + b, 0) / nonDnfTimes.length : null;
    const totalSolves = relevantSolves.length;

    const totalSessions = sessions.filter(s => eventId === 'all' || s.event_id === eventId).length;
    const totalCubes = (await dbGetAllCached('cubes')).length;
    const activeCubes = (await dbGetAllCached('cubes')).filter(c => c.is_active).length;

    let wcaRank = null, wcaPercentile = null;
    const supportedEvents = ['222', '333', '444', '555', '666', '777', 'pyram', 'skewb', 'minx', 'sq1', 'clock'];
    if (pb && supportedEvents.includes(eventId)) {
        try {
            const result = await wcaEstimatePercentile(pb, eventId, 'single');
            if (result) {
                wcaRank = result.rank_estimate || null;
                wcaPercentile = typeof result.percentile === 'number' ? result.percentile : null;
            }
        } catch (e) { /* WCA lookup is best-effort */ }
    }

    return [200, {
        pb: pb != null ? round2(pb) : null,
        average: avg != null ? round2(avg) : null,
        total_solves: totalSolves,
        total_sessions: totalSessions,
        total_cubes: totalCubes,
        active_cubes: activeCubes,
        wca_rank: wcaRank,
        wca_percentile: wcaPercentile != null ? round2(wcaPercentile) : null,
        event_id: eventId
    }];
}

async function routeGetPbDetails(query) {
    const eventId = query.get('event_id') || '333';
    const sessions = await dbGetAllCached('sessions');
    const solves = await dbGetAllCached('solves');
    const sessionById = new Map(sessions.map(s => [s.id, s]));

    let best = null;
    for (const sol of solves) {
        if (sol.dnf) continue;
        const sess = sessionById.get(sol.session_id);
        if (!sess) continue;
        if (eventId !== 'all' && sess.event_id !== eventId) continue;
        if (!best || sol.time_ms < best.solve.time_ms) best = { solve: sol, session: sess };
    }

    if (!best) return [404, { error: 'PB solve not found' }];
    return [200, {
        session_id: best.session.id,
        date: best.session.date,
        scramble: best.solve.scramble || null,
        event_id: best.session.event_id
    }];
}

async function routeGetSessions() {
    return [200, await Data.listSessions()];
}

async function routeDeleteSession(sessionId) {
    await Data.deleteSession(sessionId);
    return [200, { success: true, message: 'Session deleted' }];
}

async function routeAddSession(body) {
    const sessionId = await Data.createSession(body.event_id || '333', body.notes || '', body.cube_id || null);
    return [200, { success: true, session_id: sessionId }];
}

async function routeGetSessionSolves(sessionId) {
    const solves = await Data.getSessionSolvesSorted(sessionId);
    return [200, solves.map(s => ({
        id: s.id,
        solve_number: s.solve_number,
        time_seconds: s.dnf ? null : round2(s.time_ms / 1000),
        scramble: s.scramble || '',
        penalty: s.penalty,
        notes: s.notes || '',
        timestamp: s.timestamp
    }))];
}

async function routeAddSolveToSession(sessionId, body) {
    await Data.addSolve(sessionId, body.time_seconds, body.scramble || '', body.penalty, body.notes || '');
    await Data.recomputeSessionStats(sessionId);
    return [200, { success: true }];
}

async function routeDeleteSolve(solveId) {
    await Data.deleteSolve(solveId);
    return [200, { success: true, message: 'Solve deleted' }];
}

async function routeGetCubes() {
    return [200, await Data.listCubes()];
}

async function routeAddCube(body) {
    if (!body.cube_type) return [400, { error: 'Cube type is required' }];
    const cubeId = await Data.addCube(body.cube_type, body.brand || '', body.model || '', body.purchase_date, body.notes || '');
    return [200, { success: true, cube_id: cubeId }];
}

async function routeUpdateCube(cubeId, body) {
    const ok = await Data.updateCube(cubeId, body || {});
    if (ok) return [200, { success: true, message: 'Cube updated' }];
    return [400, { error: 'Failed to update cube' }];
}

async function routeDeleteCube(cubeId) {
    await Data.deactivateCube(cubeId);
    return [200, { success: true, message: 'Cube deactivated' }];
}

// ---- Charts ----

async function routeChartsProgress(query) {
    const eventId = query.get('event_id') || '333';
    const sessions = (await dbGetAllCached('sessions'))
        .filter(s => s.event_id === eventId && (s.solve_count || 0) >= 5)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
        .slice(0, 500);

    if (sessions.length < 1) return [400, { error: 'Need at least 1 session for this event' }];

    const data = sessions.map(s => ({
        date: s.date,
        best: s.best_single != null ? round2(s.best_single / 1000) : null,
        mean: s.session_mean != null ? round2(s.session_mean / 1000) : null,
        ao5: s.ao5 != null ? round2(s.ao5 / 1000) : null
    }));
    return [200, { data }];
}

async function routeChartsSessionProgress(query) {
    const sessionId = parseInt(query.get('session_id'), 10);
    if (!sessionId) return [400, { error: 'Missing session_id parameter' }];

    const solves = (await Data.getSessionSolvesSorted(sessionId)).filter(s => !s.dnf).slice(0, 1000);
    if (solves.length < 1) return [400, { error: 'No solves in this session' }];

    const times = solves.map(s => s.time_ms / 1000);
    const data = times.map((time, i) => {
        let ao5 = null;
        if (i >= 4) {
            const sorted = [...times.slice(i - 4, i + 1)].sort((a, b) => a - b);
            ao5 = sorted.slice(1, 4).reduce((a, b) => a + b, 0) / 3;
        }
        const runningMean = times.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
        return {
            solve_number: solves[i].solve_number,
            time: round2(time),
            mean: round2(runningMean),
            ao5: ao5 != null ? round2(ao5) : null
        };
    });
    return [200, { data }];
}

function filterDistributionOutliers(times) {
    const stdDev = sampleStdDev(times);
    if (stdDev <= 0) return times;

    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    let filtered = times.filter(t => t >= mean - 3 * stdDev && t <= mean + 3 * stdDev);

    if (filtered.length < times.length * 0.9) {
        const sorted = [...times].sort((a, b) => a - b);
        const p1 = quantile(sorted, 0.01);
        const p99 = quantile(sorted, 0.99);
        filtered = times.filter(t => t >= p1 && t <= p99);
    }
    return filtered;
}

async function routeChartsDistribution(query) {
    const eventId = query.get('event_id') || '333';
    const sessions = await dbGetAllCached('sessions');
    const sessionIds = new Set(sessions.filter(s => s.event_id === eventId).map(s => s.id));
    const times = (await dbGetAllCached('solves'))
        .filter(s => !s.dnf && sessionIds.has(s.session_id))
        .sort((a, b) => a.time_ms - b.time_ms)
        .slice(0, 10000)
        .map(s => s.time_ms / 1000);

    if (times.length < 5) return [400, { error: 'Need at least 5 solves' }];
    return [200, { times: filterDistributionOutliers(times) }];
}

async function routeChartsSessionDistribution(query) {
    const sessionId = parseInt(query.get('session_id'), 10);
    const times = (await Data.getSessionSolvesSorted(sessionId))
        .filter(s => !s.dnf)
        .sort((a, b) => a.time_ms - b.time_ms)
        .map(s => s.time_ms / 1000);

    if (times.length < 5) return [400, { error: 'Need at least 5 solves' }];

    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const stdDev = populationStdDev(times);
    const filtered = times.filter(t => Math.abs(t - mean) <= 5 * stdDev);
    return [200, { times: filtered }];
}

async function routeChartsRollingAverage(query) {
    const eventId = query.get('event_id') || '333';
    const sessions = await dbGetAllCached('sessions');
    const sessionIds = new Set(sessions.filter(s => s.event_id === eventId).map(s => s.id));
    const solves = (await dbGetAllCached('solves'))
        .filter(s => !s.dnf && sessionIds.has(s.session_id))
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp) || b.id - a.id)
        .slice(0, 1000);
    const times = solves.map(s => s.time_ms / 1000).reverse();

    if (times.length < 12) return [400, { error: 'Need at least 12 solves' }];
    const { rolling5, rolling12 } = computeRollingAverages(times);
    return [200, { times, rolling5, rolling12 }];
}

async function routeChartsSessionRolling(query) {
    const sessionId = parseInt(query.get('session_id'), 10);
    const times = (await Data.getSessionSolvesSorted(sessionId))
        .filter(s => !s.dnf)
        .slice(0, 1000)
        .map(s => s.time_ms / 1000);

    if (times.length < 12) return [400, { error: 'Need at least 12 solves' }];
    const { rolling5, rolling12 } = computeRollingAverages(times);
    return [200, { times, rolling5, rolling12 }];
}

async function routeChartsConsistency(query) {
    const eventId = query.get('event_id') || '333';
    const qualifying = (await dbGetAllCached('sessions'))
        .filter(s => s.event_id === eventId && (s.solve_count || 0) >= 5)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    // Only the most recent 10 ever end up in the response, but a session with
    // solve_count >= 5 can still drop out below (if most of those 5+ were DNF) once we
    // recheck against actual non-DNF times - so pull a few extra candidates from the tail
    // to comfortably cover that, instead of querying every qualifying session's solves
    // (which, for someone with a long history, means running an IndexedDB query per
    // session just to throw most of the results away).
    const candidates = qualifying.slice(-15);

    const result = [];
    for (const session of candidates) {
        const times = (await Data.getSessionSolvesSorted(session.id))
            .filter(s => !s.dnf)
            .map(s => s.time_ms / 1000);
        if (times.length >= 5) result.push({ date: session.date, times });
    }

    const last10 = result.slice(-10);
    if (last10.length < 2) return [400, { error: 'Need at least 2 sessions' }];
    return [200, { sessions: last10 }];
}

// ---- Analytics ----

async function routeAnalyticsHeatmap(query) {
    const eventId = query.get('event_id') || '333';
    const sessions = (await dbGetAllCached('sessions'))
        .filter(s => s.event_id === eventId)
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .slice(0, 50);

    if (sessions.length === 0) return [404, { error: 'No sessions available' }];

    const allSolves = await dbGetAllCached('solves');
    const sessionsOut = sessions.map(s => {
        const solves = allSolves.filter(sol => sol.session_id === s.id);
        const dnfCount = solves.filter(sol => sol.dnf).length;
        const plus2Count = solves.filter(sol => sol.penalty === '+2').length;
        const count = s.solve_count || 0;
        const mean = s.session_mean, best = s.best_single;

        let speedScore = 0, consistencyScore = 0, accuracyScore = 0;
        if (mean && best) {
            const baseline = 30000;
            speedScore = Math.max(0, 100 - (mean / baseline) * 50);
            consistencyScore = mean > 0 ? (best / mean) * 100 : 0;
        }
        if (count > 0) {
            const penaltyRate = (dnfCount + plus2Count) / count;
            accuracyScore = Math.max(0, 100 - penaltyRate * 100);
        }
        const overallScore = (speedScore + consistencyScore + accuracyScore) / 3;

        return {
            session_id: s.id,
            date: s.date,
            solve_count: count,
            best: best ? round2(best / 1000) : null,
            mean: mean ? round2(mean / 1000) : null,
            ao5: s.ao5 ? round2(s.ao5 / 1000) : null,
            ao12: s.ao12 ? round2(s.ao12 / 1000) : null,
            dnf_count: dnfCount,
            plus2_count: plus2Count,
            speed_score: roundTo(speedScore, 1),
            consistency_score: roundTo(consistencyScore, 1),
            accuracy_score: roundTo(accuracyScore, 1),
            overall_score: roundTo(overallScore, 1)
        };
    });

    return [200, { sessions: sessionsOut, event_id: eventId }];
}

// ---- Import ----

async function routeImportPreview(formData) {
    const file = formData.get('file');
    if (!file) return [400, { error: 'No file provided' }];

    try {
        const data = await parseCstimerFile(file);
        const sessions = buildImportPreview(data);
        AppState._pendingImportData = data;
        return [200, { sessions, filename: file.name }];
    } catch (e) {
        return [500, { error: 'An error occurred processing the import file' }];
    }
}

async function routeImportSelected(body) {
    const selectedSessions = body.sessions || [];
    const eventId = body.event_id || '333';

    if (!AppState._pendingImportData || selectedSessions.length === 0) {
        return [400, { error: 'Missing filename or sessions' }];
    }

    try {
        const results = await importCstimerSessions(AppState._pendingImportData, selectedSessions, eventId);
        return [200, {
            success: true,
            message: `Imported ${results.total_solves} solves`,
            details: results
        }];
    } catch (e) {
        return [500, { error: 'An error occurred during import' }];
    }
}

// ---- Timer ----

async function routeTimerCreateSession(body) {
    const sessionId = await Data.createSession(body.event_id || '333', 'Live timer session', null);
    return [200, { success: true, session_id: sessionId }];
}

async function routeTimerSaveSolve(body) {
    if (!body.session_id || body.time == null) return [400, { error: 'Missing required fields' }];

    // timer.js already adds 2s client-side to `time` when penalty is '+2' (for its own
    // optimistic display). stats.js's unified computeSessionStats() also adds +2000ms for
    // any '+2' solve when averaging. Storing time_ms as the *raw* attempt time (undoing
    // the client's pre-addition here) keeps the penalty applied exactly once everywhere -
    // otherwise it would double-count for every Timer-tab '+2' solve.
    const rawTimeSeconds = body.penalty === '+2' ? body.time - 2 : body.time;
    const solveId = await Data.addSolve(body.session_id, rawTimeSeconds, body.scramble || '', body.penalty || null, '');
    // The timer path stores the explicit client dnf flag (it may differ from a penalty-derived guess).
    if (typeof body.dnf === 'boolean') {
        const solve = await dbGet('solves', solveId);
        solve.dnf = body.dnf;
        await dbPut('solves', solve);
    }
    await Data.recomputeSessionStats(body.session_id);
    return [200, { success: true, solve_id: solveId }];
}

async function routeTimerDeleteSolve(solveId) {
    const ok = await Data.deleteSolve(solveId);
    if (!ok) return [404, { error: 'Solve not found' }];
    return [200, { success: true }];
}

async function routeTimerUpdatePenalty(solveId, body) {
    const solve = await dbGet('solves', solveId);
    if (!solve) return [404, { error: 'Solve not found' }];

    const newPenalty = body.penalty || 'OK';
    solve.penalty = newPenalty;
    solve.dnf = newPenalty === 'DNF';
    await dbPut('solves', solve);
    await Data.recomputeSessionStats(solve.session_id);
    return [200, { success: true }];
}

async function routeTimerSessionSolves(sessionId) {
    const solves = (await Data.getSessionSolvesSorted(sessionId)).slice().reverse();
    const out = solves.map(s => {
        const baseTime = s.time_ms / 1000;
        const penalty = s.penalty || 'OK';
        const dnf = !!s.dnf;
        let finalTime = baseTime;
        if (penalty === '+2' && !dnf) finalTime += 2;
        return { id: s.id, time: finalTime, penalty, dnf, scramble: s.scramble || '' };
    });
    return [200, { solves: out }];
}

// ---- User settings ----

async function routeGetUserSettings() {
    const settings = await dbGet('settings', 'user');
    return [200, { wca_id: settings?.wca_id || null, wca_name: settings?.wca_name || null }];
}

async function routeUpdateUserSettings(body) {
    const wcaId = (body.wca_id || '').trim();
    if (!wcaId) return [400, { error: 'WCA ID is required' }];

    let wcaName;
    try {
        wcaName = await wcaLookupPerson(wcaId);
    } catch (e) {
        const message = e.message || 'Could not connect to WCA API. Please try again later.';
        const status = message.includes('not found') ? 404 : 500;
        return [status, { error: message }];
    }

    await dbPut('settings', { id: 'user', wca_id: wcaId, wca_name: wcaName });
    return [200, { success: true, wca_id: wcaId, wca_name: wcaName }];
}

async function routeDeleteUserSettings() {
    await dbDelete('settings', 'user');
    return [200, { success: true }];
}

// ============================================================
// Route table + fetch() interception
// ============================================================

const ROUTES = [
    ['GET', /^\/events$/, (m, q) => routeGetEvents()],
    ['GET', /^\/stats$/, (m, q) => routeGetStats(q)],
    ['GET', /^\/pb-details$/, (m, q) => routeGetPbDetails(q)],

    ['GET', /^\/sessions$/, () => routeGetSessions()],
    ['DELETE', /^\/sessions\/(\d+)$/, (m) => routeDeleteSession(+m[1])],
    ['POST', /^\/sessions\/add$/, (m, q, b) => routeAddSession(b)],
    ['GET', /^\/sessions\/(\d+)\/solves$/, (m) => routeGetSessionSolves(+m[1])],
    ['POST', /^\/sessions\/(\d+)\/solves\/add$/, (m, q, b) => routeAddSolveToSession(+m[1], b)],
    ['DELETE', /^\/solves\/(\d+)$/, (m) => routeDeleteSolve(+m[1])],

    ['GET', /^\/cubes$/, () => routeGetCubes()],
    ['POST', /^\/cubes\/add$/, (m, q, b) => routeAddCube(b)],
    ['PUT', /^\/cubes\/(\d+)$/, (m, q, b) => routeUpdateCube(+m[1], b)],
    ['DELETE', /^\/cubes\/(\d+)$/, (m) => routeDeleteCube(+m[1])],

    ['GET', /^\/charts\/progress$/, (m, q) => routeChartsProgress(q)],
    ['GET', /^\/charts\/session-progress$/, (m, q) => routeChartsSessionProgress(q)],
    ['GET', /^\/charts\/distribution$/, (m, q) => routeChartsDistribution(q)],
    ['GET', /^\/charts\/session-distribution$/, (m, q) => routeChartsSessionDistribution(q)],
    ['GET', /^\/charts\/rolling-average$/, (m, q) => routeChartsRollingAverage(q)],
    ['GET', /^\/charts\/session-rolling$/, (m, q) => routeChartsSessionRolling(q)],
    ['GET', /^\/charts\/consistency$/, (m, q) => routeChartsConsistency(q)],

    ['GET', /^\/analytics\/session-heatmap$/, (m, q) => routeAnalyticsHeatmap(q)],

    ['POST', /^\/import\/preview$/, (m, q, b, fd) => routeImportPreview(fd)],
    ['POST', /^\/import\/selected$/, (m, q, b) => routeImportSelected(b)],

    ['POST', /^\/timer\/session$/, (m, q, b) => routeTimerCreateSession(b)],
    ['POST', /^\/timer\/solve$/, (m, q, b) => routeTimerSaveSolve(b)],
    ['DELETE', /^\/timer\/solve\/(\d+)$/, (m) => routeTimerDeleteSolve(+m[1])],
    ['PUT', /^\/timer\/solve\/(\d+)\/penalty$/, (m, q, b) => routeTimerUpdatePenalty(+m[1], b)],
    ['GET', /^\/timer\/session\/(\d+)\/solves$/, (m) => routeTimerSessionSolves(+m[1])],

    ['GET', /^\/user\/settings$/, () => routeGetUserSettings()],
    ['POST', /^\/user\/settings$/, (m, q, b) => routeUpdateUserSettings(b)],
    ['DELETE', /^\/user\/settings$/, () => routeDeleteUserSettings()]
];

function makeApiResponse(status, data) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data
    };
}

async function dispatchLocalApi(method, url, options) {
    const fullUrl = new URL(url);
    const path = fullUrl.pathname.slice(API_BASE_PATH.length) || '/';
    const query = fullUrl.searchParams;

    let body = {};
    let formData = null;
    if (options && options.body instanceof FormData) {
        formData = options.body;
    } else if (options && typeof options.body === 'string' && options.body.length) {
        try { body = JSON.parse(options.body); } catch (e) { body = {}; }
    }

    for (const [routeMethod, pattern, handler] of ROUTES) {
        if (routeMethod !== method) continue;
        const match = pattern.exec(path);
        if (!match) continue;
        try {
            const [status, data] = await handler(match, query, body, formData);
            return makeApiResponse(status, data);
        } catch (e) {
            console.error(`Local API error handling ${method} ${path}:`, e);
            return makeApiResponse(500, { error: 'An unexpected error occurred' });
        }
    }

    return makeApiResponse(404, { error: 'Not found' });
}

const API_BASE_PATH = new URL(API_BASE).pathname; // "/api"
const _originalFetch = window.fetch.bind(window);

window.fetch = function (input, options) {
    const url = typeof input === 'string' ? input : input.url;
    if (typeof url === 'string' && url.startsWith(API_BASE)) {
        const method = (options && options.method ? options.method : 'GET').toUpperCase();
        return dispatchLocalApi(method, url, options);
    }
    return _originalFetch(input, options);
};

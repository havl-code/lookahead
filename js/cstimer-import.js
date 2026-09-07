// cstimer-import.js - cstimer JSON import, ported from src/python/import_cstimer.py.
//
// cstimer export format: { "session1": [[[penalty_code, time_ms], "scramble", "", timestamp], ...], ... }
// penalty_code: 0 = OK, 2000 = +2, -1 = DNF. (Despite the variable name in the original
// Python, this value is milliseconds - it's divided by 1000 to get seconds, not by 100.)
//
// Unlike the old Flask route, nothing is written to disk between "Preview" and "Import
// Selected" - the parsed JSON is just held in memory (AppState._pendingImportData, set by
// local-api.js's /import/preview handler) until the user confirms which sessions to import.

async function parseCstimerFile(file) {
    const text = await file.text();
    return JSON.parse(text);
}

function buildImportPreview(data) {
    const sessions = [];
    for (const [sessionKey, sessionData] of Object.entries(data)) {
        if (!Array.isArray(sessionData)) continue;

        const times = [];
        for (const solve of sessionData) {
            try {
                const penalty = solve[0][0];
                const timeMs = solve[0][1];
                if (penalty !== -1) times.push(timeMs / 1000);
            } catch (e) { /* skip malformed entry */ }
        }

        sessions.push({
            key: sessionKey,
            solve_count: sessionData.length,
            best: times.length ? Math.min(...times) : null,
            worst: times.length ? Math.max(...times) : null,
            mean: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null
        });
    }
    return sessions;
}

async function importCstimerSessions(data, selectedKeys, eventId = '333') {
    const selected = new Set(selectedKeys);
    let sessionsImported = 0;
    let totalSolves = 0;

    for (const [sessionKey, sessionData] of Object.entries(data)) {
        if (!selected.has(sessionKey) || !Array.isArray(sessionData)) continue;

        // Parse every solve first (cheap, synchronous, no IndexedDB involved), then write
        // them all in one batched transaction - a real cstimer history can be thousands of
        // solves per session, and adding them one fetch/transaction at a time was slow
        // enough to hang or crash the tab.
        const records = [];
        for (const solveData of sessionData) {
            try {
                const solveInfo = solveData[0];
                const scramble = solveData.length > 1 ? solveData[1] : '';
                const penaltyCode = solveInfo[0];
                const timeMs = solveInfo[1];

                let penalty, timeSeconds;
                if (penaltyCode === -1) {
                    penalty = 'DNF';
                    timeSeconds = 0;
                } else if (penaltyCode === 2000) {
                    penalty = '+2';
                    timeSeconds = timeMs / 1000;
                } else {
                    penalty = null;
                    timeSeconds = timeMs / 1000;
                }

                records.push({
                    time_ms: Math.round((timeSeconds || 0) * 1000),
                    scramble,
                    penalty,
                    dnf: penalty === 'DNF'
                });
            } catch (e) { /* skip malformed entry */ }
        }

        if (records.length === 0) continue;

        const sessionName = `CSTimer ${sessionKey} - ${todayDateString()}`;
        const sessionId = await Data.createSession(eventId, sessionName, null);
        await Data.bulkAddSolves(sessionId, records);
        await Data.recomputeSessionStats(sessionId);

        sessionsImported++;
        totalSolves += records.length;
    }

    return { sessions_imported: sessionsImported, total_solves: totalSolves };
}

// stats.js - The one canonical session-statistics algorithm (Ao5/Ao12/mean/best/worst).
//
// Ported from src/python/training_logger.py's update_session_stats, with one deliberate
// fix: a +2 penalty now adds 2000ms to a solve's time before it's averaged (matching WCA
// rules), which the old Python app only did in one of its two divergent code paths. This
// function is now the single source of truth used everywhere (Sessions tab, Timer tab,
// cstimer import).

// Effective time in ms for averaging purposes: null for DNF, raw+2000 for a '+2' penalty.
function effectiveTimeMs(solve) {
    if (solve.dnf) return null;
    return solve.penalty === '+2' ? solve.time_ms + 2000 : solve.time_ms;
}

// Average of a trimmed (drop best/worst as appropriate) window of times.
function trimmedAverage(times) {
    const sorted = [...times].sort((a, b) => a - b);
    let middle;
    if (sorted.length === 3 || sorted.length === 10) {
        middle = sorted; // no trim
    } else if (sorted.length === 4 || sorted.length === 11) {
        middle = sorted.length === 4 ? sorted.slice(1, 3) : sorted.slice(1, 11);
    } else { // 5 or 12
        middle = sorted.length === 5 ? sorted.slice(1, 4) : sorted.slice(1, 11);
    }
    return middle.reduce((a, b) => a + b, 0) / middle.length;
}

// `solves` must be sorted by solve_number ascending. Returns ms values (matches the old
// SQLite schema's storage unit); round(/1000, 2) at display time, same as before.
function computeSessionStats(solves) {
    const totalSolves = solves.length;
    const times = solves.filter(s => !s.dnf).map(effectiveTimeMs);

    let bestSingle = null, worstSingle = null, sessionMean = null;
    if (times.length > 0) {
        bestSingle = Math.min(...times);
        worstSingle = Math.max(...times);
        sessionMean = times.reduce((a, b) => a + b, 0) / times.length;
    }

    let ao5 = null;
    if (totalSolves >= 5) {
        const last5Times = solves.slice(-5).filter(s => !s.dnf).map(effectiveTimeMs);
        if (last5Times.length >= 3) ao5 = trimmedAverage(last5Times);
    }

    let ao12 = null;
    if (totalSolves >= 12) {
        const last12Times = solves.slice(-12).filter(s => !s.dnf).map(effectiveTimeMs);
        if (last12Times.length >= 10) ao12 = trimmedAverage(last12Times);
    }

    return {
        solve_count: totalSolves,
        best_single: bestSingle,
        worst_single: worstSingle,
        session_mean: sessionMean,
        ao5,
        ao12
    };
}

// Rolling (non-trimmed, straight mean of the trailing window) Ao5/Ao12 used by the
// rolling-average chart - intentionally a different, simpler formula than the trimmed
// session-stat Ao5/Ao12 above (this mirrors the original charts.py behavior).
function computeRollingAverages(times) {
    const rolling5 = [];
    const rolling12 = [];
    for (let i = 0; i < times.length; i++) {
        rolling5.push(i >= 4 ? times.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5 : null);
        rolling12.push(i >= 11 ? times.slice(i - 11, i + 1).reduce((a, b) => a + b, 0) / 12 : null);
    }
    return { rolling5, rolling12 };
}

function roundTo(value, decimals = 2) {
    if (value === null || value === undefined) return null;
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

function round2(value) {
    return roundTo(value, 2);
}

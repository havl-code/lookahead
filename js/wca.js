// wca.js - WCA rank/percentile estimation + WCA ID -> name lookup.
//
// Rankings come from the community-run "Unofficial WCA Public API"
// (https://wca-rest-api.robiningelbrecht.be/) - the WCA itself has no official rankings
// endpoint (its v0 API only covers OAuth/competition data), and the WCA's own developer
// docs point people at this project for exactly this. It republishes the official WCA
// results export as static JSON files on GitHub, refreshed daily.
//
// Both endpoints below are public, CORS-friendly GETs fetched directly from the browser;
// rankings are cached in IndexedDB (24h TTL) instead of the old data/cache/wca_*.json
// files. These are the only two features in the app that need internet access -
// everything else works fully offline.

// NOTE: this moved from the `master` branch/`/api` path to the `v1` branch in 2025 - if
// rankings ever silently stop loading again, check https://wca-rest-api.robiningelbrecht.be/
// for the current base path before assuming the app itself is broken.
const WCA_RANKINGS_BASE = 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1';
const WCA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

async function wcaGetJSON(path) {
    const cached = await dbGet('wca_cache', path);
    if (cached && (Date.now() - cached.fetched_at) < WCA_CACHE_TTL_MS) {
        return cached.data;
    }

    const response = await fetch(`${WCA_RANKINGS_BASE}/${path}`);
    if (!response.ok) {
        if (cached) return cached.data; // stale cache beats nothing
        return null;
    }
    const data = await response.json();
    await dbPut('wca_cache', { path, data, fetched_at: Date.now() });
    return data;
}

async function wcaGetRankings(region, type, event) {
    const data = await wcaGetJSON(`rank/${region}/${type}/${event}.json`);
    return {
        items: (data && data.items) || [],
        // Real count of everyone ranked for this event (not just the 1000-row page) -
        // a much better denominator for the percentile estimate below than a guess.
        total: (data && data.total) || null
    };
}

// Fallback: approximate percentile table when live rankings can't be fetched.
function wcaApproximatePercentile(timeSeconds) {
    const percentileMap = [
        [6, 0.01, 'Elite (World-class)'],
        [8, 0.1, 'Elite (National champion level)'],
        [10, 1, 'Advanced (Continental finalist)'],
        [12, 5, 'Advanced (Regional finalist)'],
        [15, 15, 'Intermediate (Very fast)'],
        [20, 40, 'Intermediate (Fast)'],
        [25, 60, 'Beginner-Intermediate (Above average)'],
        [30, 75, 'Beginner (Average competitor)'],
        [40, 90, 'Beginner (Learning)']
    ];

    for (const [threshold, pct, desc] of percentileMap) {
        if (timeSeconds <= threshold) {
            return { percentile: pct, rank_estimate: null, description: desc };
        }
    }
    return { percentile: 95, rank_estimate: null, description: 'Beginner' };
}

// Estimate rank/percentile by comparing to live WCA rankings (top-1000 exact match +
// statistical extrapolation beyond that), verbatim port of estimate_percentile().
async function wcaEstimatePercentile(timeSeconds, event = '333', type = 'single', region = 'world') {
    let items = [], apiTotal = null;
    try {
        ({ items, total: apiTotal } = await wcaGetRankings(region, type, event));
    } catch (e) { /* fall through to the approximate table below */ }

    if (!items || items.length === 0) {
        return wcaApproximatePercentile(timeSeconds);
    }

    // The API always returns the ranked time in the `best` field, single or average alike.
    const times = items
        .map(r => r.best || 0)
        .filter(t => t > 0)
        .map(t => t / 100);

    if (times.length === 0) {
        return wcaApproximatePercentile(timeSeconds);
    }

    const fasterCount = times.filter(t => t < timeSeconds).length;
    const totalRanked = times.length;
    const estimatedTotal = apiTotal || 200000; // real ranked-competitor count when available

    if (fasterCount >= totalRanked) {
        let estimatedRank;
        const lastTime = times[times.length - 1];
        if (timeSeconds < 10) {
            estimatedRank = Math.round(1000 + (timeSeconds - lastTime) * 2000);
        } else if (timeSeconds < 15) {
            estimatedRank = Math.round(5000 + (timeSeconds - 10) * 5000);
        } else if (timeSeconds < 20) {
            estimatedRank = Math.round(30000 + (timeSeconds - 15) * 10000);
        } else if (timeSeconds < 30) {
            estimatedRank = Math.round(80000 + (timeSeconds - 20) * 8000);
        } else {
            estimatedRank = Math.round(150000 + (timeSeconds - 30) * 2000);
        }
        estimatedRank = Math.min(estimatedRank, estimatedTotal);
        return {
            percentile: (estimatedRank / estimatedTotal) * 100,
            rank_estimate: estimatedRank
        };
    }

    return {
        percentile: (fasterCount / estimatedTotal) * 100,
        rank_estimate: fasterCount + 1
    };
}

// WCA ID -> name lookup, used by the dashboard greeting. Calls the official WCA API
// directly (public, CORS-friendly GET endpoint).
async function wcaLookupPerson(wcaId) {
    const response = await fetch(`https://www.worldcubeassociation.org/api/v0/persons/${encodeURIComponent(wcaId)}`, {
        headers: { 'Accept': 'application/json' }
    });

    if (response.status === 404) {
        throw new Error('WCA ID not found. Please check the ID and try again.');
    }
    if (!response.ok) {
        throw new Error('Could not validate WCA ID. Please try again later.');
    }

    const personData = await response.json();
    const name = personData?.person?.name;
    if (!name) {
        throw new Error('Could not fetch name for this WCA ID');
    }
    return name;
}

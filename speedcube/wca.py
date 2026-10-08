"""WCA rank/percentile estimation, and looking up a competitor's name from their WCA ID.

Rankings come from the community-run "Unofficial WCA Public API"
(https://wca-rest-api.robiningelbrecht.be/). The WCA itself has no official rankings
endpoint (its v0 API only covers OAuth and competition data), and the WCA's own developer
docs point people at this project for exactly this. It republishes the official WCA results
export as static JSON files on GitHub, refreshed daily. Rankings are cached in the database
for 24 hours.

These are the only two features in the app that need internet access. Everything else
works fully offline.
"""

import http.client
import json
import time
import urllib.error
import urllib.parse
import urllib.request

from .stats import round_half_up

# NOTE: this moved from the `master` branch and `/api` path to the `v1` branch in 2025. If
# rankings ever silently stop loading again, check https://wca-rest-api.robiningelbrecht.be/
# for the current base path before assuming the app itself is broken.
RANKINGS_BASE = 'https://raw.githubusercontent.com/robiningelbrecht/wca-rest-api/refs/heads/v1'
PERSONS_API = 'https://www.worldcubeassociation.org/api/v0/persons/'
CACHE_TTL_SECONDS = 24 * 60 * 60
REQUEST_TIMEOUT_SECONDS = 10
USER_AGENT = (
    'speedcube-training-explorer (+https://github.com/havl-code/speedcube-training-explorer)'
)

# Everything that can go wrong fetching or decoding a JSON URL: network errors and HTTP error
# statuses (OSError), a broken connection mid-response (HTTPException), or bad JSON (ValueError).
FETCH_ERRORS = (OSError, http.client.HTTPException, ValueError)


class WCALookupError(Exception):
    def __init__(self, message, status):
        super().__init__(message)
        self.status = status


def _fetch_json(url):
    headers = {'Accept': 'application/json', 'User-Agent': USER_AGENT}
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
        return json.load(response)


def _get_cached_json(conn, path):
    cached = conn.execute(
        'SELECT data, fetched_at FROM wca_cache WHERE path = ?', (path,)
    ).fetchone()
    if cached and time.time() - cached['fetched_at'] < CACHE_TTL_SECONDS:
        return json.loads(cached['data'])

    try:
        data = _fetch_json(f'{RANKINGS_BASE}/{path}')
    except FETCH_ERRORS:
        return json.loads(cached['data']) if cached else None  # stale cache beats nothing

    with conn:
        conn.execute(
            'INSERT OR REPLACE INTO wca_cache (path, data, fetched_at) VALUES (?, ?, ?)',
            (path, json.dumps(data), time.time()),
        )
    return data


def get_rankings(conn, region, rank_type, event):
    """(top-1000 ranking rows, total number of people ranked for this event or None)."""
    data = _get_cached_json(conn, f'rank/{region}/{rank_type}/{event}.json')
    if not isinstance(data, dict):
        return [], None
    # `total` is the real count of everyone ranked (not just this 1000-row page), which is a
    # much better denominator for the percentile estimate below than a guess.
    return data.get('items') or [], data.get('total') or None


def approximate_percentile(time_seconds):
    """Fallback percentile table for when live rankings can't be fetched."""
    percentile_map = [
        (6, 0.01, 'Elite (World-class)'),
        (8, 0.1, 'Elite (National champion level)'),
        (10, 1, 'Advanced (Continental finalist)'),
        (12, 5, 'Advanced (Regional finalist)'),
        (15, 15, 'Intermediate (Very fast)'),
        (20, 40, 'Intermediate (Fast)'),
        (25, 60, 'Beginner-Intermediate (Above average)'),
        (30, 75, 'Beginner (Average competitor)'),
        (40, 90, 'Beginner (Learning)'),
    ]
    for threshold, percentile, description in percentile_map:
        if time_seconds <= threshold:
            return {'percentile': percentile, 'rank_estimate': None, 'description': description}
    return {'percentile': 95, 'rank_estimate': None, 'description': 'Beginner'}


def estimate_percentile(conn, time_seconds, event='333', rank_type='single', region='world'):
    """Estimate world rank/percentile by comparing against live WCA rankings: an exact count
    within the top 1000, statistical extrapolation beyond that."""
    items, api_total = get_rankings(conn, region, rank_type, event)

    # The API always returns the ranked time (in centiseconds) in `best`, single or average alike.
    times = [best / 100 for best in (item.get('best') or 0 for item in items) if best > 0]
    if not times:
        return approximate_percentile(time_seconds)

    faster_count = sum(1 for t in times if t < time_seconds)
    estimated_total = api_total or 200000

    if faster_count >= len(times):
        last_time = times[-1]
        if time_seconds < 10:
            estimated_rank = round_half_up(1000 + (time_seconds - last_time) * 2000)
        elif time_seconds < 15:
            estimated_rank = round_half_up(5000 + (time_seconds - 10) * 5000)
        elif time_seconds < 20:
            estimated_rank = round_half_up(30000 + (time_seconds - 15) * 10000)
        elif time_seconds < 30:
            estimated_rank = round_half_up(80000 + (time_seconds - 20) * 8000)
        else:
            estimated_rank = round_half_up(150000 + (time_seconds - 30) * 2000)
        estimated_rank = min(estimated_rank, estimated_total)
        return {
            'percentile': estimated_rank / estimated_total * 100,
            'rank_estimate': estimated_rank,
        }

    return {'percentile': faster_count / estimated_total * 100, 'rank_estimate': faster_count + 1}


def lookup_person(wca_id):
    """The competitor's name for a WCA ID, from the official WCA API. Raises WCALookupError,
    with 404 for an ID the WCA doesn't know and 502 (a bad gateway) when the WCA's side fails,
    since the problem is out there rather than in this app."""
    try:
        data = _fetch_json(PERSONS_API + urllib.parse.quote(wca_id, safe=''))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise WCALookupError('WCA ID not found. Please check the ID and try again.', 404) from e
        raise WCALookupError('Could not validate WCA ID. Please try again later.', 502) from e
    except ValueError as e:  # the reply arrived but wasn't JSON
        raise WCALookupError("The WCA website's reply couldn't be read. Please try again later.",
                             502) from e
    except FETCH_ERRORS as e:
        raise WCALookupError('Could not connect to WCA API. Please try again later.', 502) from e

    person = data.get('person') if isinstance(data, dict) else None
    name = person.get('name') if isinstance(person, dict) else None
    if not name:
        raise WCALookupError('Could not fetch name for this WCA ID', 502)
    return name

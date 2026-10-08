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

import bisect
import http.client
import json
import time
import urllib.error
import urllib.parse
import urllib.request

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


def estimate_rank(conn, time_seconds, event='333', rank_type='single', region='world'):
    """Where a time would rank, from the live rankings.

    The rankings list the fastest 1,000 people in each event, plus the total number ranked.
    Within those 1,000 the rank is exact: one more than the number of people strictly faster
    (so ties share a rank, as in WCA rankings), and the percentile is that rank out of everyone
    ranked. Beyond the 1,000th there's nothing sound to estimate from (the field spreads out
    differently in every event), so the answer is only that the time is outside the top 1,000.
    Without any rankings (offline, with nothing cached) the answer is None.

    Returns {'rank', 'percentile', 'outside_top'}: rank and percentile are None outside the
    listed times, and outside_top is how many are listed then (else None).
    """
    items, total = get_rankings(conn, region, rank_type, event)
    # The ranked time is in centiseconds in `best`, for singles and averages alike. Sorting
    # means the order the rows arrive in doesn't matter.
    times = sorted(best / 100 for best in (item.get('best') or 0 for item in items) if best > 0)
    if not times:
        return None

    faster = bisect.bisect_left(times, time_seconds)
    if faster < len(times) or (total is not None and total <= len(times)):
        # Within the listed times, or the list is everyone ranked (so even slower than all of
        # them is a real rank)
        rank = faster + 1
        percentile = min(100.0, rank / total * 100) if total else None
        return {'rank': rank, 'percentile': percentile, 'outside_top': None}
    return {'rank': None, 'percentile': None, 'outside_top': len(times)}


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

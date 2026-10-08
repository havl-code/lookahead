"""wca.py: the rankings cache, the rank estimate, and the WCA ID lookup. The network is always
faked (see the fake_wca fixture in conftest.py)."""

import io
import types
import urllib.error
import urllib.request

import pytest

from speedcube import wca

RANKING = 'rank/world/single/333.json'


def clock(monkeypatch, now):
    """Pretend the time is `now` (seconds since the epoch) inside wca.py."""
    monkeypatch.setattr(wca, 'time', types.SimpleNamespace(time=lambda: now))


def test_fetch_json_identifies_the_app_and_gives_up_after_a_while(monkeypatch):
    seen = {}

    def fake_urlopen(request, timeout):
        seen.update(url=request.full_url, headers=dict(request.header_items()), timeout=timeout)
        return io.BytesIO(b'{"ok": true}')

    monkeypatch.setattr(urllib.request, 'urlopen', fake_urlopen)
    assert wca._real_fetch_json('https://example.org/x.json') == {'ok': True}
    assert seen['url'] == 'https://example.org/x.json'
    assert seen['headers']['User-agent'] == wca.USER_AGENT
    assert seen['headers']['Accept'] == 'application/json'
    assert seen['timeout'] == wca.REQUEST_TIMEOUT_SECONDS


class TestRankingsCache:
    def test_a_second_lookup_uses_the_cache(self, conn, fake_wca):
        fake_wca.replies[RANKING] = {'items': [{'best': 500}], 'total': 10}
        assert wca.get_rankings(conn, 'world', 'single', '333') == ([{'best': 500}], 10)
        assert wca.get_rankings(conn, 'world', 'single', '333') == ([{'best': 500}], 10)
        assert len(fake_wca.calls) == 1
        assert fake_wca.calls[0] == f'{wca.RANKINGS_BASE}/{RANKING}'

    def test_the_cache_expires_after_24_hours(self, conn, fake_wca, monkeypatch):
        fake_wca.replies[RANKING] = {'items': [{'best': 500}], 'total': 10}
        clock(monkeypatch, 1_000_000)
        wca.get_rankings(conn, 'world', 'single', '333')
        clock(monkeypatch, 1_000_000 + wca.CACHE_TTL_SECONDS - 1)
        wca.get_rankings(conn, 'world', 'single', '333')
        assert len(fake_wca.calls) == 1
        fake_wca.replies[RANKING] = {'items': [{'best': 400}], 'total': 11}
        clock(monkeypatch, 1_000_000 + wca.CACHE_TTL_SECONDS + 1)
        assert wca.get_rankings(conn, 'world', 'single', '333') == ([{'best': 400}], 11)
        assert len(fake_wca.calls) == 2

    def test_a_stale_cache_beats_nothing(self, conn, fake_wca, monkeypatch):
        fake_wca.replies[RANKING] = {'items': [{'best': 500}], 'total': 10}
        clock(monkeypatch, 1_000_000)
        wca.get_rankings(conn, 'world', 'single', '333')
        fake_wca.replies[RANKING] = OSError('offline')
        clock(monkeypatch, 1_000_000 + 3 * wca.CACHE_TTL_SECONDS)
        assert wca.get_rankings(conn, 'world', 'single', '333') == ([{'best': 500}], 10)

    def test_no_cache_and_no_connection(self, conn, fake_wca):
        fake_wca.replies[RANKING] = urllib.error.URLError('offline')
        assert wca.get_rankings(conn, 'world', 'single', '333') == ([], None)

    def test_an_unexpected_reply(self, conn, fake_wca):
        fake_wca.replies[RANKING] = ['not', 'a', 'ranking']
        assert wca.get_rankings(conn, 'world', 'single', '333') == ([], None)

    def test_a_missing_total(self, conn, fake_wca):
        fake_wca.replies[RANKING] = {'items': [{'best': 500}]}
        assert wca.get_rankings(conn, 'world', 'single', '333') == ([{'best': 500}], None)


class TestEstimate:
    def test_rank_within_the_top_1000(self, conn, fake_wca):
        fake_wca.replies[RANKING] = {'items': [{'best': t} for t in (500, 600, 700, 800)], 'total': 1000}
        assert wca.estimate_percentile(conn, 6.5, '333')['rank_estimate'] == 3

    def test_ties_share_a_rank(self, conn, fake_wca):
        fake_wca.replies[RANKING] = {'items': [{'best': t} for t in (500, 600, 600, 800)], 'total': 1000}
        assert wca.estimate_percentile(conn, 6.0, '333')['rank_estimate'] == 2

    def test_rows_without_a_time_are_ignored(self, conn, fake_wca):
        fake_wca.replies[RANKING] = {'items': [{'best': 500}, {'best': 0}, {}, {'best': 700}],
                                     'total': 1000}
        assert wca.estimate_percentile(conn, 6.0, '333')['rank_estimate'] == 2


class TestLookupPerson:
    URL_END = 'persons/2003POCH01'

    def test_finds_the_name(self, fake_wca):
        fake_wca.replies[self.URL_END] = {'person': {'name': 'Test Person'}}
        assert wca.lookup_person('2003POCH01') == 'Test Person'
        assert fake_wca.calls == [wca.PERSONS_API + '2003POCH01']

    def test_the_id_is_escaped_in_the_url(self, fake_wca):
        fake_wca.replies['persons/ab%2Fcd'] = {'person': {'name': 'X'}}
        wca.lookup_person('ab/cd')
        assert fake_wca.calls[-1].endswith('persons/ab%2Fcd')

    @pytest.mark.parametrize('error, status, message', [
        (urllib.error.HTTPError('u', 404, 'Not Found', {}, None), 404, 'WCA ID not found'),
        (urllib.error.HTTPError('u', 500, 'Server Error', {}, None), 500, 'Could not validate'),
        (urllib.error.URLError('offline'), 500, 'Could not connect'),
        (TimeoutError('slow'), 500, 'Could not connect'),
    ])
    def test_errors(self, fake_wca, error, status, message):
        fake_wca.replies[self.URL_END] = error
        with pytest.raises(wca.WCALookupError, match=message) as raised:
            wca.lookup_person('2003POCH01')
        assert raised.value.status == status

    @pytest.mark.parametrize('reply', [{'person': {}}, {'person': 'x'}, {}, []])
    def test_a_reply_without_a_name(self, fake_wca, reply):
        fake_wca.replies[self.URL_END] = reply
        with pytest.raises(wca.WCALookupError, match='Could not fetch name') as raised:
            wca.lookup_person('2003POCH01')
        assert raised.value.status == 500

"""The Analytics scores route (/api/analytics/session-heatmap)."""

import json

from helpers import PROJECT_DIR, seed_session

URL = '/api/analytics/session-heatmap?event_id='
REFERENCE = json.loads((PROJECT_DIR / 'speedcube' / 'wca_reference.json').read_text(encoding='utf-8'))


def steady(n, start=12000):
    """n results (seconds) that vary a little, like a real session."""
    return [(start + (i * 733) % 3000) / 1000 for i in range(n)]


def test_no_sessions(client):
    response = client.get(URL + '333')
    assert response.status_code == 404 and response.get_json() == {'error': 'No sessions available'}


def test_scores_and_reference_details(app, client):
    seed_session(app, steady(25))
    data = client.get(URL + '333').get_json()
    session = data['sessions'][0]
    assert all(0 <= session[k] <= 100 for k in ('speed_score', 'consistency_score', 'overall_score'))
    assert session['typical_result'] is not None and session['spread_percent'] is not None
    assert (data['has_speed_reference'], data['has_consistency_reference']) == (True, True)
    assert (data['result_kind'], data['solves_per_round'], data['min_pairs']) == ('average', 5, 20)
    assert data['reference_date'] == REFERENCE['export_date']
    assert 'World Cube Association' in data['wca_notice']


def test_short_sessions_get_speed_only(app, client):
    seed_session(app, steady(6))
    session = client.get(URL + '333').get_json()['sessions'][0]
    assert session['speed_score'] is not None
    assert session['consistency_score'] is None and session['overall_score'] is None


def test_newest_first_and_at_most_50(app, client):
    ids = [seed_session(app, steady(5), date=f'2026-{1 + i // 28:02d}-{1 + i % 28:02d}') for i in range(55)]
    sessions = client.get(URL + '333').get_json()['sessions']
    assert len(sessions) == 50 and sessions[0]['session_id'] == ids[-1]


def test_mean_of_3_and_best_of_3_events(app, client):
    seed_session(app, [90, 95, 100], event='777')
    seed_session(app, [60, 'DNF', 70], event='333bf')
    assert client.get(URL + '777').get_json()['solves_per_round'] == 3
    blind = client.get(URL + '333bf').get_json()
    assert blind['result_kind'] == 'best' and blind['sessions'][0]['typical_result'] == 60.0


def test_events_without_a_reference(app, client):
    seed_session(app, [600, 700, 650, 620, 610], event='333mbf')
    data = client.get(URL + '333mbf').get_json()
    assert (data['has_speed_reference'], data['has_consistency_reference']) == (False, False)
    assert data['sessions'][0]['speed_score'] is None

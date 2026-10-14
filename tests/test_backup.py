"""backup.py: exporting everything to one JSON file and restoring from one."""

from contextlib import closing

import pytest

from helpers import query, seed_cube, seed_session
from speedcube import backup, create_app, db


def export(app):
    with closing(db.connect(app.config['DATABASE'])) as conn:
        return backup.export_backup(conn)


def restore(app, payload):
    conn = db.connect(app.config['DATABASE'])
    try:
        with conn:
            backup.restore_backup(conn, payload)
    finally:
        conn.close()


def without_time(payload):
    return {k: v for k, v in payload.items() if k != 'exported_at'}


class TestExport:
    def test_format(self, app):
        seed_cube(app)
        seed_session(app, [10, 'DNF'])
        payload = export(app)
        assert payload['app'] == 'lookahead' and payload['version'] == 1
        assert {len(payload[k]) for k in ('cubes', 'sessions')} == {1}
        assert len(payload['solves']) == 2
        assert payload['cubes'][0]['is_active'] is True
        assert [s['dnf'] for s in payload['solves']] == [False, True]


class TestRestore:
    def test_round_trip(self, app, tmp_path):
        seed_cube(app, active=False)
        seed_session(app, [10, (11, '+2'), 'DNF', 12, 13, 14], cube_id=1, notes='hi')
        original = export(app)
        other = create_app(tmp_path / 'other.db')
        restore(other, original)
        assert without_time(export(other)) == without_time(original)

    def test_restores_a_3_0_backup(self, app, backup_v3):
        restore(app, backup_v3)
        assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 7}]
        assert query(app, 'SELECT wca_id, wca_name FROM settings') == [
            {'wca_id': '2003POCH01', 'wca_name': 'Test Person'}]

    def test_restores_a_backup_under_the_old_name(self, app, backup_v3):
        assert backup_v3['app'] == 'speedcube-training-explorer'
        restore(app, backup_v3)
        assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 7}]

    def test_rejects_a_backup_from_another_app(self, app, backup_v3):
        with pytest.raises(backup.InvalidBackup, match='another app'):
            restore(app, {**backup_v3, 'app': 'cstimer'})

    def test_restores_a_2x_backup_and_recomputes_its_stats(self, app, backup_v2):
        restore(app, backup_v2)
        s = query(app, 'SELECT * FROM sessions')[0]
        # Results 10, 14 (12 + 2), DNF, 11, 13: the stale 2.x Ao5 of 11 becomes the WCA one
        assert (s['solve_count'], s['best_single'], s['worst_single']) == (5, 10000, 14000)
        assert s['session_mean'] == 12000
        assert s['ao5'] == pytest.approx((11000 + 13000 + 14000) / 3)
        assert query(app, 'SELECT id, is_active FROM cubes ORDER BY id') == [
            {'id': 1, 'is_active': 1}, {'id': 2, 'is_active': 0}]
        assert query(app, 'SELECT wca_id, wca_name FROM settings') == [
            {'wca_id': '2009ZEMD01', 'wca_name': None}]

    def test_replaces_everything(self, app, backup_v3):
        seed_session(app, [99] * 3, event='777')
        restore(app, backup_v3)
        assert query(app, "SELECT COUNT(*) AS n FROM sessions WHERE event_id = '777'") == [{'n': 0}]

    def test_without_settings_the_wca_id_goes(self, app, backup_v3):
        restore(app, backup_v3)
        restore(app, {**backup_v3, 'settings': None})
        assert query(app, 'SELECT * FROM settings') == []

    @pytest.mark.parametrize('payload', [
        'not an object',
        [],
        {'cubes': [], 'sessions': []},
        {'cubes': [], 'sessions': 'x', 'solves': []},
        {'cubes': [1], 'sessions': [], 'solves': []},
    ])
    def test_rejects_invalid_payloads(self, app, payload):
        with pytest.raises(backup.InvalidBackup):
            restore(app, payload)

    def test_a_failed_restore_changes_nothing(self, app):
        sid = seed_session(app, [10, 11])
        # Cubes and sessions are cleared before the bad solves list is found, so this checks
        # the whole restore is rolled back
        with pytest.raises(backup.InvalidBackup):
            restore(app, {'cubes': [], 'sessions': [], 'solves': ['bad']})
        assert query(app, 'SELECT id FROM sessions') == [{'id': sid}]
        assert query(app, 'SELECT COUNT(*) AS n FROM solves') == [{'n': 2}]

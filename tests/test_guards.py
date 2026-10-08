"""The safety net itself: no test can open the real data or reach the internet."""

import urllib.request

import pytest

import app as app_module
from helpers import REAL_DATA
from speedcube import db, wca


def test_opening_a_database_in_data_fails():
    # A folder that doesn't exist, so even if the guard failed, SQLite couldn't create anything
    with pytest.raises(AssertionError, match='real data'):
        db.connect(REAL_DATA / 'no-such-folder' / 'guard-check.db')


def test_app_py_points_at_a_temporary_database():
    assert REAL_DATA not in app_module.DATABASE.resolve().parents


def test_the_wca_apis_are_out_of_reach():
    with pytest.raises(AssertionError, match='network'):
        wca._fetch_json('https://www.worldcubeassociation.org/api/v0/persons/2003POCH01')


def test_urlopen_is_out_of_reach():
    with pytest.raises(AssertionError, match='network'):
        urllib.request.urlopen('http://127.0.0.1:8577/api/app')

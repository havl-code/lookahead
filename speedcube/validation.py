"""Checking what the page sends before anything is stored.

Every route that stores something checks it here first, so a bad value gets a clear message (a
400, or a 404 for something that doesn't exist) rather than a 500 or quietly bad data. The
limits are generous: they're there to catch mistakes, not to get in anyone's way.
"""

import math
import re
from datetime import date

from .events import EVENTS

# A practice limit, not a WCA rule. The WCA's default time limit is 10 minutes an attempt
# (Regulation A1a1) and its longest is 60 minutes, for Multi-Blind (H1b), but a practice solve,
# such as a first 7x7x7, can take longer than any competition would allow.
MAX_SOLVE_SECONDS = 2 * 60 * 60
PENALTIES = ('OK', '+2', 'DNF')
MAX_NOTES = 1000
MAX_SCRAMBLE = 2000
MAX_CUBE_TEXT = 200
# Four digits (the year of the first competition), four letters, and two digits
WCA_ID = re.compile(r'\d{4}[A-Z]{4}\d{2}')
ISO_DATE = re.compile(r'\d{4}-\d{2}-\d{2}')


class ValidationError(Exception):
    """A value the app can't store, with the message the page shows and the HTTP status."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def solve_time(value, allow_zero=False):
    """A solve time in seconds: a finite number above 0 and no more than 2 hours. A DNF may be
    0, since a solve that never started (an inspection DNF) has no time."""
    if value is None or value == '':
        raise ValidationError('A time is required.')
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError('A time must be a number of seconds.')
    if not math.isfinite(value):
        raise ValidationError('A time must be a number of seconds.')
    if value < 0 or (value == 0 and not allow_zero):
        raise ValidationError('A time must be more than 0 seconds.')
    if value > MAX_SOLVE_SECONDS:
        raise ValidationError('A solve can be at most 2 hours long.')
    return float(value)


def penalty(value):
    """'OK', '+2', or 'DNF'. Leaving it out means OK."""
    if value is None or value == '':
        return 'OK'
    if value not in PENALTIES:
        raise ValidationError('A penalty must be OK, +2, or DNF.')
    return value


def event(value, default='333'):
    if value is None or value == '':
        return default
    if value not in EVENTS:
        raise ValidationError('That event is not one the app knows.')
    return value


def text(value, field, limit, required=False):
    """Optional text, trimmed, up to `limit` characters."""
    if value is None:
        value = ''
    if not isinstance(value, str):
        raise ValidationError(f'{field} must be text.')
    value = value.strip()
    if required and not value:
        raise ValidationError(f'{field} is required.')
    if len(value) > limit:
        raise ValidationError(f'{field} can be at most {limit} characters.')
    return value


def iso_date(value, field='Date', today=None, required=False):
    """A YYYY-MM-DD date, or None when left blank and not required. With `today`, a date after
    it is refused."""
    if value is None or value == '':
        if required:
            raise ValidationError(f'{field} is required.')
        return None
    if not isinstance(value, str) or not ISO_DATE.fullmatch(value):
        raise ValidationError(f'{field} must be a date written as YYYY-MM-DD.')
    try:
        parsed = date.fromisoformat(value)
    except ValueError:
        raise ValidationError(f'{field} is not a real date.') from None
    if today is not None and parsed > date.fromisoformat(today):
        raise ValidationError(f"{field} can't be in the future.")
    return value


def wca_id(value):
    """A WCA ID in capitals, such as 2003POCH01."""
    value = str(value or '').strip().upper()
    if not value:
        raise ValidationError('WCA ID is required')
    if not WCA_ID.fullmatch(value):
        raise ValidationError('A WCA ID is four digits, four letters, and two digits, '
                              'such as 2003POCH01.')
    return value


def record_id(value, field):
    """An id sent by the page (a number, or digits as text, as a menu sends it), or None."""
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise ValidationError(f'{field} must be a number.')
    if isinstance(value, str) and value.isdigit():
        value = int(value)
    if not isinstance(value, int) or value < 1:
        raise ValidationError(f'{field} must be a number.')
    return value


def require(conn, table, record, what):
    """Make sure a row with this id exists, or answer 404."""
    if record is None or conn.execute(f'SELECT 1 FROM {table} WHERE id = ?', (record,)).fetchone() is None:
        raise ValidationError(f'{what} not found', 404)
    return record

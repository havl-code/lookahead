"""tools/build_pwa_golden.py: the phone app's golden files hold what the Python code gives now.

The phone app's tests compare its stats and backups with these files, so a change to the desktop
app's stats or backups that left them out of date would let the two apps drift apart unnoticed.
"""

import importlib.util

from helpers import PROJECT_DIR

spec = importlib.util.spec_from_file_location('build_pwa_golden', PROJECT_DIR / 'tools' / 'build_pwa_golden.py')
build_pwa_golden = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build_pwa_golden)


def test_golden_files_are_up_to_date():
    for path, text in build_pwa_golden.build().items():
        assert path.read_text(encoding='utf-8') == text, (
            f'{path.relative_to(PROJECT_DIR)} is out of date: run uv run tools/build_pwa_golden.py')

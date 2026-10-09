"""Accessibility checks that don't need a browser: everything clickable is something a keyboard
can reach, and the text colours meet WCAG 2.1 AA contrast (1.4.3: at least 4.5:1) in both
themes. The keyboard itself is tested in tests/e2e/test_keyboard.py."""

import re

import pytest

from helpers import PROJECT_DIR

WEB = PROJECT_DIR / 'web'
CSS = (WEB / 'css' / 'style.css').read_text(encoding='utf-8')


def test_everything_clickable_is_a_button_link_or_field():
    """A click handler on a div or span can't be reached with Tab, so actions belong on buttons,
    links, and form fields."""
    found = []
    for path in (WEB / 'index.html', *sorted((WEB / 'js').glob('*.js'))):
        text = path.read_text(encoding='utf-8')
        for tag, action in re.findall(r'<([a-z0-9]+)\b[^>]*?data-(?:action|change)="([^"]+)"', text, re.S):
            if tag not in ('button', 'a', 'select', 'input', 'form'):
                found.append(f'{path.name}: <{tag}> {action}')
    assert found == []


def test_the_page_says_its_language():
    assert '<html lang="en-NZ"' in (WEB / 'index.html').read_text(encoding='utf-8')


def tokens(selector):
    block = re.search(re.escape(selector) + r'\s*\{(.*?)\}', CSS, re.S).group(1)
    return dict(re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{6})', block))


def luminance(colour):
    channels = [int(colour[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    r, g, b = [c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in channels]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    high, low = sorted((luminance(a), luminance(b)), reverse=True)
    return (high + 0.05) / (low + 0.05)


DARK = tokens(':root')
LIGHT = {**DARK, **tokens('[data-theme="light"]')}
TEXT = ['text-primary', 'text-secondary', 'text-tertiary', 'accent', 'success', 'warning', 'danger']
BACKGROUNDS = ['bg-primary', 'bg-secondary', 'bg-tertiary']


@pytest.mark.parametrize('theme', [DARK, LIGHT], ids=['dark', 'light'])
@pytest.mark.parametrize('text', TEXT)
def test_text_colours_read_on_every_background(theme, text):
    ratios = {background: round(contrast(theme[text], theme[background]), 2) for background in BACKGROUNDS}
    assert min(ratios.values()) >= 4.5, ratios


@pytest.mark.parametrize('theme', [DARK, LIGHT], ids=['dark', 'light'])
def test_button_text_reads_on_the_accent(theme):
    assert contrast(theme['accent-contrast'], theme['accent']) >= 4.5

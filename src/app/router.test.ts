import { describe, expect, it } from 'vitest';
import { detailHref, parseDetail, parseTab, tabHref } from './router.ts';

describe('parseTab', () => {
  it.each([
    ['', 'timer'],
    ['#', 'timer'],
    ['#/', 'timer'],
    ['#/sessions', 'sessions'],
    ['#sessions', 'sessions'],
    ['#/analytics/extra/parts', 'analytics'],
    ['#/more', 'more'],
    ['#/nonsense', 'timer'],
    ['#/constructor', 'timer'],
  ])('%s opens %s', (hash, tab) => {
    expect(parseTab(hash)).toBe(tab);
  });

  it('round-trips with tabHref', () => {
    expect(parseTab(tabHref('analytics'))).toBe('analytics');
  });
});

describe('parseDetail', () => {
  it.each([
    ['#/sessions', null],
    ['#/sessions/', null],
    ['#/sessions/abc-123', 'abc-123'],
    ['#/sessions/%E0', null],
  ])('%s has detail %s', (hash, detail) => {
    expect(parseDetail(hash)).toBe(detail);
  });

  it('round-trips with detailHref', () => {
    const href = detailHref('sessions', 'a/b c');
    expect(parseTab(href)).toBe('sessions');
    expect(parseDetail(href)).toBe('a/b c');
  });
});

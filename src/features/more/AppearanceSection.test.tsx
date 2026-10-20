import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyTheme,
  followSystemTheme,
  onThemeChange,
  resolveTheme,
  themeStorageKey,
} from '../../lib/theme.ts';
import { AppearanceSection } from './AppearanceSection.tsx';

const button = (name: string) => screen.getByRole('button', { name });

/** Stands in for the phone's light or dark setting, which tests can switch. */
function fakeSystem({ light }: { light: boolean }) {
  const listeners = new Set<() => void>();
  const query = {
    matches: light,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return {
    switchTo({ light: nowLight }: { light: boolean }) {
      query.matches = nowLight;
      for (const listener of listeners) listener();
    },
  };
}

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#0f0f11" />';
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resolveTheme', () => {
  it('follows the phone under System, and otherwise the choice', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('the theme', () => {
  it('is dark under System unless the phone asks for light', () => {
    fakeSystem({ light: false });
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows a phone set to light, and sets the status bar colour', () => {
    fakeSystem({ light: true });
    applyTheme();
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveProperty('content', '#f6f6f7');
  });

  it('follows the phone switching mode under System, but not under a fixed choice', () => {
    const system = fakeSystem({ light: false });
    const stop = followSystemTheme();
    applyTheme();
    system.switchTo({ light: true });
    expect(document.documentElement.dataset.theme).toBe('light');

    localStorage.setItem(themeStorageKey, 'dark');
    applyTheme();
    system.switchTo({ light: false });
    system.switchTo({ light: true });
    expect(document.documentElement.dataset.theme).toBe('dark');
    stop();
  });

  it('tells listeners, such as the charts, the new mode', () => {
    fakeSystem({ light: false });
    const seen: string[] = [];
    const stop = onThemeChange((theme) => seen.push(theme));
    applyTheme('light');
    applyTheme('dark');
    stop();
    applyTheme('light');
    expect(seen).toEqual(['light', 'dark']);
  });
});

describe('AppearanceSection', () => {
  it('saves a choice for this device and shows it straight away', () => {
    fakeSystem({ light: false });
    render(<AppearanceSection />);
    expect(button('System').getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(button('Light'));
    expect(button('Light').getAttribute('aria-pressed')).toBe('true');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem(themeStorageKey)).toBe('light');

    fireEvent.click(button('System'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(themeStorageKey)).toBeNull();
  });

  it('shows the saved choice when opened again', () => {
    fakeSystem({ light: false });
    localStorage.setItem(themeStorageKey, 'dark');
    render(<AppearanceSection />);
    expect(button('Dark').getAttribute('aria-pressed')).toBe('true');
  });
});

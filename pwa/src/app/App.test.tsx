import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  }),
}));

afterEach(() => {
  window.location.hash = '';
});

describe('App', () => {
  it('opens on the Timer tab', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Timer' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Timer' }).getAttribute('aria-current')).toBe('page');
  });

  it('follows the hash to another tab', async () => {
    render(<App />);
    act(() => {
      window.location.hash = '#/analytics';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Analytics' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Analytics' }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByRole('link', { name: 'Timer' }).getAttribute('aria-current')).toBeNull();
  });
});

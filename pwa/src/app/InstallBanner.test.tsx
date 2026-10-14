import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstallBanner } from './InstallBanner.tsx';

const iPhone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const mac =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';
const android =
  'Mozilla/5.0 (Linux; Android 16; Pixel 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';

function onDevice(userAgent: string, maxTouchPoints: number, standalone = false) {
  vi.spyOn(window.navigator, 'userAgent', 'get').mockReturnValue(userAgent);
  vi.spyOn(window.navigator, 'maxTouchPoints', 'get').mockReturnValue(maxTouchPoints);
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: standalone } as MediaQueryList);
}

afterEach(() => {
  vi.restoreAllMocks();
});

const banner = () => screen.queryByRole('complementary', { name: 'Install Lookahead' });

describe('InstallBanner', () => {
  it('asks iPhone users in Safari to open the app from the Home Screen', () => {
    onDevice(iPhone, 5);
    render(<InstallBanner />);
    expect(banner()?.textContent).toContain('Add to Home Screen');
  });

  it('counts an iPad, which says it is a Mac but has a touch screen', () => {
    onDevice(mac, 5);
    render(<InstallBanner />);
    expect(banner()).not.toBeNull();
  });

  it.each([
    ['the Home Screen app', iPhone, 5, true],
    ['a Mac', mac, 0, false],
    ['Android, which shares data between the tab and the app', android, 5, false],
  ])('stays hidden in %s', (_name, userAgent, touchPoints, standalone) => {
    onDevice(userAgent, touchPoints, standalone);
    render(<InstallBanner />);
    expect(banner()).toBeNull();
  });
});

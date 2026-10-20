import { type ComponentType, lazy, Suspense } from 'react';
import { TimerScreen } from '../features/timer/TimerScreen.tsx';
import { useFullscreen } from './fullscreen.ts';
import { InstallBanner } from './InstallBanner.tsx';
import { type Tab, useTab } from './router.ts';
import { TabBar } from './TabBar.tsx';
import { Updater } from './Updater.tsx';

/**
 * How wide a tab's page may grow in the wide layout: a readable column for text and forms, or
 * wide for screens laid out across the window. The phone layout is one 576 px column either way.
 */
type PageWidth = 'readable' | 'wide';

const pageWidths: Record<PageWidth, string> = {
  readable: 'lg:max-w-3xl', // 768 px
  wide: 'lg:max-w-7xl', // 1,280 px
};

// The timer opens first and must be instant, so it is in the main bundle. The other tabs load the
// first time they open; the service worker has already stored them, so that works offline too.
// Each tab says how wide it may grow, and is readable unless it says otherwise.
const screens: Record<Tab, { readonly Screen: ComponentType; readonly width?: PageWidth }> = {
  timer: { Screen: TimerScreen, width: 'wide' },
  sessions: {
    Screen: lazy(() =>
      import('../features/sessions/SessionsScreen.tsx').then((m) => ({
        default: m.SessionsScreen,
      })),
    ),
  },
  analytics: {
    Screen: lazy(() =>
      import('../features/analytics/AnalyticsScreen.tsx').then((m) => ({
        default: m.AnalyticsScreen,
      })),
    ),
  },
  more: {
    Screen: lazy(() =>
      import('../features/more/MoreScreen.tsx').then((m) => ({ default: m.MoreScreen })),
    ),
  },
};

export function App() {
  const tab = useTab();
  const { Screen, width = 'readable' } = screens[tab];
  const fullscreen = useFullscreen();

  return (
    // Only the content scrolls. The tab bar (the top bar in the wide layout) sits outside the
    // scrolling area, so content and focus never slide underneath it (WCAG 2.4.11 and 2.5.8).
    <div className="flex h-dvh flex-col">
      {!fullscreen && <InstallBanner />}
      <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
        <main
          className={`mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6 lg:pt-6 ${pageWidths[width]}`}
        >
          <Suspense fallback={null}>
            <Screen />
          </Suspense>
        </main>
      </div>
      {!fullscreen && <TabBar current={tab} />}
      <Updater />
    </div>
  );
}

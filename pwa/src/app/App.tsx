import { type ComponentType, lazy, Suspense } from 'react';
import { TimerScreen } from '../features/timer/TimerScreen.tsx';
import { InstallBanner } from './InstallBanner.tsx';
import { type Tab, useTab } from './router.ts';
import { TabBar } from './TabBar.tsx';
import { Updater } from './Updater.tsx';

// The timer opens first and must be instant, so it is in the main bundle. The other tabs load the
// first time they open; the service worker has already stored them, so that works offline too.
const screens: Record<Tab, ComponentType> = {
  timer: TimerScreen,
  sessions: lazy(() =>
    import('../features/sessions/SessionsScreen.tsx').then((m) => ({ default: m.SessionsScreen })),
  ),
  analytics: lazy(() =>
    import('../features/analytics/AnalyticsScreen.tsx').then((m) => ({
      default: m.AnalyticsScreen,
    })),
  ),
  more: lazy(() =>
    import('../features/more/MoreScreen.tsx').then((m) => ({ default: m.MoreScreen })),
  ),
};

export function App() {
  const tab = useTab();
  const Screen = screens[tab];

  return (
    // Only the content scrolls. The tab bar sits outside the scrolling area, so content and focus
    // never slide underneath it (WCAG 2.4.11 and 2.5.8).
    <div className="flex h-dvh flex-col">
      <InstallBanner />
      <div className="flex flex-1 flex-col overflow-y-auto overscroll-contain">
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-6">
          <Suspense fallback={null}>
            <Screen />
          </Suspense>
        </main>
      </div>
      <TabBar current={tab} />
      <Updater />
    </div>
  );
}

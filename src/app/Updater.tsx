import { useRegisterSW } from 'virtual:pwa-register/react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTimerSaving } from '../db/DbProvider.tsx';
import { updatesHeld } from './updates.ts';

/** Set just before an update reloads the app, so the reloaded app can say it was updated. */
const updatedKey = 'lookahead:updated';
const checkEveryMs = 60 * 60 * 1000;

/**
 * Registers the service worker and keeps Lookahead up to date by itself.
 *
 * iOS resumes an installed app rather than reloading it, so new versions are looked for each time
 * the app comes back to the screen, and hourly while it stays open. A new version is applied when
 * the app is next hidden, unless that would lose work (see updates.ts), so an update never lands
 * mid-solve. "Update now" applies it straight away, except while a timed attempt is unsaved:
 * the reload would lose it.
 */
export function Updater() {
  const [notice, setNotice] = useState<'updated' | null>(readUpdated);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) void registration.update();
      };
      document.addEventListener('visibilitychange', check);
      window.setInterval(check, checkEveryMs);
    },
  });
  const [dismissed, setDismissed] = useState(false);
  const saving = useTimerSaving();
  const unsaved = useSyncExternalStore(saving.subscribe, saving.hasUnsavedAttempts);

  useEffect(() => {
    if (!needRefresh) return;
    function applyWhenHidden() {
      if (document.visibilityState === 'hidden' && !updatesHeld()) {
        markUpdated();
        void updateServiceWorker(true);
      }
    }
    document.addEventListener('visibilitychange', applyWhenHidden);
    return () => document.removeEventListener('visibilitychange', applyWhenHidden);
  }, [needRefresh, updateServiceWorker]);

  const message =
    notice === 'updated'
      ? 'Lookahead has been updated.'
      : offlineReady
        ? 'Lookahead is ready to work offline.'
        : null;
  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(() => {
      setNotice(null);
      setOfflineReady(false);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [message, setOfflineReady]);

  const offerUpdate = needRefresh && !dismissed;
  if (!offerUpdate && message === null) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[max(0.75rem,env(safe-area-inset-top))] z-20 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-surface shadow-lg"
    >
      {offerUpdate ? (
        <>
          <p className="flex-1">
            {unsaved
              ? 'A new version is ready. It installs when you leave, once unsaved attempts are saved or discarded.'
              : 'A new version is ready. It installs next time you leave Lookahead.'}
          </p>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="min-h-11 rounded-lg px-3 font-medium"
          >
            Later
          </button>
          <button
            type="button"
            disabled={unsaved}
            onClick={() => {
              if (saving.hasUnsavedAttempts()) return;
              markUpdated();
              void updateServiceWorker(true);
            }}
            className="min-h-11 rounded-lg bg-accent px-3 font-semibold text-on-accent disabled:opacity-60"
          >
            Update now
          </button>
        </>
      ) : (
        <p className="flex-1">{message}</p>
      )}
    </div>
  );
}

function readUpdated(): 'updated' | null {
  try {
    const updated = sessionStorage.getItem(updatedKey) !== null;
    sessionStorage.removeItem(updatedKey);
    return updated ? 'updated' : null;
  } catch {
    return null;
  }
}

function markUpdated(): void {
  try {
    sessionStorage.setItem(updatedKey, '1');
  } catch {
    // Only the "updated" note is lost.
  }
}

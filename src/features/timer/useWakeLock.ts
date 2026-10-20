import { useEffect } from 'react';

/**
 * Keeps the screen on while the timer is showing, so it doesn't dim or lock part-way through a
 * session (or a solve: the screen isn't touched while solving). The browser lets go of the lock
 * whenever the app is hidden, so it's asked for again when the app comes back.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    async function request() {
      if (document.visibilityState !== 'visible' || lock !== null) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (stopped) void lock.release();
        lock.addEventListener('release', () => {
          lock = null;
        });
      } catch {
        // Refused (low battery, say); the screen just dims as usual.
      }
    }
    void request();
    document.addEventListener('visibilitychange', request);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, []);
}

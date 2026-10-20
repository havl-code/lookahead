import { useSyncExternalStore } from 'react';

/**
 * The timer's fullscreen mode, as on the desktop: only the scramble and the time, with the tab
 * bar and banners hidden too, so the app around the timer reads it here. It also asks the
 * browser to fill the screen where it can (not iPhone Safari, which has no full screen for pages).
 */
let fullscreen = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (fullscreen === next) return;
  fullscreen = next;
  for (const listener of listeners) listener();
}

export function enterFullscreen(): void {
  set(true);
  document.documentElement.requestFullscreen?.().catch(() => {});
}

export function leaveFullscreen(): void {
  set(false);
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFullscreen(): boolean {
  return useSyncExternalStore(subscribe, () => fullscreen);
}

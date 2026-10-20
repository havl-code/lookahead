declare global {
  interface Navigator {
    /** Safari's own flag for a page opened from the Home Screen. */
    readonly standalone?: boolean;
  }
}

/** True when running as an installed Home Screen app rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

/**
 * True on an iPhone or iPad. iPadOS reports itself as a Mac, so a Mac with a touch screen counts
 * too (Macs have none).
 */
export function isAppleMobile(): boolean {
  const { userAgent, maxTouchPoints } = window.navigator;
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

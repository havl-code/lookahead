import type { PersistResult } from '../db/meta.ts';

/**
 * Asks the browser not to clear Lookahead's data under storage pressure. Browsers decide by their
 * own rules (Safari favours Home Screen apps, Chrome installed or often used ones), so this is a
 * request rather than a guarantee.
 */
export async function requestPersistence(): Promise<PersistResult> {
  if (typeof navigator.storage?.persist !== 'function') return 'unsupported';
  try {
    if (await navigator.storage.persisted()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

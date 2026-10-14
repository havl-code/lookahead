/** The device refused to store more data. */
export class StorageFullError extends Error {
  override readonly name = 'StorageFullError';

  constructor(options?: ErrorOptions) {
    super('This device has no room left to store Lookahead data.', options);
  }
}

function isQuotaExceeded(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === 'QuotaExceededError') return true;
  // Dexie wraps the browser error, for example in an AbortError with `inner` set.
  const inner: unknown = 'inner' in error ? error.inner : undefined;
  return isQuotaExceeded(inner);
}

/** Runs a database write, turning quota errors into StorageFullError so the UI can explain them. */
export async function withStorageErrors<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (isQuotaExceeded(error)) throw new StorageFullError({ cause: error });
    throw error;
  }
}

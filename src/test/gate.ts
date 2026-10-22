import { vi } from 'vitest';

/** A promise the test settles by hand. */
export function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/**
 * Holds the next call of `target[method]` (a Dexie write, a transaction) until the test lets it
 * go, then runs the real method, so a test can act while that work is mid-flight. `reached`
 * settles once the call has started. `release` and `reject` return a promise that settles after
 * the held call does, ready to await inside `act`.
 */
export function holdNextCall<T extends object>(target: T, method: keyof T & string) {
  const gate = deferred();
  const started = deferred();
  const original = target[method] as (...args: unknown[]) => unknown;
  vi.spyOn(target, method as never).mockImplementationOnce(((...args: unknown[]) => {
    started.resolve();
    return gate.promise.then(() => Reflect.apply(original, target, args));
  }) as never);
  return {
    reached: started.promise,
    release() {
      gate.resolve();
      return gate.promise;
    },
    reject(reason = new Error('full')) {
      gate.reject(reason);
      return gate.promise.catch(() => {});
    },
  };
}

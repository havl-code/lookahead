import type { Finished } from '../features/timer/clock.ts';
import { requestPersistence } from '../lib/storage.ts';
import { localDate } from '../lib/time.ts';
import type { LookaheadDb } from './database.ts';
import { getMeta, setMeta } from './meta.ts';
import { findTodaysSession, saveTimedSolve } from './solves.ts';

export interface AttemptContext {
  readonly eventId: string;
  readonly scramble: string;
  readonly sessionId: number | null;
}

export interface TimedAttempt extends AttemptContext {
  readonly id: number;
  readonly order: number;
  readonly timeMs: number;
  readonly penalty: Finished['penalty'];
  readonly timestamp: string;
  readonly day: string;
  readonly status: 'saving' | 'saved' | 'error' | 'unavailable';
  readonly destinationId: number | null;
  readonly solveId?: number;
}

/** Owns timed attempts and their saves for the lifetime of the database provider. */
export class TimerSaving {
  private nextId = 0;
  private nextOrder = 0;
  private captured = new Map<number, AttemptContext>();
  private attempts = new Map<number, TimedAttempt>();
  private revision = 0;
  private snapshot: readonly TimedAttempt[] = [];
  private listeners = new Set<() => void>();
  private persistence: Promise<void> | null = null;

  constructor(private readonly db: LookaheadDb) {}

  getRevision = () => this.revision;
  getAttempt = (id: number) => this.attempts.get(id);
  getAttempts = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  capture(context: AttemptContext): number {
    const id = ++this.nextId;
    this.captured.set(id, { ...context });
    return id;
  }

  cancel(id: number): void {
    this.captured.delete(id);
  }

  async finish(id: number, result: Finished, now = new Date()): Promise<void> {
    const context = this.captured.get(id);
    if (!context) return;
    this.captured.delete(id);
    this.attempts.set(id, {
      ...context,
      ...result,
      id,
      order: ++this.nextOrder,
      timestamp: now.toISOString(),
      day: localDate(now),
      destinationId: context.sessionId,
      status: 'saving',
    });
    await this.save(id);
  }

  async retry(id: number): Promise<void> {
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.status === 'saving' || attempt.status === 'saved') return;
    this.attempts.set(id, { ...attempt, status: 'saving' });
    await this.save(id);
  }

  private async save(id: number): Promise<void> {
    this.notify();
    const attempt = this.attempts.get(id);
    if (!attempt) return;
    try {
      const stored = await this.db.transaction('rw', this.db.sessions, this.db.solves, async () => {
        const destination =
          attempt.destinationId === null
            ? await findTodaysSession(this.db, attempt.eventId, attempt.day)
            : await this.db.sessions.get(attempt.destinationId);
        if (attempt.destinationId !== null && destination?.event_id !== attempt.eventId)
          return null;
        if (destination) this.attempts.set(id, { ...attempt, destinationId: destination.id });
        return saveTimedSolve(
          this.db,
          {
            ...attempt,
            sessionId: destination?.id ?? null,
            completionDay: attempt.day,
          },
          new Date(attempt.timestamp),
        );
      });
      const current = this.attempts.get(id) ?? attempt;
      this.attempts.set(
        id,
        stored
          ? {
              ...current,
              status: 'saved',
              solveId: stored.solveId,
              destinationId: stored.sessionId,
            }
          : { ...current, status: 'unavailable' },
      );
      this.notify();
      if (stored) this.requestPersistence();
    } catch {
      this.attempts.set(id, { ...(this.attempts.get(id) ?? attempt), status: 'error' });
      this.notify();
    }
  }

  private requestPersistence(): void {
    if (this.persistence) return;
    this.persistence = (async () => {
      try {
        if ((await getMeta(this.db, 'persistResult')) === null)
          await setMeta(this.db, 'persistResult', await requestPersistence());
      } catch {
        // Persistence bookkeeping cannot change a committed save's outcome.
      }
    })();
  }

  private notify(): void {
    this.snapshot = [...this.attempts.values()];
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}

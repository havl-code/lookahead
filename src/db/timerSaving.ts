import { holdUpdates } from '../app/updates.ts';
import type { Finished } from '../features/timer/clock.ts';
import { requestPersistence } from '../lib/storage.ts';
import { localDate } from '../lib/time.ts';
import type { LookaheadDb } from './database.ts';
import { getMeta, setMeta } from './meta.ts';
import type { Solve } from './schema.ts';
import { findTodaysSession, latestSolves, saveTimedSolve, startTimerSession } from './solves.ts';

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
  readonly recoverable?: boolean;
}

/**
 * The session picked on the timer's menu (null follows today), with a revision that changes on
 * every choice, so a delayed result can tell whether its choice still applies.
 */
export interface TimerSelection {
  readonly sessionId: number | null;
  readonly revision: number;
}

export type StartedSession =
  | { readonly status: 'started'; readonly sessionId: number; readonly selected: boolean }
  | { readonly status: 'pending' }
  | { readonly status: 'failed' };

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
  /** One update hold for each attempt still saving or recoverable, released once it resolves. */
  private holds = new Map<number, () => void>();
  /** Lasts while the app is open (as on the desktop, until a reload), even on another tab. */
  private selection: TimerSelection = { sessionId: null, revision: 0 };
  /** Whether a New session request is pending, or failed and not yet reported. */
  private sessionStart: 'idle' | 'starting' | 'failed' = 'idle';

  constructor(private readonly db: LookaheadDb) {}

  getRevision = () => this.revision;
  getAttempt = (id: number) => this.attempts.get(id);
  getAttempts = () => this.snapshot;
  /** Whether any attempt is still saving or recoverable, so an update would lose it. */
  hasUnsavedAttempts = () => this.holds.size > 0;
  getSelection = () => this.selection;
  getSessionStart = () => this.sessionStart;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  select(sessionId: number | null): void {
    this.selection = { sessionId, revision: this.selection.revision + 1 };
    this.notify();
  }

  /**
   * Starts a session for today, one request at a time. The new session is selected only if no
   * other choice was made while it was being created. A failure stays until it's reported, so
   * Timer can show it even if it settled while another tab was showing.
   */
  async startSession(eventId: string, now = new Date()): Promise<StartedSession> {
    if (this.sessionStart === 'starting') return { status: 'pending' };
    this.sessionStart = 'starting';
    const { revision } = this.selection;
    this.notify();
    try {
      const sessionId = await startTimerSession(this.db, eventId, now);
      const selected = this.selection.revision === revision;
      if (selected) this.selection = { sessionId, revision: revision + 1 };
      this.sessionStart = 'idle';
      return { status: 'started', sessionId, selected };
    } catch {
      this.sessionStart = 'failed';
      return { status: 'failed' };
    } finally {
      this.notify();
    }
  }

  /** Clears a failed New session request once Timer has reported it. */
  reportedSessionFailure(): void {
    if (this.sessionStart !== 'failed') return;
    this.sessionStart = 'idle';
    this.notify();
  }

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

  /** Observes the committed identity, falling back to the current list after its deletion. */
  async reconcile(id: number, eventId: string, sessionId: number | null): Promise<Solve | null> {
    const attempt = this.attempts.get(id);
    if (attempt?.status !== 'saved' || sessionId === null) return null;
    const session = await this.db.sessions.get(sessionId);
    if (session?.event_id !== eventId) return null;
    const solve =
      attempt.eventId === eventId &&
      attempt.destinationId === sessionId &&
      attempt.solveId !== undefined
        ? await this.db.solves.get(attempt.solveId)
        : undefined;
    return solve?.session_id === sessionId
      ? solve
      : ((await latestSolves(this.db, sessionId, 1))[0] ?? null);
  }

  discard(id: number): void {
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.status === 'saving' || attempt.status === 'saved') return;
    this.attempts.delete(id);
    this.notify();
  }

  async retry(id: number, replacementId?: number): Promise<void> {
    const attempt = this.attempts.get(id);
    if (!attempt || attempt.status === 'saving' || attempt.status === 'saved') return;
    this.attempts.set(id, { ...attempt, status: 'saving' });
    await this.save(id, replacementId);
  }

  private async save(id: number, replacementId?: number): Promise<void> {
    this.notify();
    const attempt = this.attempts.get(id);
    if (!attempt) return;
    const destinationId = replacementId ?? attempt.destinationId;
    try {
      const stored = await this.db.transaction('rw', this.db.sessions, this.db.solves, async () => {
        const destination =
          destinationId === null
            ? await findTodaysSession(this.db, attempt.eventId, attempt.day)
            : await this.db.sessions.get(destinationId);
        if (destinationId !== null && destination?.event_id !== attempt.eventId) return null;
        if (destination) this.attempts.set(id, { ...attempt, destinationId: destination.id });
        return saveTimedSolve(
          this.db,
          {
            ...attempt,
            sessionId: destination?.id ?? null,
            completionDay: attempt.day,
            beforeSolveIds: [...this.attempts.values()].flatMap((later) =>
              later.order > attempt.order && later.status === 'saved' && later.solveId !== undefined
                ? [later.solveId]
                : [],
            ),
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
          : { ...current, status: 'unavailable', recoverable: true },
      );
      this.notify();
      if (stored) this.requestPersistence();
    } catch {
      this.attempts.set(id, {
        ...(this.attempts.get(id) ?? attempt),
        status: 'error',
        recoverable: true,
      });
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
    this.syncHolds();
    this.snapshot = [...this.attempts.values()];
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }

  /** Holds updates for attempts still saving or recoverable, and releases the rest. */
  private syncHolds(): void {
    for (const attempt of this.attempts.values())
      if (attempt.status !== 'saved' && !this.holds.has(attempt.id))
        this.holds.set(attempt.id, holdUpdates());
    for (const [id, release] of this.holds) {
      const status = this.attempts.get(id)?.status;
      if (status === undefined || status === 'saved') {
        release();
        this.holds.delete(id);
      }
    }
  }
}

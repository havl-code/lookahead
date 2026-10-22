import type { Penalty } from '../features/timer/clock.ts';
import { maxNotes, text } from '../lib/validation.ts';
import type { LookaheadDb } from './database.ts';
import type { Solve } from './schema.ts';
import { deleteSolve, restoreSolve, setPenalty, setSolveNotes } from './solves.ts';

export type EditResult<T = void> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'unavailable' | 'busy' | 'error' };

export type EditOrigin = 'timer' | 'sessions';

export interface UndoAction {
  readonly solve: Solve;
  readonly message: string;
  readonly expiresAt: number;
  readonly restoring: boolean;
}

interface EditingClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(timer: unknown): void;
}

const systemClock: EditingClock = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
};

/** Coordinates solve edits for the lifetime of the database provider. */
export class SolveEditing {
  private pending = false;
  private feedback: string | null = null;
  private feedbackOrigin: EditOrigin | null = null;
  private revision = 0;
  private listeners = new Set<() => void>();
  private activeOrigin: EditOrigin | null = null;
  private originRevision: Record<EditOrigin, number> = { timer: 0, sessions: 0 };
  private undo: (UndoAction & { readonly origin: EditOrigin }) | null = null;
  private undoTimer: unknown = null;

  constructor(
    private readonly db: LookaheadDb,
    private readonly clock: EditingClock = systemClock,
  ) {}

  isPending = () => this.pending;
  getRevision = () => this.revision;
  getFeedback = (origin?: EditOrigin) =>
    origin === undefined || this.feedbackOrigin === origin ? this.feedback : null;
  getUndo = (origin: EditOrigin) => (this.undo?.origin === origin ? this.undo : null);
  dismissUndo = (origin: EditOrigin) => {
    if (this.undo?.origin === origin && !this.undo.restoring) this.clearUndo();
  };

  activate = (origin: EditOrigin) => {
    this.activeOrigin = origin;
    this.originRevision[origin] += 1;
    this.notify();
  };

  deactivate = (origin: EditOrigin) => {
    this.originRevision[origin] += 1;
    if (this.activeOrigin === origin) this.activeOrigin = null;
    if (this.undo?.origin === origin && !this.undo.restoring) this.clearUndo();
    else this.notify();
  };
  clearFeedback = () => {
    this.feedback = null;
    this.feedbackOrigin = null;
    this.notify();
  };
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private async run<T>(
    write: () => Promise<T | false | undefined>,
    operation: string,
    solveNumber: number,
    origin: EditOrigin | null = null,
  ): Promise<EditResult<T>> {
    if (this.pending) return { status: 'busy' };
    this.pending = true;
    this.feedback = null;
    this.feedbackOrigin = origin;
    this.notify();
    try {
      const value = await write();
      if (value === false || value === undefined) {
        this.feedback = `Couldn't ${operation} Solve ${solveNumber}: it is no longer available.`;
        this.feedbackOrigin = origin;
        return { status: 'unavailable' };
      }
      return { status: 'success', value: value as T };
    } catch {
      this.feedback = `Couldn't ${operation} Solve ${solveNumber}. Please try again.`;
      this.feedbackOrigin = origin;
      return { status: 'error' };
    } finally {
      this.pending = false;
      this.notify();
    }
  }

  changePenalty(
    solveId: number,
    solveNumber: number,
    penalty: Penalty,
    origin = this.activeOrigin,
  ) {
    return this.run(
      async () => (await setPenalty(this.db, solveId, penalty)) || false,
      'change the penalty on',
      solveNumber,
      origin,
    );
  }

  changeNotes(solveId: number, solveNumber: number, notes: string, origin = this.activeOrigin) {
    const checked = text(notes, 'A note', maxNotes);
    if (!checked.ok)
      return Promise.resolve<EditResult<string>>({ status: 'invalid', message: checked.error });
    return this.run(
      async () => ((await setSolveNotes(this.db, solveId, checked.value)) ? checked.value : false),
      'save a note on',
      solveNumber,
      origin,
    );
  }

  async remove(origin: EditOrigin, solveId: number, solveNumber: number) {
    const originRevision = this.originRevision[origin];
    const result = await this.run(
      () => deleteSolve(this.db, solveId),
      'delete',
      solveNumber,
      origin,
    );
    if (result.status === 'success') {
      if (this.activeOrigin === origin && this.originRevision[origin] === originRevision) {
        this.setUndo(origin, result.value);
      }
    }
    return result;
  }

  async restore(origin: EditOrigin) {
    if (this.pending) return { status: 'busy' } as const;
    const current = this.getUndo(origin);
    if (!current) return { status: 'unavailable' } as const;
    const solve = current.solve;
    this.undo = { ...current, restoring: true };
    this.clearUndoTimer();
    this.notify();
    const result = await this.run(
      async () => ((await restoreSolve(this.db, solve)) ? solve : false),
      'restore',
      solve.solve_number,
      origin,
    );
    if (this.undo?.solve.id !== solve.id || this.undo.origin !== origin) return result;
    if (result.status === 'success' || result.status === 'unavailable') {
      if (result.status === 'success') {
        this.feedback = `Solve ${solve.solve_number} restored.`;
        this.feedbackOrigin = origin;
      }
      this.clearUndo();
    } else {
      if (this.activeOrigin === origin) this.setUndo(origin, solve);
      else this.clearUndo();
    }
    return result;
  }

  private setUndo(origin: EditOrigin, solve: Solve) {
    this.clearUndoTimer();
    this.undo = {
      origin,
      solve,
      message: `Solve ${solve.solve_number} deleted.`,
      expiresAt: this.clock.now() + 8000,
      restoring: false,
    };
    this.undoTimer = this.clock.setTimeout(() => {
      this.undoTimer = null;
      if (this.undo?.origin !== origin || this.undo.restoring) return;
      this.undo = null;
      this.notify();
    }, 8000);
    this.notify();
  }

  private clearUndoTimer() {
    if (this.undoTimer !== null) this.clock.clearTimeout(this.undoTimer);
    this.undoTimer = null;
  }

  private clearUndo() {
    this.clearUndoTimer();
    this.undo = null;
    this.notify();
  }

  private notify() {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}

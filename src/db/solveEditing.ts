import type { Penalty } from '../features/timer/clock.ts';
import { maxNotes, text } from '../lib/validation.ts';
import type { LookaheadDb } from './database.ts';
import type { Solve } from './schema.ts';
import { deleteSolve, restoreSolve, setPenalty, setSolveNotes } from './solves.ts';

export type EditResult<T = void> =
  | { readonly status: 'success'; readonly value: T }
  | { readonly status: 'invalid'; readonly message: string }
  | { readonly status: 'unavailable' | 'busy' | 'error' };

/** Coordinates solve edits for the lifetime of the database provider. */
export class SolveEditing {
  private pending = false;
  private feedback: string | null = null;
  private revision = 0;
  private listeners = new Set<() => void>();

  constructor(private readonly db: LookaheadDb) {}

  isPending = () => this.pending;
  getRevision = () => this.revision;
  getFeedback = () => this.feedback;
  clearFeedback = () => {
    this.feedback = null;
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
  ): Promise<EditResult<T>> {
    if (this.pending) return { status: 'busy' };
    this.pending = true;
    this.feedback = null;
    this.notify();
    try {
      const value = await write();
      if (value === false || value === undefined) {
        this.feedback = `Couldn't ${operation} Solve ${solveNumber}: it is no longer available.`;
        return { status: 'unavailable' };
      }
      return { status: 'success', value: value as T };
    } catch {
      this.feedback = `Couldn't ${operation} Solve ${solveNumber}. Please try again.`;
      return { status: 'error' };
    } finally {
      this.pending = false;
      this.notify();
    }
  }

  changePenalty(solveId: number, solveNumber: number, penalty: Penalty) {
    return this.run(
      async () => (await setPenalty(this.db, solveId, penalty)) || false,
      'change the penalty on',
      solveNumber,
    );
  }

  changeNotes(solveId: number, solveNumber: number, notes: string) {
    const checked = text(notes, 'A note', maxNotes);
    if (!checked.ok)
      return Promise.resolve<EditResult<string>>({ status: 'invalid', message: checked.error });
    return this.run(
      async () => ((await setSolveNotes(this.db, solveId, checked.value)) ? checked.value : false),
      'save a note on',
      solveNumber,
    );
  }

  remove(solveId: number, solveNumber: number) {
    return this.run(() => deleteSolve(this.db, solveId), 'delete', solveNumber);
  }

  restore(solve: Solve) {
    return this.run(
      async () => ((await restoreSolve(this.db, solve)) ? solve : false),
      'restore',
      solve.solve_number,
    );
  }

  private notify() {
    this.revision += 1;
    for (const listener of this.listeners) listener();
  }
}

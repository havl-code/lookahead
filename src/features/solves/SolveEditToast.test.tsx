import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SolveEditing } from '../../db/solveEditing.ts';
import { SolveEditToast } from './SolveEditToast.tsx';

describe('solve edit toast', () => {
  it('keeps Undo visible ahead of an existing Timer toast', () => {
    const restore = vi.fn();
    const retry = vi.fn();
    const editing = {
      getFeedback: () => null,
      getUndo: () => ({ message: 'Solve 1 deleted.', restoring: false }),
      restore,
      dismissUndo: vi.fn(),
      clearFeedback: vi.fn(),
    } as unknown as SolveEditing;
    render(
      <SolveEditToast
        editing={editing}
        origin="timer"
        toast={{
          message: "Couldn't save the next solve.",
          action: { label: 'Retry', onClick: retry },
        }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByText('Solve 1 deleted.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(restore).toHaveBeenCalledWith('timer');
    expect(retry).not.toHaveBeenCalled();
  });

  it('keeps the underlying Timer toast when Undo expires', () => {
    vi.useFakeTimers();
    try {
      const onDismiss = vi.fn();
      const dismissUndo = vi.fn();
      const editing = {
        getFeedback: () => null,
        getUndo: () => ({ message: 'Solve 1 deleted.', restoring: false }),
        restore: vi.fn(),
        dismissUndo,
        clearFeedback: vi.fn(),
      } as unknown as SolveEditing;
      render(
        <SolveEditToast
          editing={editing}
          origin="timer"
          toast={{
            message: "Couldn't save the next solve.",
            action: { label: 'Retry', onClick: vi.fn() },
          }}
          onDismiss={onDismiss}
        />,
      );

      act(() => vi.advanceTimersByTime(8_000));
      expect(dismissUndo).toHaveBeenCalledWith('timer');
      expect(onDismiss).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

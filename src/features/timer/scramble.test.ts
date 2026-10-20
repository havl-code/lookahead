import { describe, expect, it } from 'vitest';
import { generateScramble, hasTimer, isBlindfolded, timerEvents } from './scramble.ts';

const axisOf = (move: string) =>
  ({ R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' })[move.replace(/^\d/, '')[0] ?? ''];
const layerOf = (move: string) => move.replace(/['2]$/, '');
const rotations = /^[xyz]['2]?$/;

describe('generateScramble', () => {
  it('gives the same events a timer as the desktop app', () => {
    expect(timerEvents).toEqual([
      '222',
      '333',
      '444',
      '555',
      '666',
      '777',
      '333oh',
      '333bf',
      '444bf',
      '555bf',
      'minx',
    ]);
    expect([hasTimer('clock'), hasTimer('constructor')]).toEqual([false, false]);
  });

  it.each([
    ['222', 25, 'R U F'],
    ['333', 25, 'R L U D F B'],
    ['444', 40, 'R L U D F B Rw Uw Fw'],
    ['555', 60, 'R L U D F B Rw Lw Uw Dw Fw Bw'],
    ['777', 100, 'R L U D F B Rw Lw Uw Dw Fw Bw 3Rw 3Lw 3Uw 3Dw 3Fw 3Bw'],
  ])('makes %s scrambles of %s moves that never cancel out', (eventId, length, layers) => {
    const allowed = new Set(layers.split(' '));
    for (let run = 0; run < 200; run++) {
      const moves = generateScramble(eventId).split(' ');
      expect(moves).toHaveLength(length);
      let seen = new Set<string>();
      let axis: string | undefined;
      for (const move of moves) {
        expect(move).toMatch(/^(\d?[RLUDFB]w?)['2]?$/);
        expect(allowed.has(layerOf(move))).toBe(true);
        if (axisOf(move) !== axis) {
          axis = axisOf(move);
          seen = new Set();
        }
        expect(seen.has(layerOf(move))).toBe(false);
        seen.add(layerOf(move));
      }
    }
  });

  it('ends blindfolded scrambles with a random orientation, and gives them no inspection', () => {
    const endings = new Set<string>();
    for (let run = 0; run < 2000; run++) {
      const moves = generateScramble('333bf').split(' ');
      const turns = moves.filter((move) => rotations.test(move));
      expect(moves.slice(0, 25).some((move) => rotations.test(move))).toBe(false);
      endings.add(turns.join(' '));
    }
    // All 24 orientations turn up (there are 24 ways to write them: 6 tops by 4 fronts)
    expect(endings.size).toBe(24);
    expect([isBlindfolded('333bf'), isBlindfolded('333')]).toEqual([true, false]);
  });

  it('writes Megaminx scrambles as TNoodle does', () => {
    const lines = generateScramble('minx').split('\n');
    expect(lines).toHaveLength(7);
    for (const line of lines) {
      const moves = line.split(' ');
      expect(moves).toHaveLength(11);
      for (const [i, move] of moves.slice(0, 10).entries()) {
        expect(move).toMatch(i % 2 ? /^D(\+\+|--)$/ : /^R(\+\+|--)$/);
      }
      expect(moves[10]).toBe(moves[9]?.endsWith('++') ? 'U' : "U'");
    }
  });
});

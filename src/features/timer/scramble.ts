/*
 * Random-move scrambles, the same as the desktop app's web/js/scramble.js.
 *
 * Official WCA scrambles for 2x2x2, 3x3x3, and 4x4x4 are random-state (Regulation 4b3): the WCA's
 * program, TNoodle, picks a random position and works out moves that reach it. These are
 * random-move instead, using the lengths the WCA itself set when it scrambled these cubes with
 * random moves, in the half turn metric: 25 moves for 2x2x2 and 3x3x3, and 40 for 4x4x4 (2006
 * Regulations, Articles 4g and 4c), and 60 for 5x5x5, 80 for 6x6x6, and 100 for 7x7x7 (2009
 * Regulations, Article 4f). They mix the cube well for practice, but aren't spread over positions
 * in exactly the same way as competition scrambles.
 *
 * The rules only stop moves that cancel out: never the same layer twice in a row, and within a run
 * of moves on one axis, each layer at most once. So R L is fine, but R L R isn't (it's R2 L).
 *
 * Moves are written as in Regulation 12a: a face (12a1), or a face's outer layers, such as Rw or
 * 3Rw (12a2), then nothing, ' (counter-clockwise), or 2 (half turn). A move that's just another
 * move plus a turn of the whole cube adds nothing, so it's left out: 2x2x2 has only R, U, and F;
 * 4x4x4 has Rw, Uw, and Fw but not Lw; 6x6x6 has 3Rw, 3Uw, and 3Fw but not 3Lw.
 */

type Axis = 'x' | 'y' | 'z';
const faceAxes: Record<string, Axis> = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };

function movesOf(names: string): ReadonlyArray<readonly [string, Axis]> {
  return names.split(' ').map((name) => [name, faceAxes[name.replace(/^\d/, '')[0] ?? ''] as Axis]);
}

interface ScrambleKind {
  readonly length: number;
  readonly layers?: ReadonlyArray<readonly [string, Axis]>;
  /** Blindfolded events end with a random orientation, and have no inspection (Regulation B1a). */
  readonly blindfolded?: boolean;
  readonly generate?: () => string;
}

const kinds: Readonly<Record<string, ScrambleKind>> = {
  '222': { length: 25, layers: movesOf('R U F') },
  '333': { length: 25, layers: movesOf('R L U D F B') },
  '444': { length: 40, layers: movesOf('R L U D F B Rw Uw Fw') },
  '555': { length: 60, layers: movesOf('R L U D F B Rw Lw Uw Dw Fw Bw') },
  '666': { length: 80, layers: movesOf('R L U D F B Rw Lw Uw Dw Fw Bw 3Rw 3Uw 3Fw') },
  '777': { length: 100, layers: movesOf('R L U D F B Rw Lw Uw Dw Fw Bw 3Rw 3Lw 3Uw 3Dw 3Fw 3Bw') },
  // One-Handed is a 3x3x3 solved the usual way, inspection and all (Article C follows Article A).
  '333oh': { length: 25, layers: movesOf('R L U D F B') },
  '333bf': { length: 25, layers: movesOf('R L U D F B'), blindfolded: true },
  '444bf': { length: 40, layers: movesOf('R L U D F B Rw Uw Fw'), blindfolded: true },
  '555bf': { length: 60, layers: movesOf('R L U D F B Rw Lw Uw Dw Fw Bw'), blindfolded: true },
  minx: { length: 70, generate: megaminxScramble },
};

/** The events with a timer: every event with a scramble here, in the order menus list them. */
export const timerEvents = Object.keys(kinds);

export function hasTimer(eventId: string): boolean {
  return Object.hasOwn(kinds, eventId);
}

/** Whether an event is solved blindfolded, and so has no inspection (Regulation B1a). */
export function isBlindfolded(eventId: string): boolean {
  return hasTimer(eventId) && Boolean(kinds[eventId]?.blindfolded);
}

/** Whether an event's scrambles are long enough to be set a little smaller. */
export function isLongScramble(eventId: string): boolean {
  return (kinds[eventId]?.length ?? 0) > 40;
}

/** A random whole number from 0 up to (not including) `below`, from the browser's secure source. */
function randomBelow(below: number): number {
  const limit = Math.floor(0x1_0000_0000 / below) * below;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value);
  while ((value[0] as number) >= limit);
  return (value[0] as number) % below;
}

function pick<T>(choices: readonly T[]): T {
  return choices[randomBelow(choices.length)] as T;
}

const turns = ['', "'", '2'] as const;

// A blindfolded scramble must leave the cube in a random orientation, each of the 24 equally
// likely (Regulation 4b3a), picked as TNoodle does: one of six faces on top, written as nothing,
// x, x2, x', z, or z' (Regulation 12a4), then one of four in front: nothing, y, y2, or y'.
const topFace = ['', 'x', 'x2', "x'", 'z', "z'"] as const;
const frontFace = ['', 'y', 'y2', "y'"] as const;

// The WCA still scrambles Megaminx with random moves (Regulation 4b3e), 70 of them (2008
// Regulations, Article 4f), in Stefan Pochmann's way, as TNoodle writes it: seven lines of ten
// moves that take turns between R and D, each ++ or -- (Regulation 12d2), and each line ending
// with U or U' (Regulation 12d1), turned the same way as the line's last D.
function megaminxScramble(): string {
  const lines: string[] = [];
  for (let line = 0; line < 7; line++) {
    const moves: string[] = [];
    let turn = '';
    for (let i = 0; i < 10; i++) {
      turn = pick(['++', '--']);
      moves.push((i % 2 === 0 ? 'R' : 'D') + turn);
    }
    moves.push(turn === '++' ? 'U' : "U'");
    lines.push(moves.join(' '));
  }
  return lines.join('\n');
}

export function generateScramble(eventId: string): string {
  const kind = kinds[eventId];
  if (!kind) throw new Error(`${eventId} has no scrambles`);
  if (kind.generate) return kind.generate();
  const layers = kind.layers ?? [];
  const moves: string[] = [];
  let axis: Axis | null = null;
  let layersOnAxis = new Set<string>();
  while (moves.length < kind.length) {
    const [layer, layerAxis] = pick(layers);
    if (layerAxis === axis && layersOnAxis.has(layer)) continue; // would cancel out
    if (layerAxis !== axis) {
      axis = layerAxis;
      layersOnAxis = new Set();
    }
    layersOnAxis.add(layer);
    moves.push(layer + pick(turns));
  }
  if (kind.blindfolded) moves.push(...[pick(topFace), pick(frontFace)].filter(Boolean));
  return moves.join(' ');
}

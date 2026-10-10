// scramble.js: random-move scrambles for the timer.
//
// Official WCA scrambles for 2x2x2, 3x3x3, and 4x4x4 are random-state (Regulation 4b3): the WCA's
// program, TNoodle, picks a random position and works out moves that reach it. These are
// random-move instead, a random sequence of moves, using the lengths the WCA itself set when it
// scrambled these cubes with random moves, in the half turn metric: 25 moves for 2x2x2 and
// 3x3x3, and 40 for 4x4x4 (2006 Regulations, Articles 4g and 4c), and 60 for 5x5x5, 80 for
// 6x6x6, and 100 for 7x7x7 (2009 Regulations, Article 4f). They mix the cube well for practice,
// but aren't spread over positions in exactly the same way as competition scrambles. (The WCA
// still scrambles the bigger cubes with random moves.)
//
// The rules only stop moves that cancel out: never the same layer twice in a row, and within a
// run of moves on one axis, each layer at most once. So R L is fine (they're different layers),
// but R L R isn't, since that's just R2 L.

// Each event's length and the moves it's made of. Moves are written as in Regulation 12a: a
// face (12a1), or a face's outer layers, such as Rw (two layers) or 3Rw (three) (12a2), then
// nothing, ' (counter-clockwise), or 2 (half turn). A move that's just another move plus a turn
// of the whole cube adds nothing, so it's left out:
//   2x2x2: R, U, and F only. With no middle layers, L is R plus a turn of the whole cube (and D
//          is U, and B is F, the same way).
//   4x4x4: the six faces, and Rw, Uw, and Fw. Lw is R plus a turn of the whole cube.
//   5x5x5: the six faces and all six two-layer moves: with a middle layer, Lw is its own move.
//   6x6x6: the same, and 3Rw, 3Uw, and 3Fw (3Lw is 3Rw plus a turn of the whole cube).
//   7x7x7: the same, and all six three-layer moves (a middle layer again keeps them apart).
const FACE_AXES = { R: 'x', L: 'x', U: 'y', D: 'y', F: 'z', B: 'z' };

// Each move with the axis it turns about (the axis of its face, after any number of layers)
function movesOf(names) {
    return names.split(' ').map(name => [name, FACE_AXES[name.replace(/^\d/, '')[0]]]);
}

const SCRAMBLES = {
    '222': { length: 25, layers: movesOf('R U F') },
    '333': { length: 25, layers: movesOf('R L U D F B') },
    '444': { length: 40, layers: movesOf('R L U D F B Rw Uw Fw') },
    '555': { length: 60, layers: movesOf('R L U D F B Rw Lw Uw Dw Fw Bw') },
    '666': { length: 80, layers: movesOf('R L U D F B Rw Lw Uw Dw Fw Bw 3Rw 3Uw 3Fw') },
    '777': { length: 100, layers: movesOf('R L U D F B Rw Lw Uw Dw Fw Bw 3Rw 3Lw 3Uw 3Dw 3Fw 3Bw') },
    // One-Handed is a 3x3x3 solved the usual way, inspection and all (Article C follows the
    // speed solving procedures of Article A), so it takes a 3x3x3 scramble
    '333oh': { length: 25, layers: movesOf('R L U D F B') },
    // The blindfolded events take their cube's scramble, then a random orientation (see
    // randomOrientation, below), and have no inspection (Regulation B1a)
    '333bf': { length: 25, layers: movesOf('R L U D F B'), blindfolded: true },
    '444bf': { length: 40, layers: movesOf('R L U D F B Rw Uw Fw'), blindfolded: true },
    '555bf': { length: 60, layers: movesOf('R L U D F B Rw Lw Uw Dw Fw Bw'), blindfolded: true }
};

// Whether an event has a timer: every event with a scramble here does
function hasTimer(eventId) {
    return Object.hasOwn(SCRAMBLES, eventId);
}

// Whether an event is solved blindfolded, and so has no inspection (Regulation B1a)
function isBlindfolded(eventId) {
    return hasTimer(eventId) && Boolean(SCRAMBLES[eventId].blindfolded);
}

const TURNS = ['', "'", '2'];

function pick(choices) {
    return choices[Math.floor(Math.random() * choices.length)];
}

// A blindfolded scramble must leave the cube in a random orientation, each one equally likely
// (Regulation 4b3a). There are 24: one of six faces on top, then one of four faces in front.
// TNoodle, the WCA's scramble program, picks them the same way. Here they're written as turns
// of the whole cube (Regulation 12a4): nothing, x, x2, or x' (U, F, D, or B on top) or z or z'
// (L or R on top), then nothing, y, y2, or y'.
const TOP_FACE = ['', 'x', 'x2', "x'", 'z', "z'"];
const FRONT_FACE = ['', 'y', 'y2', "y'"];

function randomOrientation() {
    return [pick(TOP_FACE), pick(FRONT_FACE)].filter(Boolean);
}

function generateScramble(eventId) {
    const { length, layers, blindfolded } = SCRAMBLES[eventId];
    const moves = [];
    let axis = null;
    let layersOnAxis = new Set();  // the layers used since the axis last changed

    while (moves.length < length) {
        const [layer, layerAxis] = pick(layers);
        if (layerAxis === axis && layersOnAxis.has(layer)) continue;  // would cancel out
        if (layerAxis !== axis) {
            axis = layerAxis;
            layersOnAxis = new Set();
        }
        layersOnAxis.add(layer);
        moves.push(layer + pick(TURNS));
    }
    if (blindfolded) moves.push(...randomOrientation());
    return moves.join(' ');
}

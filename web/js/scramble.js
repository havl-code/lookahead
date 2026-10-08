// scramble.js: random-move scrambles for the timer.
//
// Official WCA scrambles for 2x2x2, 3x3x3, and 4x4x4 are random-state (Regulation 4b3): the WCA's
// program, TNoodle, picks a random position and works out moves that reach it. These are
// random-move instead, a random sequence of moves, using the lengths the WCA itself set when it
// scrambled these cubes with random moves: 25 moves for 2x2x2 and 3x3x3, and 40 for 4x4x4, in
// the half turn metric (2006 Regulations, Articles 4g and 4c). They mix the cube well for
// practice, but aren't spread over positions in exactly the same way as competition scrambles.
//
// The rules only stop moves that cancel out: never the same layer twice in a row, and within a
// run of moves on one axis, each layer at most once. So R L is fine (they're different layers),
// but R L R isn't, since that's just R2 L.

// Each event's length and layers, with the axis each layer turns about. Moves are written as in
// Regulation 12a: a face (12a1), or for a 4x4x4 a face's outer two layers, such as Rw (12a2),
// then nothing, ' (counter-clockwise), or 2 (half turn).
//   2x2x2: R, U, and F only. On a cube with no middle layers, L is R plus a turn of the whole
//          cube (and D is U, and B is F, the same way), so the other faces add nothing.
//   4x4x4: the six faces, and Rw, Uw, and Fw for the inner layers. Lw, Dw, and Bw are left out
//          for the same reason: Lw is R plus a turn of the whole cube.
const SCRAMBLES = {
    '222': {
        length: 25,
        layers: [['R', 'x'], ['U', 'y'], ['F', 'z']]
    },
    '333': {
        length: 25,
        layers: [['R', 'x'], ['L', 'x'], ['U', 'y'], ['D', 'y'], ['F', 'z'], ['B', 'z']]
    },
    '444': {
        length: 40,
        layers: [['R', 'x'], ['L', 'x'], ['Rw', 'x'], ['U', 'y'], ['D', 'y'], ['Uw', 'y'],
                 ['F', 'z'], ['B', 'z'], ['Fw', 'z']]
    }
};

// Whether an event has a timer: every event with a scramble here does
function hasTimer(eventId) {
    return Object.hasOwn(SCRAMBLES, eventId);
}
const TURNS = ['', "'", '2'];

function generateScramble(eventId) {
    const { length, layers } = SCRAMBLES[eventId];
    const moves = [];
    let axis = null;
    let layersOnAxis = new Set();  // the layers used since the axis last changed

    while (moves.length < length) {
        const [layer, layerAxis] = layers[Math.floor(Math.random() * layers.length)];
        if (layerAxis === axis && layersOnAxis.has(layer)) continue;  // would cancel out
        if (layerAxis !== axis) {
            axis = layerAxis;
            layersOnAxis = new Set();
        }
        layersOnAxis.add(layer);
        moves.push(layer + TURNS[Math.floor(Math.random() * TURNS.length)]);
    }
    return moves.join(' ');
}

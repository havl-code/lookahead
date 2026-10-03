// config.js: global configuration, constants and small shared helpers

// The JSON API served by the local Python server (app.py) that also serves this page.
const API_BASE = '/api';

// Global state
const AppState = {
    selectedFile: null,
    currentEvent: '333',
    plotlyLoaded: false,
    allSessions: [],
    allCubes: []
};

// Colour palette for chart data series only (UI colours live in the CSS). It leads with the
// app's orange accent, and the others are easy to tell apart, including for colour-blind users.
const COLORS = {
    primary: '#FF7A1A',      // orange: main data series
    secondary: '#3B82F6',    // blue: secondary series
    tertiary: '#14B8A6',     // teal: tertiary series
    quaternary: '#A855F7',   // purple: quaternary series
    danger: '#EF4444',       // red: highlights such as the median line
    gray: '#8B8B94',         // neutral grey: individual points
    info: '#EAB308'          // yellow: additional series
};

// Event name mapping
const EVENT_NAMES = {
    '222': '2x2x2',
    '333': '3x3x3',
    '444': '4x4x4',
    '555': '5x5x5',
    '666': '6x6x6',
    '777': '7x7x7',
    '333bf': '3x3x3 Blindfolded',
    '333oh': '3x3x3 One-Handed',
    'clock': 'Clock',
    'minx': 'Megaminx',
    'pyram': 'Pyraminx',
    'skewb': 'Skewb',
    'sq1': 'Square-1',
    '444bf': '4x4x4 Blindfolded',
    '555bf': '5x5x5 Blindfolded',
    '333mbf': '3x3x3 Multi-Blind'
};

// Plotly chart options
const chartConfig = {
    displayModeBar: true,
    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
    displaylogo: false,
    responsive: true
};

// Utility functions
function getEventName(eventId) {
    return EVENT_NAMES[eventId] || eventId;
}

function formatTime(seconds) {
    return seconds ? `${seconds.toFixed(2)}s` : '-';
}

// Today's date on this computer as YYYY-MM-DD, the way session dates are stored
function localToday() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// "1 solve", "12 solves", "57,660 solves"
function countLabel(count, noun) {
    return `${Number(count).toLocaleString('en-NZ')} ${noun}${count === 1 ? '' : 's'}`;
}

// Escape text before putting it into innerHTML. Anything that comes from the user or from an
// imported file (notes, cube names, scrambles, CSTimer session names) must go through this,
// so a crafted file can't inject HTML or script into the page.
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showError(message) {
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    alert(message);
}

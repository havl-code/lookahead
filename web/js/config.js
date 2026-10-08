// config.js: global configuration, constants and small shared helpers

// The JSON API served by the local Python server (app.py) that also serves this page.
const API_BASE = '/api';

// Every request to the API goes through this, with a path such as '/sessions'. It works just
// like fetch(), but adds the header the server requires on anything that changes your data. A
// form or script on another website can't send that header, which is part of how the app keeps
// other sites from changing your data (see "Security" in the README).
function apiFetch(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});
    if (method !== 'GET' && method !== 'HEAD') {
        headers.set('X-Requested-With', 'speedcube');
    }
    return fetch(`${API_BASE}${path}`, { ...options, method, headers });
}

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

// ---- Actions ----
// Buttons and links say what they do in a data-action attribute (data-change on menus and file
// pickers, data-submit on forms) instead of inline onclick handlers, which the page's
// Content-Security-Policy refuses to run. Each tab's script registers the actions it handles,
// and the three listeners below call them with the element (whose data-* attributes carry any
// details, such as a session id) and the event.
const Actions = { click: {}, change: {}, submit: {} };

function registerActions(kind, handlers) {
    Object.assign(Actions[kind], handlers);
}

document.addEventListener('click', (event) => {
    const element = event.target.closest('[data-action]');
    const handler = element && Actions.click[element.dataset.action];
    if (!handler) return;
    if (element.tagName === 'A') event.preventDefault();  // links with href="#" go nowhere
    handler(element, event);
});

document.addEventListener('change', (event) => {
    const element = event.target.closest('[data-change]');
    const handler = element && Actions.change[element.dataset.change];
    if (handler) handler(element, event);
});

document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-submit]');
    const handler = form && Actions.submit[form.dataset.submit];
    if (!handler) return;
    event.preventDefault();  // the page saves through the API, never by reloading
    handler(form, event);
});

function showError(message) {
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    alert(message);
}

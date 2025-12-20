// config.js - Global configuration and constants

// API Base URL
const API_BASE = 'http://localhost:5000/api';

// Global state variables
const AppState = {
    selectedFile: null,
    currentSessionId: null,
    currentEvent: '333',
    plotlyLoaded: false,
    chartsLoaded: false,
    allSessions: [],
    allCubes: []
};

// Color palette for charts
const COLORS = {
    primary: '#2563eb',      // Blue
    secondary: '#10b981',    // Green
    tertiary: '#f59e0b',     // Amber
    quaternary: '#8b5cf6',   // Purple
    danger: '#ef4444',       // Red
    gray: '#6b7280',         // Gray
    info: '#06b6d4'          // Cyan
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

// Chart configuration
const chartConfig = {
    displayModeBar: true,
    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
    displaylogo: false,
    responsive: true
};

const chartLayout = {
    font: { family: 'Montserrat', size: 12, color: '#000' },
    plot_bgcolor: '#ffffff',
    paper_bgcolor: '#ffffff',
    xaxis: { 
        gridcolor: '#e0e0e0', 
        showline: true, 
        linecolor: '#ccc', 
        linewidth: 1,
        type: 'linear'
    },
    yaxis: { 
        gridcolor: '#e0e0e0', 
        showline: true, 
        linecolor: '#ccc', 
        linewidth: 1,
        title: 'Time (seconds)'
    },
    margin: { l: 60, r: 30, t: 80, b: 60 },
    hovermode: 'closest'
};

// Utility functions
function getEventName(eventId) {
    return EVENT_NAMES[eventId] || eventId;
}

function formatTime(seconds) {
    return seconds ? `${seconds}s` : 'N/A';
}

function showError(message) {
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    alert(message);
}
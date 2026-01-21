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

// Color palette for charts - subtle, professional, color-blind friendly
// Used ONLY for data series in charts, not for UI elements
const COLORS = {
    primary: '#4A90E2',      // Soft blue - main data series
    secondary: '#6BA84F',    // Soft green - secondary series
    tertiary: '#D97706',     // Muted orange - tertiary series
    quaternary: '#7B68EE',   // Soft purple - quaternary series
    danger: '#E74C3C',       // Soft red - highlights/warnings
    gray: '#95A5A6',         // Neutral gray - reference lines
    info: '#4ECDC4'          // Soft teal - additional series
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

// API helper function
async function apiRequest(endpoint, options = {}) {
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Request failed' }));
            throw new Error(error.error || 'Request failed');
        }
        
        return await response.json();
    } catch (error) {
        throw error;
    }
}

// Generic sorting helper
function sortArray(array, column, direction, getValue) {
    return array.sort((a, b) => {
        const valA = getValue(a, column);
        const valB = getValue(b, column);
        
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function showError(message) {
    alert(`Error: ${message}`);
}

function showSuccess(message) {
    alert(message);
}
// theme.js: the light/dark mode toggle. Dark is the default; theme-init.js, loaded in
// index.html's <head>, applies the saved choice before the page is drawn.

function toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme;
    setTheme(currentTheme === 'light' ? 'dark' : 'light');
}

function setTheme(theme, redrawCharts = true) {
    document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem('theme', theme);
    } catch (e) {
        // Not being able to remember the choice is fine.
    }
    updateThemeIcon();

    // Charts pick their colours from the theme when they're drawn, so redraw any on screen.
    // (Charts elsewhere are redrawn anyway when their tab is next opened.)
    if (redrawCharts && AppState.plotlyLoaded &&
            document.getElementById('tab-analytics').classList.contains('active')) {
        renderAllCharts();
    }
}

// The button shows what it switches to: a sun in dark mode, a moon in light mode
function updateThemeIcon() {
    const dark = document.documentElement.dataset.theme !== 'light';
    document.getElementById('theme-icon-sun').style.display = dark ? 'block' : 'none';
    document.getElementById('theme-icon-moon').style.display = dark ? 'none' : 'block';
}

updateThemeIcon();

registerActions('click', { 'toggle-theme': () => toggleTheme() });

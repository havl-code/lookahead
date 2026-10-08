// theme-init.js: applies the saved theme (dark unless light was picked) before the page is
// drawn, so it never flashes the wrong colours. index.html loads it in <head>, ahead of the
// stylesheets' first paint; theme.js handles the toggle button once the page is up.
try {
    document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark';
} catch (e) {
    document.documentElement.dataset.theme = 'dark';
}

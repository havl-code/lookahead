// Sets light or dark mode before the page is drawn, so it never flashes the wrong one. The choice
// is saved in localStorage by src/lib/theme.ts, which keeps the mode up to date after this.
{
  let choice = null;
  try {
    choice = localStorage.getItem('lookahead-theme');
  } catch {
    // Storage can be blocked, such as in some private windows. The phone's setting decides.
  }
  // Dark unless light is chosen, or the phone is set to light and nothing is chosen
  const light =
    choice === 'light' ||
    (choice !== 'dark' && window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  // The same colours as --surface in src/styles/index.css
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', light ? '#f6f6f7' : '#0f0f11');
}

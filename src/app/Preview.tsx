/** Where Lookahead for phones is up to, shown on each tab until that tab is built. */
export const repoUrl = 'https://github.com/havl-code/lookahead';

export function Preview({ children }: { readonly children: string }) {
  return (
    <section className="mt-6 rounded-xl border border-line bg-raised p-4">
      <h2 className="font-semibold">Coming soon</h2>
      <p className="mt-1 text-muted">{children}</p>
      <p className="mt-3 text-muted">
        This is an early preview of Lookahead for phones. Until it's ready, use the{' '}
        <a
          href={repoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent-ink underline underline-offset-2"
        >
          desktop app
        </a>
        .
      </p>
    </section>
  );
}
